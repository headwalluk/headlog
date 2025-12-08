const { getPool } = require('../config/database');

// In-memory cache for HTTP codes (pre-populated on startup)
const codeCache = new Map();

/**
 * Initialize HTTP code cache from database
 * Called on application startup
 * @returns {Promise<void>}
 */
async function initializeCodeCache() {
  const pool = getPool();

  try {
    const [codes] = await pool.query('SELECT id, code, description FROM http_codes ORDER BY id');

    codeCache.clear();
    for (const row of codes) {
      codeCache.set(row.code, row.id);
    }

    console.log(`[HttpCodeService] Loaded ${codes.length} HTTP codes into cache`);
  } catch (error) {
    console.error('[HttpCodeService] Failed to initialize code cache:', error.message);
    throw error;
  }
}

/**
 * Find or create an HTTP code, returning its ID
 * Uses in-memory cache for performance
 * @param {string|null} code - HTTP status code (e.g., "200", "404") or null
 * @returns {Promise<number>} HTTP code ID (0 for null/invalid codes)
 */
async function findOrCreateHttpCode(code) {
  // Handle null or undefined codes (error logs without HTTP status)
  if (!code) {
    return 0; // N/A
  }

  // Normalize code to string
  const codeStr = String(code).trim();

  // Check cache first
  if (codeCache.has(codeStr)) {
    return codeCache.get(codeStr);
  }

  // Parse to number for ID (HTTP codes are numeric)
  const codeNum = parseInt(codeStr, 10);

  // Validate: must be 0-255 (TINYINT UNSIGNED range) and typically 100-599 for HTTP
  if (isNaN(codeNum) || codeNum < 0 || codeNum > 255) {
    console.warn(`[HttpCodeService] Invalid HTTP code: "${code}" - using N/A`);
    return 0; // N/A
  }

  // Insert new code into database (using code number as ID)
  const pool = getPool();

  try {
    await pool.query(
      'INSERT INTO http_codes (id, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
      [codeNum, codeStr]
    );

    // Add to cache
    codeCache.set(codeStr, codeNum);

    console.log(`[HttpCodeService] Added new HTTP code: ${codeStr} (ID: ${codeNum})`);

    return codeNum;
  } catch (error) {
    console.error(`[HttpCodeService] Failed to create HTTP code "${code}":`, error.message);
    return 0; // Fallback to N/A
  }
}

/**
 * Get HTTP code details by ID
 * @param {number} codeId - HTTP code ID
 * @returns {Promise<Object|null>} Code details or null if not found
 */
async function getHttpCodeById(codeId) {
  const pool = getPool();

  const [rows] = await pool.query(
    'SELECT id, code, description, created_at FROM http_codes WHERE id = ?',
    [codeId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all HTTP codes
 * @returns {Promise<Array>} List of all HTTP codes
 */
async function getAllHttpCodes() {
  const pool = getPool();

  const [rows] = await pool.query('SELECT id, code, description FROM http_codes ORDER BY id');

  return rows;
}

/**
 * Get HTTP code statistics (usage counts)
 * @returns {Promise<Array>} Code usage statistics
 */
async function getHttpCodeStats() {
  const pool = getPool();

  const [rows] = await pool.query(`
    SELECT 
      hc.id,
      hc.code,
      hc.description,
      COUNT(lr.id) as usage_count,
      MAX(lr.created_at) as last_used_at
    FROM http_codes hc
    LEFT JOIN log_records lr ON hc.id = lr.code_id
    GROUP BY hc.id, hc.code, hc.description
    ORDER BY usage_count DESC, hc.id ASC
  `);

  return rows;
}

/**
 * Clear the in-memory cache (for testing or manual refresh)
 */
function clearCache() {
  codeCache.clear();
  console.log('[HttpCodeService] Cache cleared');
}

/**
 * Get current cache size (for monitoring)
 * @returns {number} Number of codes in cache
 */
function getCacheSize() {
  return codeCache.size;
}

module.exports = {
  initializeCodeCache,
  findOrCreateHttpCode,
  getHttpCodeById,
  getAllHttpCodes,
  getHttpCodeStats,
  clearCache,
  getCacheSize
};
