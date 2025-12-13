/**
 * UI Routes
 * Handles page rendering for the web interface
 */

const authorizationService = require('../services/authorizationService');
const config = require('../config');

async function uiRoutes(fastify, _options) {
  /**
   * GET /
   * Root route - redirect to dashboard or login
   */
  fastify.get('/', async (request, reply) => {
    if (request.session && request.session.user_id) {
      return reply.redirect('/dashboard');
    }
    return reply.redirect('/login');
  });

  /**
   * GET /login
   * Display login page
   */
  fastify.get('/login', async (request, reply) => {
    // If already logged in, redirect to dashboard
    if (request.session && request.session.user_id) {
      return reply.redirect('/dashboard');
    }

    const error = request.query.error || null;
    return reply.renderView('login', {
      error,
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      },
      user: null
    });
  });

  /**
   * GET /dashboard
   * Display main dashboard (requires authentication)
   */
  fastify.get(
    '/dashboard',
    {
      preHandler: async (request, reply) => {
        // Require session
        if (!request.session || !request.session.user_id) {
          return reply.redirect('/login');
        }

        // Load user and attach to request
        const authService = require('../services/authService');
        const user = await authService.validateSession(request.session.user_id);

        if (!user) {
          request.session.destroy();
          return reply.redirect('/login');
        }

        // Load user capabilities
        const capabilities = await authorizationService.getUserCapabilities(user.id);
        user.capabilities = capabilities.map(cap => cap.name);

        request.user = user;
      }
    },
    async (request, reply) => {
      const { pool } = fastify;

      try {
        // Query stats
        const [logCountRows] = await pool.query('SELECT COUNT(*) as count FROM log_records');
        const logCount = logCountRows[0].count;

        const [websiteCountRows] = await pool.query(
          'SELECT COUNT(*) as count FROM websites WHERE is_active = 1'
        );
        const websiteCount = websiteCountRows[0].count;

        const [hostCountRows] = await pool.query(
          'SELECT COUNT(DISTINCT hostname) as count FROM log_records'
        );
        const hostCount = hostCountRows[0].count;

        const [securityEventsRows] = await pool.query(
          'SELECT COUNT(*) as count FROM security_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'
        );
        const securityEvents24h = securityEventsRows[0].count;

        // Query recent activity from audit log
        const [recentActivity] = await pool.query(`
        SELECT 
          al.id,
          al.user_id,
          u.username,
          al.action,
          al.resource_type,
          al.resource_id,
          al.details,
          al.ip_address,
          al.created_at
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 10
      `);

        return reply.renderView('dashboard', {
          user: request.user,
          stats: {
            logCount,
            websiteCount,
            hostCount,
            securityEvents24h
          },
          recentActivity,
          currentPath: '/dashboard',
          config: {
            appName: 'Headlog',
            version: require('../../package.json').version,
            env: config.env
          }
        });
      } catch (error) {
        fastify.log.error('Dashboard error:', error);
        return reply.code(500).send('An error occurred loading the dashboard');
      }
    }
  );
}

module.exports = uiRoutes;
