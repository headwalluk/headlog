const bcrypt = require('bcrypt');
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

  // Query database for all active keys (we'll compare hashes)
  const pool = getPool();

  try {
    const [rows] = await pool.query(
      'SELECT id, `key`, description FROM api_keys WHERE is_active = 1'
    );

    if (rows.length === 0) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key'
      });
    }

    // Find matching key by comparing hashes
    let matchedKey = null;
    for (const row of rows) {
      const isMatch = await bcrypt.compare(token, row.key);
      if (isMatch) {
        matchedKey = row;
        break;
      }
    }

    if (!matchedKey) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key'
      });
    }

    // Attach key info to request for downstream use
    request.apiKey = {
      id: matchedKey.id,
      description: matchedKey.description
    };

    // Update last_used_at timestamp (async, don't await - fire and forget)
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [matchedKey.id]).catch(err => {
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
