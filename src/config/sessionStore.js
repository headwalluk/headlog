/**
 * MySQL Session Store for @fastify/session
 * Stores session data in the sessions table
 */

const { getPool } = require('../config/database');

class MySQLSessionStore {
  constructor(options = {}) {
    this.tableName = options.tableName || 'sessions';
    this.ttl = options.ttl || 86400000; // 24 hours default
  }

  /**
   * Get session data
   */
  async get(sessionId, callback) {
    try {
      const pool = getPool();
      const [rows] = await pool.query(
        `SELECT data, expires_at FROM ${this.tableName} WHERE id = ?`,
        [sessionId]
      );

      if (rows.length === 0) {
        return callback(null, null);
      }

      const session = rows[0];

      // Check if expired
      if (new Date(session.expires_at) < new Date()) {
        await this.destroy(sessionId, () => {});
        return callback(null, null);
      }

      // Parse session data
      const data = JSON.parse(session.data);
      callback(null, data);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Set/update session data
   */
  async set(sessionId, session, callback) {
    try {
      const pool = getPool();
      const expiresAt = new Date(Date.now() + this.ttl);
      const data = JSON.stringify(session);

      await pool.query(
        `INSERT INTO ${this.tableName} (id, expires_at, data, user_id, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           expires_at = VALUES(expires_at),
           data = VALUES(data),
           user_id = VALUES(user_id),
           ip_address = VALUES(ip_address),
           user_agent = VALUES(user_agent)`,
        [
          sessionId,
          expiresAt,
          data,
          session.user_id || null,
          session.ip_address || null,
          session.user_agent || null
        ]
      );

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Destroy session
   */
  async destroy(sessionId, callback) {
    try {
      const pool = getPool();
      await pool.query(`DELETE FROM ${this.tableName} WHERE id = ?`, [sessionId]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Clean up expired sessions (called periodically)
   */
  async cleanup() {
    try {
      const pool = getPool();
      await pool.query(`DELETE FROM ${this.tableName} WHERE expires_at < NOW()`);
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }
}

module.exports = MySQLSessionStore;
