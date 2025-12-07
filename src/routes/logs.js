const { ingestLogs, queryLogs } = require('../services/logService');

/**
 * Register log-related routes
 * @param {import('fastify').FastifyInstance} fastify
 */
async function logRoutes(fastify) {
  // POST /logs - Ingest log records
  fastify.post('/logs', async (request, reply) => {
    try {
      const logRecords = request.body;

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
