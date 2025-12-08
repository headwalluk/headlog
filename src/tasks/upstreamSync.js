const { performUpstreamSync } = require('../services/upstreamSyncService');

let lastUploadTime = 0;

/**
 * Check if next batch upload is due based on configured interval
 * @param {Object} config - Application configuration
 * @returns {boolean} True if upload should occur
 */
function isNextBatchUploadDue(config) {
  if (!config.upstream.enabled) {
    return false;
  }

  const now = Date.now();
  const intervalMs = config.upstream.batchInterval * 1000; // Convert seconds to ms
  const timeSinceLastUpload = now - lastUploadTime;

  return timeSinceLastUpload >= intervalMs;
}

/**
 * Perform upstream sync if interval has elapsed
 * @param {Object} config - Application configuration
 * @returns {Promise<void>}
 */
async function performUpstreamSyncIfDue(config) {
  if (!isNextBatchUploadDue(config)) {
    return; // Not time yet
  }

  lastUploadTime = Date.now();

  try {
    await performUpstreamSync(config);
  } catch (error) {
    console.error('[UpstreamSyncTask] Failed:', error.message);
  }
}

/**
 * Get task metadata for scheduler registration
 * @returns {Object} Task metadata
 */
function getTaskMetadata() {
  return {
    name: 'Upstream Sync',
    description: 'Forwards logs to upstream aggregation server',
    schedule: '* * * * *', // Every minute (throttled by interval check)
    workerRestriction: 0 // Only run on worker 0
  };
}

module.exports = {
  performUpstreamSyncIfDue,
  isNextBatchUploadDue,
  getTaskMetadata
};
