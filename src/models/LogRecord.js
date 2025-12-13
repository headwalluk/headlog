/**
 * LogRecord Model
 * Handles read-only operations for querying and viewing log records
 */

const { getPool } = require('../config/database');

/**
 * Search and filter log records
 * @param {Object} filters - Query filters
 * @param {number} filters.website - Website ID filter
 * @param {number} filters.host - Host ID filter
 * @param {string} filters.type - Log type filter ('access' or 'error')
 * @param {number} filters.code - HTTP code ID filter
 * @param {string} filters.remote - Remote IP address filter
 * @param {string} filters.from - Start date/time (ISO 8601)
 * @param {string} filters.to - End date/time (ISO 8601)
 * @param {string} filters.search - Full-text search in raw_data
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 50, max: 500)
 * @returns {Promise<Object>} { logs: Array, total: number, page: number, limit: number }
 */
async function searchLogs(filters = {}) {
  const {
    website = null,
    host = null,
    type = null,
    code = null,
    remote = null,
    from = null,
    to = null,
    search = null,
    page = 1,
    limit = 50
  } = filters;

  const pool = getPool();
  
  // Validate and constrain limit
  const actualLimit = Math.min(Math.max(1, parseInt(limit) || 50), 500);
  const actualPage = Math.max(1, parseInt(page) || 1);
  const offset = (actualPage - 1) * actualLimit;

  // Set default date range if not provided (last 7 days)
  const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  // Build WHERE clause dynamically
  const whereConditions = ['lr.timestamp BETWEEN ? AND ?'];
  const queryParams = [fromDate, toDate];

  if (website) {
    whereConditions.push('lr.website_id = ?');
    queryParams.push(parseInt(website));
  }

  if (host) {
    whereConditions.push('lr.host_id = ?');
    queryParams.push(parseInt(host));
  }

  if (type && (type === 'access' || type === 'error')) {
    whereConditions.push('lr.log_type = ?');
    queryParams.push(type);
  }

  if (code) {
    whereConditions.push('lr.code_id = ?');
    queryParams.push(parseInt(code));
  }

  if (remote) {
    whereConditions.push('lr.remote LIKE ?');
    queryParams.push(`%${remote}%`);
  }

  if (search) {
    whereConditions.push('lr.raw_data LIKE ?');
    queryParams.push(`%${search}%`);
  }

  const whereClause = whereConditions.join(' AND ');

  try {
    // Get total count for pagination
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM log_records lr 
       WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // Get paginated results
    const [logs] = await pool.query(
      `SELECT 
        lr.id,
        lr.log_type,
        lr.timestamp,
        lr.remote,
        lr.raw_data,
        w.domain as website_name,
        w.id as website_id,
        h.hostname,
        h.id as host_id,
        c.code,
        c.description as code_description
      FROM log_records lr
      INNER JOIN websites w ON lr.website_id = w.id
      INNER JOIN hosts h ON lr.host_id = h.id
      INNER JOIN http_codes c ON lr.code_id = c.id
      WHERE ${whereClause}
      ORDER BY lr.timestamp DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, actualLimit, offset]
    );

    // Parse raw_data JSON for each log
    const parsedLogs = logs.map(log => {
      try {
        log.parsed_data = JSON.parse(log.raw_data);
      } catch (e) {
        log.parsed_data = null;
      }
      return log;
    });

    return {
      logs: parsedLogs,
      total,
      page: actualPage,
      limit: actualLimit,
      totalPages: Math.ceil(total / actualLimit)
    };
  } catch (error) {
    console.error('Error searching logs:', error);
    throw error;
  }
}

/**
 * Get a single log record by ID
 * @param {number} id - Log record ID
 * @returns {Promise<Object|null>} Log record with parsed data
 */
async function findById(id) {
  const pool = getPool();

  try {
    const [logs] = await pool.query(
      `SELECT 
        lr.id,
        lr.log_type,
        lr.timestamp,
        lr.remote,
        lr.raw_data,
        lr.created_at,
        lr.archived_at,
        w.domain as website_name,
        w.id as website_id,
        h.hostname,
        h.id as host_id,
        c.code,
        c.description as code_description
      FROM log_records lr
      INNER JOIN websites w ON lr.website_id = w.id
      INNER JOIN hosts h ON lr.host_id = h.id
      INNER JOIN http_codes c ON lr.code_id = c.id
      WHERE lr.id = ?`,
      [id]
    );

    if (logs.length === 0) {
      return null;
    }

    const log = logs[0];
    
    // Parse raw_data JSON
    try {
      log.parsed_data = JSON.parse(log.raw_data);
    } catch (e) {
      log.parsed_data = null;
    }

    return log;
  } catch (error) {
    console.error('Error finding log by ID:', error);
    throw error;
  }
}

/**
 * Get filter options for dropdowns
 * @returns {Promise<Object>} Available filter options
 */
async function getFilterOptions() {
  const pool = getPool();

  try {
    const [websites] = await pool.query(
      'SELECT id, domain FROM websites ORDER BY domain'
    );

    const [hosts] = await pool.query(
      'SELECT id, hostname FROM hosts ORDER BY hostname'
    );

    const [codes] = await pool.query(
      'SELECT id, code, description FROM http_codes ORDER BY code'
    );

    // Group codes by category
    const codesByCategory = {
      '2xx': codes.filter(c => c.code >= 200 && c.code < 300),
      '3xx': codes.filter(c => c.code >= 300 && c.code < 400),
      '4xx': codes.filter(c => c.code >= 400 && c.code < 500),
      '5xx': codes.filter(c => c.code >= 500 && c.code < 600)
    };

    return {
      websites,
      hosts,
      codes,
      codesByCategory
    };
  } catch (error) {
    console.error('Error getting filter options:', error);
    throw error;
  }
}

module.exports = {
  searchLogs,
  findById,
  getFilterOptions
};
