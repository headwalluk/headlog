/**
 * Role Model
 * Handles role management and role-capability relationships
 */

const { getPool } = require('../config/database');

/**
 * Create a new role
 * @param {Object} roleData - Role information
 * @param {string} roleData.name - Unique role name (e.g., 'content-editor')
 * @param {string} roleData.description - Human-readable description
 * @param {boolean} roleData.is_system - Whether this is a system role (default: false)
 * @returns {Promise<Object>} Created role with id
 */
async function createRole({ name, description, is_system = false }) {
  const pool = getPool();

  // Validate required fields
  if (!name || !description) {
    throw new Error('Role name and description are required');
  }

  // Check for duplicate name
  const [existing] = await pool.query('SELECT id FROM roles WHERE name = ?', [name]);

  if (existing.length > 0) {
    throw new Error(`Role '${name}' already exists`);
  }

  const [result] = await pool.query(
    `INSERT INTO roles (name, description, is_system, created_at)
     VALUES (?, ?, ?, NOW())`,
    [name, description, is_system ? 1 : 0]
  );

  return {
    id: result.insertId,
    name,
    description,
    is_system,
    created_at: new Date()
  };
}

/**
 * Find role by ID
 * @param {number} roleId - Role ID
 * @returns {Promise<Object|null>} Role object or null if not found
 */
async function findById(roleId) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM roles WHERE id = ?', [roleId]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find role by name
 * @param {string} name - Role name
 * @returns {Promise<Object|null>} Role object or null if not found
 */
async function findByName(name) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM roles WHERE name = ?', [name]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all roles assigned to a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of role objects with assignment details
 */
async function findByUserId(userId) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT r.*, ur.assigned_at, ur.assigned_by
     FROM roles r
     INNER JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = ?
     ORDER BY r.name`,
    [userId]
  );

  return rows;
}

/**
 * List all roles with optional filtering
 * @param {Object} options - Query options
 * @param {boolean} options.includeSystemRoles - Include system roles (default: true)
 * @param {number} options.limit - Max results to return
 * @param {number} options.offset - Results to skip (for pagination)
 * @returns {Promise<Array>} Array of role objects
 */
async function listRoles(options = {}) {
  const pool = getPool();

  const { includeSystemRoles = true, limit = 100, offset = 0 } = options;

  let query = 'SELECT * FROM roles';
  const params = [];

  if (!includeSystemRoles) {
    query += ' WHERE is_system = 0';
  }

  query += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  return rows;
}

/**
 * Update role details
 * @param {number} roleId - Role ID to update
 * @param {Object} updates - Fields to update
 * @param {string} updates.name - New role name
 * @param {string} updates.description - New description
 * @returns {Promise<Object>} Updated role
 */
async function updateRole(roleId, updates) {
  const pool = getPool();

  // Verify role exists
  const role = await findById(roleId);
  if (!role) {
    throw new Error(`Role ID ${roleId} not found`);
  }

  // Prevent modification of system roles
  if (role.is_system) {
    throw new Error('Cannot modify system roles');
  }

  // Validate and prepare updates
  const allowedFields = ['name', 'description'];
  const updateFields = [];
  const updateValues = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      updateValues.push(updates[field]);
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  // Check for duplicate name if changing name
  if (updates.name && updates.name !== role.name) {
    const [existing] = await pool.query('SELECT id FROM roles WHERE name = ? AND id != ?', [
      updates.name,
      roleId
    ]);

    if (existing.length > 0) {
      throw new Error(`Role '${updates.name}' already exists`);
    }
  }

  // Add updated_at timestamp
  updateFields.push('updated_at = NOW()');
  updateValues.push(roleId);

  await pool.query(`UPDATE roles SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

  return await findById(roleId);
}

/**
 * Delete a role (and all assignments via CASCADE)
 * @param {number} roleId - Role ID to delete
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteRole(roleId) {
  const pool = getPool();

  // Verify role exists
  const role = await findById(roleId);
  if (!role) {
    throw new Error(`Role ID ${roleId} not found`);
  }

  // Prevent deletion of system roles
  if (role.is_system) {
    throw new Error('Cannot delete system roles');
  }

  const [result] = await pool.query('DELETE FROM roles WHERE id = ?', [roleId]);

  return result.affectedRows > 0;
}

/**
 * Get all capabilities assigned to a role
 * @param {number} roleId - Role ID
 * @returns {Promise<Array>} Array of capability objects with grant details
 */
async function getCapabilities(roleId) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT c.*, rc.granted_at, rc.granted_by
     FROM capabilities c
     INNER JOIN role_capabilities rc ON c.id = rc.capability_id
     WHERE rc.role_id = ?
     ORDER BY c.category, c.name`,
    [roleId]
  );

  return rows;
}

/**
 * Grant a capability to a role
 * @param {number} roleId - Role ID
 * @param {number} capabilityId - Capability ID
 * @param {number} grantedBy - User ID who granted this capability
 * @returns {Promise<boolean>} True if granted (false if already assigned)
 */
async function grantCapability(roleId, capabilityId, grantedBy) {
  const pool = getPool();

  // Verify role exists
  const role = await findById(roleId);
  if (!role) {
    throw new Error(`Role ID ${roleId} not found`);
  }

  // Check if already assigned
  const [existing] = await pool.query(
    'SELECT 1 FROM role_capabilities WHERE role_id = ? AND capability_id = ?',
    [roleId, capabilityId]
  );

  if (existing.length > 0) {
    return false; // Already assigned
  }

  await pool.query(
    `INSERT INTO role_capabilities (role_id, capability_id, granted_at, granted_by)
     VALUES (?, ?, NOW(), ?)`,
    [roleId, capabilityId, grantedBy]
  );

  return true;
}

/**
 * Revoke a capability from a role
 * @param {number} roleId - Role ID
 * @param {number} capabilityId - Capability ID
 * @returns {Promise<boolean>} True if revoked
 */
async function revokeCapability(roleId, capabilityId) {
  const pool = getPool();

  const [result] = await pool.query(
    'DELETE FROM role_capabilities WHERE role_id = ? AND capability_id = ?',
    [roleId, capabilityId]
  );

  return result.affectedRows > 0;
}

/**
 * Get count of users assigned to this role
 * @param {number} roleId - Role ID
 * @returns {Promise<number>} Count of users
 */
async function getUserCount(roleId) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?', [
    roleId
  ]);

  return rows[0].count;
}

module.exports = {
  createRole,
  findById,
  findByName,
  findByUserId,
  listRoles,
  updateRole,
  deleteRole,
  getCapabilities,
  grantCapability,
  revokeCapability,
  getUserCount
};
