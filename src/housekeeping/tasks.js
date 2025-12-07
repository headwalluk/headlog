const cron = require('node-cron');
const config = require('../config');
const { getPool } = require('../config/database');

/**
 * Initialize housekeeping tasks
 * Only runs on PM2 worker instance 0
 */
function initHousekeeping() {
  if (!config.pm2.isWorkerZero) {
    console.log(`⊘ Housekeeping tasks disabled on worker ${config.pm2.appInstance}`);
    return;
  }

  console.log('✓ Housekeeping tasks enabled on worker 0');

  // Task 1: Purge old logs - Daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    await purgeOldLogs();
  });

  // Task 2: Delete inactive websites - Daily at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    await deleteInactiveWebsites();
  });

  // Task 3: Clean up API key stats - Weekly Sunday at 4:00 AM
  cron.schedule('0 4 * * 0', async () => {
    await cleanupApiKeyStats();
  });
}

/**
 * Purge log records older than LOG_RETENTION_DAYS
 */
async function purgeOldLogs() {
  const retentionDays = config.housekeeping.logRetentionDays;
  const pool = getPool();

  try {
    console.log(`[Housekeeping] Purging logs older than ${retentionDays} days...`);

    const [result] = await pool.query(
      'DELETE FROM log_records WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [retentionDays]
    );

    console.log(`[Housekeeping] ✓ Purged ${result.affectedRows} old log records`);
  } catch (error) {
    console.error('[Housekeeping] ✗ Failed to purge old logs:', error);
  }
}

/**
 * Delete websites with no activity for INACTIVE_WEBSITE_DAYS
 */
async function deleteInactiveWebsites() {
  const inactiveDays = config.housekeeping.inactiveWebsiteDays;
  const pool = getPool();

  try {
    console.log(`[Housekeeping] Deleting websites inactive for ${inactiveDays} days...`);

    const [result] = await pool.query(
      'DELETE FROM websites WHERE last_activity_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [inactiveDays]
    );

    console.log(`[Housekeeping] ✓ Deleted ${result.affectedRows} inactive websites`);
  } catch (error) {
    console.error('[Housekeeping] ✗ Failed to delete inactive websites:', error);
  }
}

/**
 * Clean up API key statistics (placeholder for future implementation)
 */
async function cleanupApiKeyStats() {
  try {
    console.log('[Housekeeping] Running API key stats cleanup...');

    // TODO: Implement stats aggregation or archival in Phase #2
    // For now, just log that the task ran

    console.log('[Housekeeping] ✓ API key stats cleanup completed');
  } catch (error) {
    console.error('[Housekeeping] ✗ Failed to cleanup API key stats:', error);
  }
}

module.exports = {
  initHousekeeping,
  purgeOldLogs,
  deleteInactiveWebsites,
  cleanupApiKeyStats
};
