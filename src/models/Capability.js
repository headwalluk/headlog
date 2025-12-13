/**
 * Capability Model
 * Handles capability queries and management
 */

const { getPool } = require('../config/database');

/**
 * Create a new capability
 * @param {Object} capabilityData - Capability information
 * @param {string} capabilityData.name - Unique capability name (e.g., 'logs:read')
 * @param {string} capabilityData.description - Human-readable description
 * @param {string} capabilityData.category - Category (logs, users, roles, etc.)
 * @param {boolean} capabilityData.is_dangerous - Whether this is a dangerous operation (default: false)
 * @returns {Promise<Object>} Created capability with id
 */
async function createCapability({ name, description, category, is_dangerous = false }) {
  const pool = getPool();

  // Validate required fields
  if (!name || !description || !category) {
    throw new Error('Capability name, description, and category are required');
  }

  // Check for duplicate name
  const [existing] = await pool.query('SELECT id FROM capabilities WHERE name = ?', [name]);

  if (existing.length > 0) {
    throw new Error(`Capability '${name}' already exists`);
  }

  const [result] = await pool.query(
    `INSERT INTO capabilities (name, description, category, is_dangerous, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [name, description, category, is_dangerous ? 1 : 0]
  );

  return {
    id: result.insertId,
    name,
    description,
    category,
    is_dangerous,
    created_at: new Date()
  };
}

/**
 * Find capability by ID
 * @param {number} capabilityId - Capability ID
 * @returns {Promise<Object|null>} Capability object or null if not found
 */
async function findById(capabilityId) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM capabilities WHERE id = ?', [capabilityId]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find capability by name
 * @param {string} name - Capability name (e.g., 'logs:read')
 * @returns {Promise<Object|null>} Capability object or null if not found
 */
async function findByName(name) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM capabilities WHERE name = ?', [name]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find all capabilities in a category
 * @param {string} category - Category name (e.g., 'logs', 'users')
 * @returns {Promise<Array>} Array of capability objects
 */
async function findByCategory(category) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM capabilities WHERE category = ? ORDER BY name', [
    category
  ]);

  return rows;
}

/**
 * Get all capabilities assigned to a role
 * @param {number} roleId - Role ID
 * @returns {Promise<Array>} Array of capability objects
 */
async function findByRole(roleId) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT c.*
     FROM capabilities c
     INNER JOIN role_capabilities rc ON c.id = rc.capability_id
     WHERE rc.role_id = ?
     ORDER BY c.category, c.name`,
    [roleId]
  );

  return rows;
}

/**
 * Get all capabilities for a user (via their roles)
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of unique capability objects
 */
async function findByUserId(userId) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT DISTINCT c.*
     FROM capabilities c
     INNER JOIN role_capabilities rc ON c.id = rc.capability_id
     INNER JOIN user_roles ur ON rc.role_id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY c.category, c.name`,
    [userId]
  );

  return rows;
}

/**
 * List all capabilities with optional filtering
 * @param {Object} options - Query options
 * @param {string} options.category - Filter by category
 * @param {boolean} options.dangerousOnly - Only return dangerous capabilities
 * @param {number} options.limit - Max results to return
 * @param {number} options.offset - Results to skip (for pagination)
 * @returns {Promise<Array>} Array of capability objects
 */
async function listCapabilities(options = {}) {
  const pool = getPool();

  const { category = null, dangerousOnly = false, limit = 100, offset = 0 } = options;

  let query = 'SELECT * FROM capabilities';
  const params = [];
  const conditions = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  if (dangerousOnly) {
    conditions.push('is_dangerous = 1');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY category, name LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  return rows;
}

/**
 * Get all unique categories
 * @returns {Promise<Array>} Array of category names
 */
async function getCategories() {
  const pool = getPool();

  const [rows] = await pool.query('SELECT DISTINCT category FROM capabilities ORDER BY category');

  return rows.map(row => row.category);
}

/**
 * Update capability details
 * @param {number} capabilityId - Capability ID to update
 * @param {Object} updates - Fields to update
 * @param {string} updates.description - New description
 * @param {string} updates.category - New category
 * @param {boolean} updates.is_dangerous - New dangerous flag
 * @returns {Promise<Object>} Updated capability
 */
async function updateCapability(capabilityId, updates) {
  const pool = getPool();

  // Verify capability exists
  const capability = await findById(capabilityId);
  if (!capability) {
    throw new Error(`Capability ID ${capabilityId} not found`);
  }

  // Validate and prepare updates
  const allowedFields = ['description', 'category', 'is_dangerous'];
  const updateFields = [];
  const updateValues = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === 'is_dangerous') {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field] ? 1 : 0);
      } else {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  updateValues.push(capabilityId);

  await pool.query(`UPDATE capabilities SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

  return await findById(capabilityId);
}

/**
 * Delete a capability (and all role assignments via CASCADE)
 * Note: Use with caution as this affects all roles
 * @param {number} capabilityId - Capability ID to delete
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteCapability(capabilityId) {
  const pool = getPool();

  // Verify capability exists
  const capability = await findById(capabilityId);
  if (!capability) {
    throw new Error(`Capability ID ${capabilityId} not found`);
  }

  const [result] = await pool.query('DELETE FROM capabilities WHERE id = ?', [capabilityId]);

  return result.affectedRows > 0;
}

/**
 * Get count of roles that have this capability
 * @param {number} capabilityId - Capability ID
 * @returns {Promise<number>} Count of roles
 */
async function getRoleCount(capabilityId) {
  const pool = getPool();

  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM role_capabilities WHERE capability_id = ?',
    [capabilityId]
  );

  return rows[0].count;
}

module.exports = {
  createCapability,
  findById,
  findByName,
  findByCategory,
  findByRole,
  findByUserId,
  listCapabilities,
  getCategories,
  updateCapability,
  deleteCapability,
  getRoleCount
};
