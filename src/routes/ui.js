/**
 * UI Routes
 * Handles page rendering for the web interface
 */

const authorizationService = require('../services/authorizationService');
const config = require('../config');
const { getPool } = require('../config/database');
const { getNavigationMenu } = require('../utils/uiHelpers');
const User = require('../models/User');

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
      const pool = getPool();

      try {
        // Query stats from existing tables only
        const [logCountRows] = await pool.query('SELECT COUNT(*) as count FROM log_records');
        const logCount = logCountRows[0].count;

        const [websiteCountRows] = await pool.query('SELECT COUNT(*) as count FROM websites');
        const websiteCount = websiteCountRows[0].count;

        const [hostCountRows] = await pool.query('SELECT COUNT(*) as count FROM hosts');
        const hostCount = hostCountRows[0].count;

        // Query recent activity from audit log (limit to last 10)
        const [recentActivity] = await pool.query(`
        SELECT 
          al.id,
          al.user_id,
          u.username,
          al.action,
          al.resource_type,
          al.resource_id,
          al.ip_address,
          al.created_at
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 10
      `);

        // Get navigation menu for user
        const navigationMenu = getNavigationMenu(request.user);

        return reply.renderView('dashboard', {
          user: request.user,
          navigationMenu,
          stats: {
            logCount,
            websiteCount,
            hostCount
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
        fastify.log.error('Dashboard error:', error.message);
        fastify.log.error('Stack trace:', error.stack);
        console.log(error);
        return reply.code(500).send('An error occurred loading the dashboard');
      }
    }
  );

  /**
   * GET /users
   * Display users list page (requires users:read capability)
   */
  fastify.get(
    '/users',
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

        // Check users:read capability
        if (!user.is_superuser && !user.capabilities.includes('users:read')) {
          return reply.code(403).send('Access denied: users:read capability required');
        }

        request.user = user;
      }
    },
    async (request, reply) => {
      try {
        // Get query parameters
        const { search, active, page = 1 } = request.query;
        const limit = 25;
        const offset = (parseInt(page) - 1) * limit;

        // Build filters
        const filters = {};
        if (active !== undefined) {
          filters.is_active = active === 'true' ? 1 : 0;
        }
        if (search) {
          filters.search = search;
        }

        // Get users and total count
        const users = await User.listUsers({ ...filters, limit, offset });
        const totalCount = await User.getUserCount(filters);
        const totalPages = Math.ceil(totalCount / limit);

        const navigationMenu = getNavigationMenu(request.user);

        return reply.renderView('users/list', {
          user: request.user,
          navigationMenu,
          currentPath: '/users',
          users,
          search: search || '',
          activeFilter: active,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalCount,
            limit
          },
          config: {
            appName: 'Headlog',
            version: require('../../package.json').version,
            env: config.env
          }
        });
      } catch (error) {
        fastify.log.error('Users list error:', error.message);
        fastify.log.error('Stack trace:', error.stack);
        return reply.code(500).send('An error occurred loading the users list');
      }
    }
  );

  /**
   * GET /users/:id
   * Display user detail/edit page (requires users:read capability)
   */
  fastify.get(
    '/users/:id',
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

        // Check users:read capability
        if (!user.is_superuser && !user.capabilities.includes('users:read')) {
          return reply.code(403).send('Access denied: users:read capability required');
        }

        request.user = user;
      }
    },
    async (request, reply) => {
      try {
        const userId = parseInt(request.params.id);

        if (isNaN(userId)) {
          return reply.code(400).send('Invalid user ID');
        }

        // Get user details
        const targetUser = await User.findById(userId);

        if (!targetUser) {
          return reply.code(404).send('User not found');
        }

        // Get user's roles
        const userRoles = await authorizationService.getUserRoles(userId);

        // Check if current user can edit
        const canEdit = request.user.is_superuser || request.user.capabilities.includes('users:write');
        const canDelete = request.user.is_superuser || request.user.capabilities.includes('users:delete');
        const canManageRoles = request.user.is_superuser || request.user.capabilities.includes('users:manage-roles');

        const navigationMenu = getNavigationMenu(request.user);

        return reply.renderView('users/detail', {
          user: request.user,
          navigationMenu,
          currentPath: '/users',
          targetUser,
          userRoles,
          canEdit,
          canDelete,
          canManageRoles,
          config: {
            appName: 'Headlog',
            version: require('../../package.json').version,
            env: config.env
          }
        });
      } catch (error) {
        fastify.log.error('User detail error:', error.message);
        fastify.log.error('Stack trace:', error.stack);
        return reply.code(500).send('An error occurred loading the user details');
      }
    }
  );
}

module.exports = uiRoutes;
