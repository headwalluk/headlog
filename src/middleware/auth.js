const { getPool } = require('../config/database');

/**
 * Fastify authentication hook - validates Bearer token against api_keys table
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  // Check for Authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected format: Bearer <api_key>'
    });
  }

  // Extract token
  const token = authHeader.substring(7).trim();

  if (!token || token.length !== 40) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key format'
    });
  }

  // Query database for valid, active key
  const pool = getPool();

  try {
    const [rows] = await pool.query(
      'SELECT id, description FROM api_keys WHERE `key` = ? AND is_active = 1',
      [token]
    );

    if (rows.length === 0) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key'
      });
    }

    // Attach key info to request for downstream use
    request.apiKey = rows[0];

    // Update last_used_at timestamp (async, don't await - fire and forget)
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [rows[0].id]).catch(err => {
      console.error('Failed to update last_used_at:', err.message);
    });
  } catch (error) {
    console.error('Authentication error:', error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

module.exports = { authenticate };
