const { getPool } = require('../config/database');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(zlib.gzip);

// Adaptive batch sizing state
let batchSizeMultiplier = 1.0; // Start at 100% of target batch size

/**
 * Get current adaptive batch size
 * @param {Object} config - Application configuration
 * @returns {number} Current batch size
 */
function getAdaptiveBatchSize(config) {
  return Math.round(config.upstream.batchSize * batchSizeMultiplier);
}

/**
 * Reduce batch size on failure (adaptive backpressure)
 * @param {Object} config - Application configuration
 */
function reduceBatchSize(config) {
  const minMultiplier = config.upstream.batchSizeMin || 0.2; // Default 20% floor
  const oldMultiplier = batchSizeMultiplier;
  batchSizeMultiplier = Math.max(minMultiplier, batchSizeMultiplier - 0.2);

  if (batchSizeMultiplier < oldMultiplier) {
    const newSize = getAdaptiveBatchSize(config);
    console.log(
      `[UpstreamSync] Reduced batch size to ${newSize} records (${Math.round(batchSizeMultiplier * 100)}%)`
    );
  }
}

/**
 * Increase batch size on success (gradual recovery)
 * @param {Object} config - Application configuration
 */
function increaseBatchSize(config) {
  const recoveryIncrement = config.upstream.batchSizeRecovery || 0.1; // Default 10%
  const oldMultiplier = batchSizeMultiplier;
  batchSizeMultiplier = Math.min(1.0, batchSizeMultiplier + recoveryIncrement);

  if (batchSizeMultiplier > oldMultiplier) {
    const newSize = getAdaptiveBatchSize(config);
    console.log(
      `[UpstreamSync] Increased batch size to ${newSize} records (${Math.round(batchSizeMultiplier * 100)}%)`
    );
  }
}

/**
 * Get un-archived log records for upstream sync
 * @param {number} limit - Maximum number of records to fetch
 * @returns {Promise<Array>} Array of log records
 */
async function getUnArchivedRecords(limit) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT id, website_id, log_type, timestamp, host_id, code_id, remote, raw_data, created_at
     FROM log_records
     WHERE archived_at IS NULL
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

/**
 * Generate unique batch UUID with collision detection
 * @returns {Promise<{uuid: string, binary: Buffer}>}
 */
async function generateUniqueBatchUUID() {
  const pool = getPool();
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const uuid = crypto.randomUUID();
    const binary = Buffer.from(uuid.replace(/-/g, ''), 'hex');

    // Check for collision
    const [existing] = await pool.query(
      'SELECT id FROM upstream_sync_batches WHERE batch_uuid = ?',
      [binary]
    );

    if (existing.length === 0) {
      return { uuid, binary };
    }

    console.warn(`[UpstreamSync] UUID collision detected on attempt ${attempt + 1}: ${uuid}`);
  }

  throw new Error('Failed to generate unique batch UUID after multiple attempts');
}

/**
 * Post batch to upstream server
 * @param {Object} payload - Batch payload
 * @param {Object} config - Application configuration
 * @returns {Promise<Object>} Response data
 */
async function postToUpstream(payload, config) {
  let body = JSON.stringify(payload);
  const headers = {
    Authorization: `Bearer ${config.upstream.apiKey}`,
    'Content-Type': 'application/json'
  };

  // Compress if enabled
  if (config.upstream.compression) {
    body = await gzipAsync(body);
    headers['Content-Encoding'] = 'gzip';
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutMs = config.upstream.timeout * 1000; // Convert seconds to milliseconds
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.upstream.server}/api/logs`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Mark records as archived
 * @param {Array<number>} recordIds - Array of record IDs
 * @returns {Promise<void>}
 */
async function markRecordsArchived(recordIds) {
  const pool = getPool();

  await pool.query('UPDATE log_records SET archived_at = NOW() WHERE id IN (?)', [recordIds]);
}

/**
 * Perform upstream sync with batch tracking and idempotency
 * @param {Object} config - Application configuration
 * @returns {Promise<void>}
 */
async function performUpstreamSync(config) {
  if (!config.upstream.enabled) {
    return;
  }

  if (!config.upstream.server || !config.upstream.apiKey) {
    console.error('[UpstreamSync] Upstream enabled but server or API key not configured');
    return;
  }

  const pool = getPool();
  const batchSize = getAdaptiveBatchSize(config);

  try {
    // Fetch un-archived records
    const records = await getUnArchivedRecords(batchSize);

    if (records.length === 0) {
      return; // Nothing to sync
    }

    // Generate unique batch UUID
    const { uuid: batchUuid, binary: batchUuidBinary } = await generateUniqueBatchUUID();
    const recordIds = records.map(r => r.id);

    console.log(`[UpstreamSync] Starting batch ${batchUuid} with ${records.length} records`);

    // Create batch tracking record
    await pool.query(
      `INSERT INTO upstream_sync_batches 
       (batch_uuid, record_count, status) 
       VALUES (?, ?, 'pending')`,
      [batchUuidBinary, records.length]
    );

    // Tag records with this batch UUID
    await pool.query(
      `UPDATE log_records 
       SET upstream_batch_uuid = ? 
       WHERE id IN (?)`,
      [batchUuidBinary, recordIds]
    );

    // Update status to in_progress
    await pool.query(
      `UPDATE upstream_sync_batches 
       SET status = 'in_progress' 
       WHERE batch_uuid = ?`,
      [batchUuidBinary]
    );

    // Prepare payload
    const payload = {
      batch_uuid: batchUuid,
      source_instance: config.upstream.instanceName,
      schema_version: require('../../package.json').version,
      records: records.map(r => JSON.parse(r.raw_data))
    };

    // POST to upstream
    await postToUpstream(payload, config);

    // Success: mark records as archived
    await markRecordsArchived(recordIds);

    // Mark batch as completed
    await pool.query(
      `UPDATE upstream_sync_batches 
       SET status = 'completed', completed_at = NOW() 
       WHERE batch_uuid = ?`,
      [batchUuidBinary]
    );

    // Gradually increase batch size
    increaseBatchSize(config);

    console.log(`[UpstreamSync] Batch ${batchUuid}: Archived ${recordIds.length} records`);
  } catch (error) {
    console.error('[UpstreamSync] Batch sync failed:', error.message);

    // Try to mark batch as failed if we have the UUID
    try {
      if (error.batchUuidBinary) {
        await pool.query(
          `UPDATE upstream_sync_batches 
           SET status = 'failed', error_message = ?, retry_count = retry_count + 1 
           WHERE batch_uuid = ?`,
          [error.message, error.batchUuidBinary]
        );

        // Clear batch UUID from records so they can be retried
        await pool.query(
          `UPDATE log_records 
           SET upstream_batch_uuid = NULL 
           WHERE upstream_batch_uuid = ?`,
          [error.batchUuidBinary]
        );
      }
    } catch (updateError) {
      console.error('[UpstreamSync] Failed to update batch status:', updateError.message);
    }

    // Reduce batch size for next attempt
    reduceBatchSize(config);
  }
}

/**
 * Get current batch sizing stats (for monitoring)
 * @param {Object} config - Application configuration
 * @returns {Object} Batch sizing statistics
 */
function getBatchSizeStats(config) {
  return {
    targetSize: config.upstream.batchSize,
    currentMultiplier: batchSizeMultiplier,
    currentSize: getAdaptiveBatchSize(config),
    minSize: Math.round(config.upstream.batchSize * config.upstream.batchSizeMin),
    percentOfTarget: Math.round(batchSizeMultiplier * 100)
  };
}

module.exports = {
  performUpstreamSync,
  getUnArchivedRecords,
  getAdaptiveBatchSize,
  reduceBatchSize,
  increaseBatchSize,
  getBatchSizeStats
};
