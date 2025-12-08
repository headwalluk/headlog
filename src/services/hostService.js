const { getPool } = require('../config/database');

// In-memory cache for host IDs (hostname -> id)
const hostCache = new Map();
let cacheLastCleared = Date.now();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get or create host IDs for a batch of hostnames
 * Race-safe for PM2 cluster mode using INSERT IGNORE
 *
 * @param {Array<string>} hostnames - Array of hostname strings
 * @returns {Promise<Map<string, number>>} Map of hostname -> host_id
 */
async function getOrCreateHostIds(hostnames) {
  if (!hostnames || hostnames.length === 0) {
    return new Map();
  }

  const pool = getPool();
  const now = Date.now();

  // Periodically clear cache to keep memory bounded
  if (now - cacheLastCleared > CACHE_TTL) {
    const oldSize = hostCache.size;
    hostCache.clear();
    cacheLastCleared = now;
    console.log(`[HostService] Cache cleared (${oldSize} entries, TTL: ${CACHE_TTL}ms)`);
  }

  // Find hostnames not in cache
  const uncachedHosts = hostnames.filter(h => !hostCache.has(h));

  if (uncachedHosts.length > 0) {
    try {
      // Step 1: Attempt to create all uncached hosts
      // INSERT IGNORE is race-safe - silently skips duplicates
      // This handles PM2 cluster race conditions perfectly
      await pool.query('INSERT IGNORE INTO hosts (hostname) VALUES ?', [
        uncachedHosts.map(h => [h])
      ]);

      // Step 2: Fetch IDs for all uncached hosts (now guaranteed to exist)
      // Even if another worker created them, we'll find them here
      const [hosts] = await pool.query('SELECT id, hostname FROM hosts WHERE hostname IN (?)', [
        uncachedHosts
      ]);

      // Step 3: Update cache
      hosts.forEach(h => {
        hostCache.set(h.hostname, h.id);
      });

      if (hosts.length > 0) {
        console.log(
          `[HostService] Cached ${hosts.length} new hosts (total cached: ${hostCache.size})`
        );
      }
    } catch (error) {
      console.error('[HostService] Error creating/fetching hosts:', error.message);
      throw error;
    }
  }

  // Build result map from cache
  const hostMap = new Map();
  hostnames.forEach(hostname => {
    const hostId = hostCache.get(hostname);
    if (hostId !== undefined) {
      hostMap.set(hostname, hostId);
    } else {
      console.error(`[HostService] Hostname not found in cache after fetch: ${hostname}`);
      // This shouldn't happen, but log it for debugging
    }
  });

  return hostMap;
}

/**
 * Get host details by ID
 * @param {number} hostId - Host ID
 * @returns {Promise<Object|null>} Host details or null if not found
 */
async function getHostById(hostId) {
  const pool = getPool();

  const [rows] = await pool.query(
    'SELECT id, hostname, first_seen_at, last_seen_at FROM hosts WHERE id = ?',
    [hostId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all hosts with optional pagination
 * @param {Object} options - Query options
 * @param {number} options.limit - Max results to return
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Array>} List of hosts
 */
async function getAllHosts(options = {}) {
  const pool = getPool();
  const { limit = 100, offset = 0 } = options;

  const [rows] = await pool.query(
    'SELECT id, hostname, first_seen_at, last_seen_at FROM hosts ORDER BY last_seen_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );

  return rows;
}

/**
 * Get host usage statistics
 * @returns {Promise<Array>} Host usage statistics
 */
async function getHostStats() {
  const pool = getPool();

  const [rows] = await pool.query(`
    SELECT 
      h.id,
      h.hostname,
      h.first_seen_at,
      h.last_seen_at,
      COUNT(lr.id) as log_count,
      MAX(lr.created_at) as latest_log_at
    FROM hosts h
    LEFT JOIN log_records lr ON h.id = lr.host_id
    GROUP BY h.id, h.hostname, h.first_seen_at, h.last_seen_at
    ORDER BY log_count DESC, h.last_seen_at DESC
    LIMIT 100
  `);

  return rows;
}

/**
 * Clear the in-memory cache (for testing or manual refresh)
 */
function clearCache() {
  const oldSize = hostCache.size;
  hostCache.clear();
  cacheLastCleared = Date.now();
  console.log(`[HostService] Cache manually cleared (${oldSize} entries)`);
}

/**
 * Get current cache statistics (for monitoring)
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
  return {
    size: hostCache.size,
    lastCleared: new Date(cacheLastCleared).toISOString(),
    ttl: CACHE_TTL,
    nextClear: new Date(cacheLastCleared + CACHE_TTL).toISOString()
  };
}

/**
 * Pre-warm cache with most common hosts (called on startup)
 * @param {number} limit - Number of hosts to pre-load
 * @returns {Promise<void>}
 */
async function prewarmCache(limit = 1000) {
  const pool = getPool();

  try {
    const [hosts] = await pool.query(
      'SELECT id, hostname FROM hosts ORDER BY last_seen_at DESC LIMIT ?',
      [limit]
    );

    hostCache.clear();
    hosts.forEach(h => {
      hostCache.set(h.hostname, h.id);
    });

    cacheLastCleared = Date.now();
    console.log(`[HostService] Cache pre-warmed with ${hosts.length} hosts`);
  } catch (error) {
    console.error('[HostService] Failed to pre-warm cache:', error.message);
    // Non-fatal - cache will populate on first use
  }
}

module.exports = {
  getOrCreateHostIds,
  getHostById,
  getAllHosts,
  getHostStats,
  clearCache,
  getCacheStats,
  prewarmCache
};
