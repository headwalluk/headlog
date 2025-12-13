/**
 * UI Routes
 * Handles page rendering for the web interface
 */

const authorizationService = require('../services/authorizationService');
const config = require('../config');
const { getPool } = require('../config/database');
const { getNavigationMenu } = require('../utils/uiHelpers');
const User = require('../models/User');
const Role = require('../models/Role');

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
          success: request.query.success || null,
          error: request.query.error || null,
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

  /**
   * GET /users/new
   * Display create user form (requires users:write capability)
   */
  fastify.get('/users/new', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:write')) {
        return reply.code(403).send('Access denied: users:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    const navigationMenu = getNavigationMenu(request.user);
    return reply.renderView('users/form', {
      user: request.user,
      navigationMenu,
      currentPath: '/users',
      targetUser: null,
      error: request.query.error || null,
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      }
    });
  });

  /**
   * GET /users/:id/edit
   * Display edit user form (requires users:write capability)
   */
  fastify.get('/users/:id/edit', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:write')) {
        return reply.code(403).send('Access denied: users:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      if (isNaN(userId)) {
        return reply.code(400).send('Invalid user ID');
      }

      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return reply.code(404).send('User not found');
      }

      const navigationMenu = getNavigationMenu(request.user);
      return reply.renderView('users/form', {
        user: request.user,
        navigationMenu,
        currentPath: '/users',
        targetUser,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('User edit form error:', error.message);
      return reply.code(500).send('An error occurred loading the edit form');
    }
  });

  /**
   * POST /users/create
   * Create new user (requires users:write capability)
   */
  fastify.post('/users/create', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:write')) {
        return reply.code(403).send('Access denied: users:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const { username, email, password, confirmPassword, is_active, is_superuser } = request.body;

      // Validate passwords match
      if (password !== confirmPassword) {
        return reply.redirect('/users/new?error=' + encodeURIComponent('Passwords do not match'));
      }

      // Only superusers can create superusers
      const makeSuperuser = is_superuser === '1' && request.user.is_superuser;

      const newUser = await User.createUser({
        username,
        email,
        password,
        is_superuser: makeSuperuser,
        created_by: request.user.id,
        ip_address: request.ip
      });

      // If not active, update it
      if (is_active !== '1') {
        await User.updateUser(newUser.id, {
          is_active: 0,
          updated_by: request.user.id,
          ip_address: request.ip
        });
      }

      return reply.redirect('/users/' + newUser.id);
    } catch (error) {
      fastify.log.error('Create user error:', error.message);
      return reply.redirect('/users/new?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /users/:id/update
   * Update existing user (requires users:write capability)
   */
  fastify.post('/users/:id/update', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:write')) {
        return reply.code(403).send('Access denied: users:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      if (isNaN(userId)) {
        return reply.code(400).send('Invalid user ID');
      }

      const { username, email, is_active } = request.body;

      const updates = {
        username,
        email,
        is_active: is_active === '1' ? 1 : 0,
        updated_by: request.user.id,
        ip_address: request.ip
      };

      await User.updateUser(userId, updates);
      return reply.redirect('/users/' + userId);
    } catch (error) {
      fastify.log.error('Update user error:', error.message);
      return reply.redirect('/users/' + request.params.id + '/edit?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /users/:id/delete
   * Delete user (requires users:delete capability)
   */
  fastify.post('/users/:id/delete', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:delete')) {
        return reply.code(403).send('Access denied: users:delete capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      if (isNaN(userId)) {
        return reply.code(400).send('Invalid user ID');
      }

      // Prevent self-deletion
      if (userId === request.user.id) {
        return reply.code(400).send('Cannot delete your own account');
      }

      await User.deleteUser(userId, {
        deleted_by: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/users');
    } catch (error) {
      fastify.log.error('Delete user error:', error.message);
      return reply.code(500).send('An error occurred deleting the user');
    }
  });

  /**
   * POST /users/:id/reset-password
   * Reset user password (requires users:reset-password capability)
   */
  fastify.post('/users/:id/reset-password', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:reset-password')) {
        return reply.code(403).send('Access denied: users:reset-password capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      if (isNaN(userId)) {
        return reply.code(400).send('Invalid user ID');
      }

      const { password, confirmPassword } = request.body;

      if (password !== confirmPassword) {
        return reply.redirect('/users/' + userId + '?error=' + encodeURIComponent('Passwords do not match'));
      }

      await User.resetPassword(userId, password, {
        reset_by: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/users/' + userId + '?success=' + encodeURIComponent('Password reset successfully'));
    } catch (error) {
      fastify.log.error('Reset password error:', error.message);
      return reply.redirect('/users/' + request.params.id + '?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /users/:id/roles
   * Manage user roles (requires users:manage-roles capability)
   */
  fastify.get('/users/:id/roles', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:manage-roles')) {
        return reply.code(403).send('Access denied: users:manage-roles capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      if (isNaN(userId)) {
        return reply.code(400).send('Invalid user ID');
      }

      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return reply.code(404).send('User not found');
      }

      // Get user's current roles
      const userRoles = await authorizationService.getUserRoles(userId);

      // Get all available roles with their capabilities
      const allRoles = await Role.listRoles();

      // Get capabilities for each role
      for (let i = 0; i < allRoles.length; i++) {
        allRoles[i].capabilities = await Role.getCapabilities(allRoles[i].id);
      }

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('users/roles', {
        user: request.user,
        navigationMenu,
        currentPath: '/users',
        targetUser,
        userRoles,
        allRoles,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('User roles page error:', error.message);
      return reply.code(500).send('An error occurred loading the role management page');
    }
  });

  /**
   * POST /users/:id/roles/:roleId/assign
   * Assign role to user (requires users:manage-roles capability)
   */
  fastify.post('/users/:id/roles/:roleId/assign', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:manage-roles')) {
        return reply.code(403).send('Access denied: users:manage-roles capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      const roleId = parseInt(request.params.roleId);

      if (isNaN(userId) || isNaN(roleId)) {
        return reply.code(400).send('Invalid user or role ID');
      }

      await authorizationService.assignRole(userId, roleId, request.user.id);

      return reply.redirect('/users/' + userId + '/roles?success=' + encodeURIComponent('Role assigned successfully'));
    } catch (error) {
      fastify.log.error('Assign role error:', error.message);
      return reply.redirect('/users/' + request.params.id + '/roles?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /users/:id/roles/:roleId/remove
   * Remove role from user (requires users:manage-roles capability)
   */
  fastify.post('/users/:id/roles/:roleId/remove', {
    preHandler: async (request, reply) => {
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);

      if (!user.is_superuser && !user.capabilities.includes('users:manage-roles')) {
        return reply.code(403).send('Access denied: users:manage-roles capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const userId = parseInt(request.params.id);
      const roleId = parseInt(request.params.roleId);

      if (isNaN(userId) || isNaN(roleId)) {
        return reply.code(400).send('Invalid user or role ID');
      }

      await authorizationService.removeRole(userId, roleId);

      return reply.redirect('/users/' + userId + '/roles?success=' + encodeURIComponent('Role removed successfully'));
    } catch (error) {
      fastify.log.error('Remove role error:', error.message);
      return reply.redirect('/users/' + request.params.id + '/roles?error=' + encodeURIComponent(error.message));
    }
  });
}

module.exports = uiRoutes;
