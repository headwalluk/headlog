/**
 * Host Model
 * Handles database operations for hosts
 */

const { getPool } = require('../config/database');
const auditService = require('../services/auditService');

class Host {
  /**
   * Create a new host
   * @param {Object} data - Host data
   * @param {string} data.hostname - Hostname
   * @param {number} data.created_by - User ID who created the host
   * @param {string} data.ip_address - IP address of the requester
   * @returns {Promise<Object>} Created host object
   */
  static async createHost(data) {
    const pool = getPool();
    const { hostname, created_by, ip_address } = data;

    // Validate hostname
    if (!hostname || hostname.trim().length === 0) {
      throw new Error('Hostname is required');
    }

    // Check for duplicate hostname
    const [existing] = await pool.query(
      'SELECT id FROM hosts WHERE hostname = ?',
      [hostname.trim()]
    );

    if (existing.length > 0) {
      throw new Error('A host with this hostname already exists');
    }

    // Insert host
    const [result] = await pool.query(
      'INSERT INTO hosts (hostname, first_seen_at, last_seen_at) VALUES (?, NOW(), NOW())',
      [hostname.trim()]
    );

    // Log to audit
    await auditService.logAction({
      user_id: created_by,
      action: 'host.created',
      resource_type: 'host',
      resource_id: result.insertId,
      details: { hostname: hostname.trim() },
      ip_address
    });

    return {
      id: result.insertId,
      hostname: hostname.trim(),
      first_seen_at: new Date(),
      last_seen_at: new Date()
    };
  }

  /**
   * Find host by ID
   * @param {number} id - Host ID
   * @returns {Promise<Object|null>} Host object or null
   */
  static async findById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT * FROM hosts WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Find host by hostname
   * @param {string} hostname - Hostname
   * @returns {Promise<Object|null>} Host object or null
   */
  static async findByHostname(hostname) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT * FROM hosts WHERE hostname = ?',
      [hostname]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * List hosts with pagination and search
   * @param {Object} options - Query options
   * @param {string} options.search - Search term for hostname
   * @param {number} options.limit - Results per page
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Array of host objects
   */
  static async listHosts(options = {}) {
    const pool = getPool();
    const { search, limit = 25, offset = 0 } = options;

    let query = 'SELECT * FROM hosts WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND hostname LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY hostname ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Get total count of hosts
   * @param {Object} filters - Filter options
   * @param {string} filters.search - Search term for hostname
   * @returns {Promise<number>} Total count
   */
  static async getHostCount(filters = {}) {
    const pool = getPool();
    const { search } = filters;

    let query = 'SELECT COUNT(*) as count FROM hosts WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND hostname LIKE ?';
      params.push(`%${search}%`);
    }

    const [rows] = await pool.query(query, params);
    return rows[0].count;
  }

  /**
   * Update host
   * @param {number} id - Host ID
   * @param {Object} updates - Fields to update
   * @param {string} updates.hostname - New hostname
   * @param {Object} auditData - Audit information
   * @param {number} auditData.user_id - User ID making the change
   * @param {string} auditData.ip_address - IP address of the requester
   * @returns {Promise<void>}
   */
  static async updateHost(id, updates, auditData) {
    const pool = getPool();
    const { hostname } = updates;

    // Validate hostname
    if (!hostname || hostname.trim().length === 0) {
      throw new Error('Hostname is required');
    }

    // Check for duplicate hostname (excluding current host)
    const [existing] = await pool.query(
      'SELECT id FROM hosts WHERE hostname = ? AND id != ?',
      [hostname.trim(), id]
    );

    if (existing.length > 0) {
      throw new Error('A host with this hostname already exists');
    }

    // Update host
    await pool.query(
      'UPDATE hosts SET hostname = ?, last_seen_at = NOW() WHERE id = ?',
      [hostname.trim(), id]
    );

    // Log to audit
    await auditService.logAction({
      user_id: auditData.user_id,
      action: 'host.updated',
      resource_type: 'host',
      resource_id: id,
      details: { hostname: hostname.trim() },
      ip_address: auditData.ip_address
    });
  }

  /**
   * Delete host
   * @param {number} id - Host ID
   * @param {Object} auditData - Audit information
   * @param {number} auditData.user_id - User ID performing the deletion
   * @param {string} auditData.ip_address - IP address of the requester
   * @returns {Promise<void>}
   */
  static async deleteHost(id, auditData) {
    const pool = getPool();

    // Check if host has associated log records
    const [logRecords] = await pool.query(
      'SELECT COUNT(*) as count FROM log_records WHERE host_id = ?',
      [id]
    );

    if (logRecords[0].count > 0) {
      throw new Error(`Cannot delete host: ${logRecords[0].count} log records reference this host`);
    }

    // Delete host
    await pool.query('DELETE FROM hosts WHERE id = ?', [id]);

    // Log to audit
    await auditService.logAction({
      user_id: auditData.user_id,
      action: 'host.deleted',
      resource_type: 'host',
      resource_id: id,
      ip_address: auditData.ip_address
    });
  }

  /**
   * Get total log count for a host
   * @param {number} id - Host ID
   * @returns {Promise<number>} Total log count
   */
  static async getLogCount(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM log_records WHERE host_id = ?',
      [id]
    );
    return rows[0].count;
  }

  /**
   * Get recent logs for a host
   * @param {number} id - Host ID
   * @param {number} limit - Number of logs to retrieve
   * @returns {Promise<Array>} Array of log records
   */
  static async getRecentLogs(id, limit = 10) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, log_type, timestamp, code_id, remote, created_at
       FROM log_records 
       WHERE host_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [id, limit]
    );
    return rows;
  }

  /**
   * Get associated websites for a host
   * @param {number} id - Host ID
   * @returns {Promise<Array>} Array of website objects
   */
  static async getAssociatedWebsites(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT DISTINCT w.id, w.domain, w.is_ssl, w.is_dev
       FROM websites w
       INNER JOIN log_records lr ON w.id = lr.website_id
       WHERE lr.host_id = ?
       ORDER BY w.domain ASC`,
      [id]
    );
    return rows;
  }
}

module.exports = Host;
