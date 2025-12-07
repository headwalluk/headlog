const { getPool } = require('../config/database');

/**
 * Find website by domain, create if doesn't exist
 * @param {string} domain
 * @returns {Promise<number>} Website ID
 */
async function findOrCreateWebsite(domain) {
  const pool = getPool();

  // Try to find existing website
  const [rows] = await pool.query('SELECT id FROM websites WHERE domain = ?', [domain]);

  if (rows.length > 0) {
    return rows[0].id;
  }

  // Create new website
  const [result] = await pool.query(
    'INSERT INTO websites (domain, last_activity_at) VALUES (?, NOW())',
    [domain]
  );

  console.log(`✓ Auto-created website: ${domain} (ID: ${result.insertId})`);

  return result.insertId;
}

/**
 * Update website last_activity_at timestamp
 * @param {number} websiteId
 * @returns {Promise<void>}
 */
async function updateWebsiteActivity(websiteId) {
  const pool = getPool();

  await pool.query('UPDATE websites SET last_activity_at = NOW() WHERE id = ?', [websiteId]);
}

/**
 * Get all websites with optional filtering
 * @param {Object} options
 * @param {boolean} options.activeOnly - Filter to only recently active websites
 * @param {number} options.limit - Pagination limit
 * @param {number} options.offset - Pagination offset
 * @returns {Promise<Array>}
 */
async function getWebsites({ activeOnly = false, limit = 100, offset = 0 } = {}) {
  const pool = getPool();

  let query = 'SELECT * FROM websites';
  const params = [];

  if (activeOnly) {
    query += ' WHERE last_activity_at > DATE_SUB(NOW(), INTERVAL 7 DAY)';
  }

  query += ' ORDER BY last_activity_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);

  return rows;
}

/**
 * Get website by domain
 * @param {string} domain
 * @returns {Promise<Object|null>}
 */
async function getWebsiteByDomain(domain) {
  const pool = getPool();

  const [rows] = await pool.query('SELECT * FROM websites WHERE domain = ?', [domain]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Update website metadata
 * @param {string} domain
 * @param {Object} updates
 * @returns {Promise<boolean>} True if updated, false if not found
 */
async function updateWebsite(domain, updates) {
  const pool = getPool();

  const allowedFields = ['is_ssl', 'is_dev', 'owner_email', 'admin_email'];
  const setClause = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClause.length === 0) {
    return false;
  }

  values.push(domain);

  const [result] = await pool.query(
    `UPDATE websites SET ${setClause.join(', ')} WHERE domain = ?`,
    values
  );

  return result.affectedRows > 0;
}

/**
 * Delete website and cascade delete log records
 * @param {string} domain
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteWebsite(domain) {
  const pool = getPool();

  const [result] = await pool.query('DELETE FROM websites WHERE domain = ?', [domain]);

  return result.affectedRows > 0;
}

module.exports = {
  findOrCreateWebsite,
  updateWebsiteActivity,
  getWebsites,
  getWebsiteByDomain,
  updateWebsite,
  deleteWebsite
};
