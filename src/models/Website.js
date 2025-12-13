/**
 * Website Model
 * Handles website operations including creation, updates, and queries
 */

const { getPool } = require('../config/database');
const auditService = require('../services/auditService');

/**
 * Create new website
 * @param {Object} websiteData - { domain, is_ssl, is_dev, owner_email, admin_email, created_by, ip_address }
 * @returns {Promise<Object>} Created website object
 */
async function createWebsite(websiteData) {
  const {
    domain,
    is_ssl = true,
    is_dev = false,
    owner_email = null,
    admin_email = null,
    created_by = null,
    ip_address = null
  } = websiteData;

  // Validate domain
  if (!domain || domain.trim().length === 0) {
    throw new Error('Domain is required');
  }

  // Basic domain format validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!domainRegex.test(domain)) {
    throw new Error('Invalid domain format');
  }

  const pool = getPool();

  try {
    const [result] = await pool.query(
      `INSERT INTO websites (domain, is_ssl, is_dev, owner_email, admin_email, last_activity_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [domain, is_ssl, is_dev, owner_email, admin_email]
    );

    const websiteId = result.insertId;

    // Audit log: website created
    await auditService.logAction({
      user_id: created_by,
      action: 'website.created',
      resource_type: 'website',
      resource_id: websiteId,
      details: {
        domain,
        is_ssl,
        is_dev,
        owner_email,
        admin_email
      },
      ip_address
    });

    // Return created website
    return {
      id: websiteId,
      domain,
      is_ssl,
      is_dev,
      owner_email,
      admin_email,
      last_activity_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };
  } catch (error) {
    // Handle duplicate domain
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('Domain already exists');
    }
    throw error;
  }
}

/**
 * Find website by ID
 * @param {number} id - Website ID
 * @returns {Promise<Object|null>} Website object or null
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, domain, is_ssl, is_dev, owner_email, admin_email,
            last_activity_at, created_at, updated_at
     FROM websites 
     WHERE id = ?`,
    [id]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find website by domain
 * @param {string} domain - Domain name
 * @returns {Promise<Object|null>} Website object or null
 */
async function findByDomain(domain) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, domain, is_ssl, is_dev, owner_email, admin_email,
            last_activity_at, created_at, updated_at
     FROM websites 
     WHERE domain = ?`,
    [domain]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * List websites with optional filters and pagination
 * @param {Object} options - { search, limit, offset }
 * @returns {Promise<Array>} Array of website objects
 */
async function listWebsites({ search = null, limit = 25, offset = 0 } = {}) {
  const pool = getPool();
  const params = [];
  let query = `
    SELECT id, domain, is_ssl, is_dev, owner_email, admin_email,
           last_activity_at, created_at, updated_at
    FROM websites
  `;

  if (search) {
    query += ' WHERE domain LIKE ?';
    params.push(`%${search}%`);
  }

  query += ' ORDER BY domain ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  return rows;
}

/**
 * Get total count of websites (for pagination)
 * @param {Object} filters - { search }
 * @returns {Promise<number>} Total count
 */
async function getWebsiteCount(filters = {}) {
  const pool = getPool();
  const params = [];
  let query = 'SELECT COUNT(*) as count FROM websites';

  if (filters.search) {
    query += ' WHERE domain LIKE ?';
    params.push(`%${filters.search}%`);
  }

  const [rows] = await pool.query(query, params);
  return rows[0].count;
}

/**
 * Update website
 * @param {number} id - Website ID
 * @param {Object} updates - Fields to update
 * @param {Object} auditInfo - { user_id, ip_address }
 * @returns {Promise<Object>} Updated website object
 */
async function updateWebsite(id, updates, auditInfo = {}) {
  const { user_id = null, ip_address = null } = auditInfo;

  const allowedFields = ['domain', 'is_ssl', 'is_dev', 'owner_email', 'admin_email'];
  const setClause = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClause.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(id);

  const pool = getPool();

  try {
    const [result] = await pool.query(
      `UPDATE websites SET ${setClause.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      throw new Error('Website not found');
    }

    // Audit log: website updated
    await auditService.logAction({
      user_id,
      action: 'website.updated',
      resource_type: 'website',
      resource_id: id,
      details: updates,
      ip_address
    });

    // Return updated website
    return await findById(id);
  } catch (error) {
    // Handle duplicate domain
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('Domain already exists');
    }
    throw error;
  }
}

/**
 * Delete website
 * @param {number} id - Website ID
 * @param {Object} auditInfo - { user_id, ip_address }
 * @returns {Promise<boolean>} True if deleted
 */
async function deleteWebsite(id, auditInfo = {}) {
  const { user_id = null, ip_address = null } = auditInfo;

  const pool = getPool();

  // Get website details before deletion (for audit log)
  const website = await findById(id);
  if (!website) {
    throw new Error('Website not found');
  }

  const [result] = await pool.query('DELETE FROM websites WHERE id = ?', [id]);

  if (result.affectedRows === 0) {
    throw new Error('Website not found');
  }

  // Audit log: website deleted
  await auditService.logAction({
    user_id,
    action: 'website.deleted',
    resource_type: 'website',
    resource_id: id,
    details: {
      domain: website.domain,
      owner_email: website.owner_email,
      admin_email: website.admin_email
    },
    ip_address
  });

  return true;
}

/**
 * Get log count for website
 * @param {number} id - Website ID
 * @returns {Promise<number>} Total log records
 */
async function getLogCount(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM log_records WHERE website_id = ?',
    [id]
  );
  return rows[0].count;
}

/**
 * Get recent logs for website
 * @param {number} id - Website ID
 * @param {number} limit - Number of logs to return
 * @returns {Promise<Array>} Array of log records
 */
async function getRecentLogs(id, limit = 10) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, log_type, timestamp, code_id, remote, created_at
     FROM log_records 
     WHERE website_id = ? 
     ORDER BY timestamp DESC 
     LIMIT ?`,
    [id, limit]
  );
  return rows;
}

module.exports = {
  createWebsite,
  findById,
  findByDomain,
  listWebsites,
  getWebsiteCount,
  updateWebsite,
  deleteWebsite,
  getLogCount,
  getRecentLogs
};
