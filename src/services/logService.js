const { getPool } = require('../config/database');
const config = require('../config');
const { extractDomain, extractLogType } = require('../utils/extractDomain');
const { findOrCreateWebsite, updateWebsiteActivity } = require('./websiteService');
const { findOrCreateHttpCode } = require('./httpCodeService');
const { getOrCreateHostIds } = require('./hostService');

/**
 * Strip port number from IP address (both IPv4 and IPv6)
 * Examples:
 *   - "86.20.152.215:57116" → "86.20.152.215"
 *   - "2a0e:d600:0:430::2:57228" → "2a0e:d600:0:430::2"
 *   - "192.168.1.1" → "192.168.1.1" (no change if no port)
 * @param {string} address - IP address with optional port
 * @returns {string} IP address without port
 */
function stripPortFromIP(address) {
  if (!address) return address;
  // Remove :port from end (port is always numeric)
  // This works for both IPv4 and IPv6 because ports contain only digits
  return address.replace(/:(\d+)$/, '');
}

/**
 * Process and store log records from Fluent Bit
 * @param {Array} logRecords - Array of log record objects
 * @returns {Promise<number>} Number of records processed
 */
async function ingestLogs(logRecords) {
  if (!Array.isArray(logRecords) || logRecords.length === 0) {
    return 0;
  }

  const pool = getPool();
  const processedRecords = [];
  const websiteIds = new Set();
  const hostnames = [];

  // First pass: validate and collect unique hostnames
  const validRecords = [];
  for (const record of logRecords) {
    try {
      // Validate required fields
      if (!record.source_file || !record.host) {
        console.error('Skipping record - missing source_file or host:', record);
        continue;
      }

      // Extract domain and log type
      const domain = extractDomain(record.source_file);
      const logType = extractLogType(record.source_file);

      if (!domain || !logType) {
        console.error('Skipping record - invalid source_file format:', record.source_file);
        continue;
      }

      validRecords.push({ record, domain, logType });
      hostnames.push(record.host);
    } catch (error) {
      console.error('Error validating log record:', error.message, record);
      // Continue processing other records
    }
  }

  if (validRecords.length === 0) {
    return 0;
  }

  // Batch fetch/create all host IDs (race-safe for PM2 cluster)
  const uniqueHostnames = [...new Set(hostnames)];
  const hostMap = await getOrCreateHostIds(uniqueHostnames);

  // Second pass: process validated records with host IDs
  for (const { record, domain, logType } of validRecords) {
    try {
      // Find or create website
      const websiteId = await findOrCreateWebsite(domain);
      websiteIds.add(websiteId);

      // Extract timestamp from log_timestamp field (actual event time) or use current time
      const timestamp = record.log_timestamp || new Date();

      // Find or create HTTP code (use 0 for N/A if no code present)
      const codeId = record.code ? await findOrCreateHttpCode(record.code) : 0;

      // Get host ID from batch-fetched map
      const hostId = hostMap.get(record.host);

      // Process remote IP (try 'remote' first, then 'client', strip port if configured)
      let remoteIP = record.remote || record.client || null;
      if (remoteIP && config.logProcessing.stripPortFromRemoteIP) {
        remoteIP = stripPortFromIP(remoteIP);
      }

      // Prepare record for insertion
      processedRecords.push([
        websiteId,
        logType,
        timestamp,
        hostId,
        codeId,
        remoteIP,
        JSON.stringify(record)
      ]);
    } catch (error) {
      console.error('Error processing log record:', error.message, record);
      // Continue processing other records
    }
  }

  if (processedRecords.length === 0) {
    return 0;
  }

  // Bulk insert all records
  try {
    await pool.query(
      `INSERT INTO log_records 
       (website_id, log_type, timestamp, host_id, code_id, remote, raw_data) 
       VALUES ?`,
      [processedRecords]
    );

    // Update last_activity_at for all affected websites
    for (const websiteId of websiteIds) {
      updateWebsiteActivity(websiteId).catch(err => {
        console.error('Failed to update website activity:', err.message);
      });
    }

    return processedRecords.length;
  } catch (error) {
    console.error('Bulk insert failed:', error);
    throw error;
  }
}

/**
 * Query log records with filtering (Phase #2)
 * @param {Object} _filters
 * @returns {Promise<Array>}
 */
async function queryLogs(_filters = {}) {
  const pool = getPool();

  // TODO: Implement in Phase #2
  // This is a placeholder for future implementation

  const [rows] = await pool.query('SELECT * FROM log_records LIMIT 100');

  return rows;
}

module.exports = {
  ingestLogs,
  queryLogs
};
