/**
 * Authorization Middleware
 * Provides middleware for protecting routes with capability checks
 */

const authorizationService = require('../services/authorizationService');

/**
 * Middleware factory: Require user to have a specific capability
 * Returns 403 Forbidden if user lacks the capability
 *
 * Usage:
 *   app.get('/api/users', requireCapability('users:read'), handler);
 *
 * @param {string} capabilityName - Required capability (e.g., 'logs:read')
 * @returns {Function} Express middleware function
 */
function requireCapability(capabilityName) {
  return async (req, reply) => {
    // Check if user is authenticated (set by Passport or session middleware)
    if (!req.user || !req.user.id) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // Check if user has the required capability
    const hasCapability = await authorizationService.checkUserCapability(
      req.user.id,
      capabilityName
    );

    if (!hasCapability) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required capability: ${capabilityName}`
      });
    }

    // User has capability, continue to route handler
  };
}

/**
 * Middleware factory: Require user to have ANY of the specified capabilities
 * Returns 403 Forbidden if user lacks all capabilities
 *
 * Usage:
 *   app.get('/api/data', requireAnyCapability(['logs:read', 'logs:export']), handler);
 *
 * @param {Array<string>} capabilityNames - Array of capability names (OR condition)
 * @returns {Function} Express middleware function
 */
function requireAnyCapability(capabilityNames) {
  return async (req, reply) => {
    if (!req.user || !req.user.id) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const hasAny = await authorizationService.checkUserHasAnyCapability(
      req.user.id,
      capabilityNames
    );

    if (!hasAny) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required one of: ${capabilityNames.join(', ')}`
      });
    }
  };
}

/**
 * Middleware factory: Require user to have ALL of the specified capabilities
 * Returns 403 Forbidden if user lacks any capability
 *
 * Usage:
 *   app.post('/api/admin', requireAllCapabilities(['users:write', 'roles:write']), handler);
 *
 * @param {Array<string>} capabilityNames - Array of capability names (AND condition)
 * @returns {Function} Express middleware function
 */
function requireAllCapabilities(capabilityNames) {
  return async (req, reply) => {
    if (!req.user || !req.user.id) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const hasAll = await authorizationService.checkUserHasAllCapabilities(
      req.user.id,
      capabilityNames
    );

    if (!hasAll) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required all of: ${capabilityNames.join(', ')}`
      });
    }
  };
}

/**
 * Middleware: Require user to be a superuser
 * Returns 403 Forbidden if user is not a superuser
 *
 * Usage:
 *   app.post('/api/superuser-only', requireSuperuser, handler);
 *
 * @returns {Function} Express middleware function
 */
function requireSuperuser(req, reply) {
  if (!req.user || !req.user.id) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  if (!req.user.is_superuser) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Superuser access required'
    });
  }
}

/**
 * Middleware: Attach user's capabilities to request object
 * Useful for conditional UI rendering or complex authorization logic
 *
 * Usage:
 *   app.use(attachCapabilities);
 *   // Later in route: if (req.capabilities.includes('logs:delete')) { ... }
 *
 * @returns {Function} Express middleware function
 */
async function attachCapabilities(req, _reply) {
  if (req.user && req.user.id) {
    const capabilities = await authorizationService.getUserCapabilities(req.user.id);
    req.capabilities = capabilities.map(cap => cap.name);
    req.capabilitiesByCategory = capabilities.reduce((acc, cap) => {
      if (!acc[cap.category]) {
        acc[cap.category] = [];
      }
      acc[cap.category].push(cap.name);
      return acc;
    }, {});
  } else {
    req.capabilities = [];
    req.capabilitiesByCategory = {};
  }
}

module.exports = {
  requireCapability,
  requireAnyCapability,
  requireAllCapabilities,
  requireSuperuser,
  attachCapabilities
};
