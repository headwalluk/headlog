/**
 * Session Authentication Middleware
 * Provides session-based authentication for Fastify
 */

const authService = require('../services/authService');

/**
 * Middleware: Require authenticated session
 * Returns 401 if not authenticated, attaches user to request if authenticated
 */
async function requireSession(request, reply) {
  // Check if session exists and has user_id
  if (!request.session || !request.session.user_id) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required. Please log in.'
    });
  }

  try {
    // Validate session and load user
    const user = await authService.validateSession(request.session.user_id);

    if (!user) {
      // User deleted or deactivated since session created
      request.session.destroy();
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Session invalid. Please log in again.'
      });
    }

    // Attach user to request
    request.user = user;
  } catch (error) {
    request.log.error('Session validation error:', error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate session'
    });
  }
}

/**
 * Middleware: Attach user if session exists (optional auth)
 * Does not block request if not authenticated, just attaches user if present
 */
async function attachUser(request, _reply) {
  if (request.session && request.session.user_id) {
    try {
      const user = await authService.validateSession(request.session.user_id);
      if (user) {
        request.user = user;
      }
    } catch (error) {
      // Log error but don't block request
      request.log.warn('Failed to attach user from session:', error);
    }
  }
}

/**
 * Helper: Check if request is authenticated
 */
function isAuthenticated(request) {
  return !!(request.session && request.session.user_id && request.user);
}

module.exports = {
  requireSession,
  attachUser,
  isAuthenticated
};
