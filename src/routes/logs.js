const { ingestLogs, queryLogs } = require('../services/logService');
const { getPool } = require('../config/database');

/**
 * Handle upstream hierarchical batch with deduplication
 * @param {Object} payload - Batch payload with batch_uuid, source_instance, records
 * @param {Object} reply - Fastify reply object
 * @returns {Promise<Object>} Response
 */
async function handleUpstreamBatch(payload, reply) {
  const { batch_uuid, source_instance, records } = payload;
  const pool = getPool();

  // Validate batch structure
  if (!batch_uuid || !source_instance || !Array.isArray(records)) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Invalid upstream batch format'
    });
  }

  if (records.length === 0) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Batch cannot be empty'
    });
  }

  try {
    // Convert UUID string to binary for lookup
    const batchUuidBinary = Buffer.from(batch_uuid.replace(/-/g, ''), 'hex');

    // Check for duplicate batch (idempotency)
    const [existing] = await pool.query(
      'SELECT id FROM batch_deduplication WHERE batch_uuid = ? AND source_instance = ?',
      [batchUuidBinary, source_instance]
    );

    if (existing.length > 0) {
      // Duplicate batch - return success without processing
      console.log(
        `[UpstreamBatch] Duplicate batch ${batch_uuid} from ${source_instance}, skipping`
      );
      return reply.code(200).send({
        status: 'ok',
        message: 'Batch already processed (duplicate)',
        received: records.length,
        processed: 0, // Not processed again
        deduplicated: true
      });
    }

    // Record this batch to prevent duplicates
    await pool.query(
      'INSERT INTO batch_deduplication (batch_uuid, source_instance, record_count) VALUES (?, ?, ?)',
      [batchUuidBinary, source_instance, records.length]
    );

    // Process logs normally
    const processed = await ingestLogs(records);

    console.log(
      `[UpstreamBatch] Processed batch ${batch_uuid} from ${source_instance}: ${processed} records`
    );

    return reply.code(200).send({
      status: 'ok',
      received: records.length,
      processed: processed,
      deduplicated: false
    });
  } catch (error) {
    console.error(`[UpstreamBatch] Error processing batch ${batch_uuid}:`, error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to process upstream batch'
    });
  }
}

/**
 * Register log-related routes
 * @param {import('fastify').FastifyInstance} fastify
 */
async function logRoutes(fastify) {
  // POST /logs - Ingest log records
  fastify.post('/logs', async (request, reply) => {
    try {
      const payload = request.body;

      // Check if this is a hierarchical batch upload
      if (payload.batch_uuid && payload.source_instance && payload.records) {
        return await handleUpstreamBatch(payload, reply);
      }

      // Regular direct ingestion (Fluent Bit, etc.)
      const logRecords = payload;

      // Validate payload
      if (!Array.isArray(logRecords)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Expected array of log records'
        });
      }

      if (logRecords.length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Log array cannot be empty'
        });
      }

      // Process logs
      const processed = await ingestLogs(logRecords);

      return reply.code(200).send({
        status: 'ok',
        received: logRecords.length,
        processed: processed
      });
    } catch (error) {
      console.error('Log ingestion error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process log records'
      });
    }
  });

  // GET /logs - Query logs (Phase #2)
  fastify.get('/logs', async (request, reply) => {
    try {
      // TODO: Parse query parameters for filtering
      const logs = await queryLogs();

      return reply.code(200).send({
        logs: logs,
        total: logs.length
      });
    } catch (error) {
      console.error('Log query error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to query logs'
      });
    }
  });
}

module.exports = logRoutes;
