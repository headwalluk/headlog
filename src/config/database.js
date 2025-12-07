const mysql = require('mysql2/promise');

let pool = null;

/**
 * Initialize MySQL connection pool
 * @returns {Promise<mysql.Pool>}
 */
async function initDatabase() {
  if (pool) {
    return pool;
  }

  const config = require('./index');

  pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name,
    waitForConnections: true,
    connectionLimit: config.database.connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  // Test connection
  try {
    const connection = await pool.getConnection();
    console.log('✓ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    throw error;
  }

  return pool;
}

/**
 * Get database connection pool
 * @returns {mysql.Pool}
 */
function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

/**
 * Close database connection pool
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getPool,
  closeDatabase
};
