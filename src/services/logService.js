const { getPool } = require('../config/database');
const { extractDomain, extractLogType } = require('../utils/extractDomain');
const { findOrCreateWebsite, updateWebsiteActivity } = require('./websiteService');

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

  // Process each record
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

      // Find or create website
      const websiteId = await findOrCreateWebsite(domain);
      websiteIds.add(websiteId);

      // Extract timestamp from record or use current time
      const timestamp = record.timestamp || new Date();

      // Prepare record for insertion
      processedRecords.push([
        websiteId,
        logType,
        timestamp,
        record.host,
        record.code || null,
        record.remote || null,
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
       (website_id, log_type, timestamp, host, code, remote, raw_data) 
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
