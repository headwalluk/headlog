/**
 * Audit Service
 * Handles audit logging for security and compliance
 */

const { getPool } = require('../config/database');

/**
 * Log an action to the audit log
 * @param {Object} auditData - Audit log entry data
 * @param {number|null} auditData.user_id - User ID who performed the action (null for system actions)
 * @param {number|null} auditData.api_key_id - API key ID if action was via API key
 * @param {string} auditData.action - Action performed (e.g., 'user.created', 'role.assigned')
 * @param {string} auditData.resource_type - Type of resource affected (e.g., 'user', 'role', 'log')
 * @param {number|string|null} auditData.resource_id - ID of the affected resource
 * @param {Object} auditData.details - Additional details (stored as JSON)
 * @param {string|null} auditData.ip_address - IP address of the requester
 * @param {string|null} auditData.user_agent - User agent string
 * @returns {Promise<number>} Audit log entry ID
 */
async function logAction({
  user_id = null,
  api_key_id = null,
  action,
  resource_type,
  resource_id = null,
  details = {},
  ip_address = null,
  user_agent = null
}) {
  const pool = getPool();

  if (!action || !resource_type) {
    throw new Error('Action and resource_type are required for audit logging');
  }

  const [result] = await pool.query(
    `INSERT INTO audit_log 
     (user_id, api_key_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      user_id,
      api_key_id,
      action,
      resource_type,
      resource_id,
      JSON.stringify(details),
      ip_address,
      user_agent
    ]
  );

  return result.insertId;
}

/**
 * Query audit log with filters and pagination
 * @param {Object} filters - Query filters
 * @param {number} filters.user_id - Filter by user ID
 * @param {number} filters.api_key_id - Filter by API key ID
 * @param {string} filters.action - Filter by action (exact match or prefix with wildcard)
 * @param {string} filters.resource_type - Filter by resource type
 * @param {number|string} filters.resource_id - Filter by resource ID
 * @param {Date} filters.start_date - Filter entries after this date
 * @param {Date} filters.end_date - Filter entries before this date
 * @param {string} filters.ip_address - Filter by IP address
 * @param {number} filters.limit - Max results to return (default: 100)
 * @param {number} filters.offset - Results to skip (default: 0)
 * @param {string} filters.order_by - Sort field (default: 'created_at')
 * @param {string} filters.order_dir - Sort direction: 'ASC' or 'DESC' (default: 'DESC')
 * @returns {Promise<Object>} { entries: Array, total: number }
 */
async function queryAuditLog(filters = {}) {
  const pool = getPool();

  const {
    user_id = null,
    api_key_id = null,
    action = null,
    resource_type = null,
    resource_id = null,
    start_date = null,
    end_date = null,
    ip_address = null,
    limit = 100,
    offset = 0,
    order_by = 'created_at',
    order_dir = 'DESC'
  } = filters;

  // Build WHERE conditions
  const conditions = [];
  const params = [];

  if (user_id !== null) {
    conditions.push('user_id = ?');
    params.push(user_id);
  }

  if (api_key_id !== null) {
    conditions.push('api_key_id = ?');
    params.push(api_key_id);
  }

  if (action) {
    if (action.includes('%')) {
      conditions.push('action LIKE ?');
      params.push(action);
    } else {
      conditions.push('action = ?');
      params.push(action);
    }
  }

  if (resource_type) {
    conditions.push('resource_type = ?');
    params.push(resource_type);
  }

  if (resource_id !== null) {
    conditions.push('resource_id = ?');
    params.push(resource_id);
  }

  if (start_date) {
    conditions.push('created_at >= ?');
    params.push(start_date);
  }

  if (end_date) {
    conditions.push('created_at <= ?');
    params.push(end_date);
  }

  if (ip_address) {
    conditions.push('ip_address = ?');
    params.push(ip_address);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Validate order_by field to prevent SQL injection
  const allowedOrderBy = ['id', 'user_id', 'action', 'resource_type', 'created_at'];
  const safeOrderBy = allowedOrderBy.includes(order_by) ? order_by : 'created_at';
  const safeOrderDir = order_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Get total count
  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM audit_log ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // Get entries with pagination
  const [entries] = await pool.query(
    `SELECT * FROM audit_log ${whereClause} 
     ORDER BY ${safeOrderBy} ${safeOrderDir} 
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Parse JSON details field
  const parsedEntries = entries.map(entry => ({
    ...entry,
    details: typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details
  }));

  return {
    entries: parsedEntries,
    total,
    limit,
    offset
  };
}

/**
 * Get recent audit log entries for a user
 * @param {number} userId - User ID
 * @param {number} limit - Max results (default: 50)
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getUserRecentActivity(userId, limit = 50) {
  const result = await queryAuditLog({
    user_id: userId,
    limit,
    offset: 0,
    order_by: 'created_at',
    order_dir: 'DESC'
  });

  return result.entries;
}

/**
 * Get audit trail for a specific resource
 * @param {string} resourceType - Resource type
 * @param {number|string} resourceId - Resource ID
 * @param {number} limit - Max results (default: 100)
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getResourceAuditTrail(resourceType, resourceId, limit = 100) {
  const result = await queryAuditLog({
    resource_type: resourceType,
    resource_id: resourceId,
    limit,
    offset: 0,
    order_by: 'created_at',
    order_dir: 'ASC' // Chronological order for audit trail
  });

  return result.entries;
}

/**
 * Delete old audit log entries (for compliance/retention)
 * @param {Date} beforeDate - Delete entries before this date
 * @returns {Promise<number>} Number of entries deleted
 */
async function pruneAuditLog(beforeDate) {
  const pool = getPool();

  const [result] = await pool.query('DELETE FROM audit_log WHERE created_at < ?', [beforeDate]);

  return result.affectedRows;
}

/**
 * Get audit log statistics
 * @param {Object} filters - Time range filters
 * @param {Date} filters.start_date - Start date
 * @param {Date} filters.end_date - End date
 * @returns {Promise<Object>} Statistics object
 */
async function getAuditStats(filters = {}) {
  const pool = getPool();

  const { start_date = null, end_date = null } = filters;
  const conditions = [];
  const params = [];

  if (start_date) {
    conditions.push('created_at >= ?');
    params.push(start_date);
  }

  if (end_date) {
    conditions.push('created_at <= ?');
    params.push(end_date);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Total entries
  const [totalRows] = await pool.query(
    `SELECT COUNT(*) as total FROM audit_log ${whereClause}`,
    params
  );

  // By action prefix
  const [actionRows] = await pool.query(
    `SELECT 
       SUBSTRING_INDEX(action, '.', 1) as action_category,
       COUNT(*) as count
     FROM audit_log ${whereClause}
     GROUP BY action_category
     ORDER BY count DESC`,
    params
  );

  // By resource type
  const [resourceRows] = await pool.query(
    `SELECT resource_type, COUNT(*) as count
     FROM audit_log ${whereClause}
     GROUP BY resource_type
     ORDER BY count DESC`,
    params
  );

  // Top users
  const [userRows] = await pool.query(
    `SELECT user_id, COUNT(*) as count
     FROM audit_log ${whereClause}
     AND user_id IS NOT NULL
     GROUP BY user_id
     ORDER BY count DESC
     LIMIT 10`,
    params
  );

  return {
    total: totalRows[0].total,
    by_action_category: actionRows,
    by_resource_type: resourceRows,
    top_users: userRows
  };
}

module.exports = {
  logAction,
  queryAuditLog,
  getUserRecentActivity,
  getResourceAuditTrail,
  pruneAuditLog,
  getAuditStats
};
