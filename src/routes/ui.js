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

  // ============================================================================
  // WEBSITES ROUTES
  // ============================================================================

  /**
   * GET /websites
   * Display websites list page (requires websites:read capability)
   */
  fastify.get('/websites', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:read')) {
        return reply.code(403).send('Access denied: websites:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const { search, page = 1 } = request.query;
      const limit = 25;
      const offset = (parseInt(page) - 1) * limit;

      const filters = {};
      if (search) {
        filters.search = search;
      }

      // Get websites with log counts
      const websites = await Website.listWebsites({ ...filters, limit, offset });
      
      // Get log count for each website
      const pool = getPool();
      for (var i = 0; i < websites.length; i++) {
        var [logRows] = await pool.query(
          'SELECT COUNT(*) as count FROM log_records WHERE website_id = ?',
          [websites[i].id]
        );
        websites[i].log_count = logRows[0].count;
      }

      const totalCount = await Website.getWebsiteCount(filters);
      const totalPages = Math.ceil(totalCount / limit);

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('websites/list', {
        user: request.user,
        navigationMenu,
        currentPath: '/websites',
        websites,
        search: search || '',
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit
        },
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Websites list error:', error.message);
      fastify.log.error('Stack trace:', error.stack);
      return reply.code(500).send('An error occurred loading the websites list');
    }
  });

  /**
   * GET /websites/new
   * Display create website form (requires websites:write capability)
   */
  fastify.get('/websites/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:write')) {
        return reply.code(403).send('Access denied: websites:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    const navigationMenu = getNavigationMenu(request.user);
    return reply.renderView('websites/form', {
      user: request.user,
      navigationMenu,
      currentPath: '/websites',
      targetWebsite: null,
      error: request.query.error || null,
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      }
    });
  });

  /**
   * POST /websites/new
   * Create new website (requires websites:write capability)
   */
  fastify.post('/websites/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:write')) {
        return reply.code(403).send('Access denied: websites:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const { domain, is_ssl, is_dev, owner_email, admin_email } = request.body;

      const website = await Website.createWebsite({
        domain: domain.trim(),
        is_ssl: is_ssl === '1',
        is_dev: is_dev === '1',
        owner_email: owner_email ? owner_email.trim() : null,
        admin_email: admin_email ? admin_email.trim() : null,
        created_by: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/websites/' + website.id + '?success=' + encodeURIComponent('Website created successfully'));
    } catch (error) {
      fastify.log.error('Create website error:', error.message);
      return reply.redirect('/websites/new?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /websites/:id
   * Display website detail page (requires websites:read capability)
   */
  fastify.get('/websites/:id', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:read')) {
        return reply.code(403).send('Access denied: websites:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const websiteId = parseInt(request.params.id);

      if (isNaN(websiteId)) {
        return reply.code(400).send('Invalid website ID');
      }

      const website = await Website.findById(websiteId);
      if (!website) {
        return reply.code(404).send('Website not found');
      }

      const logCount = await Website.getLogCount(websiteId);
      const recentLogs = await Website.getRecentLogs(websiteId, 10);

      // Get log type breakdown for last 7 days
      const pool = getPool();
      const [logTypeRows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN log_type = 'access' THEN 1 ELSE 0 END) as access,
          SUM(CASE WHEN log_type = 'error' THEN 1 ELSE 0 END) as error
         FROM log_records 
         WHERE website_id = ? 
           AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [websiteId]
      );

      const logTypeStats = {
        total: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].total || 0) : 0,
        access: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].access || 0) : 0,
        error: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].error || 0) : 0
      };

      // Get daily stats for last 7 days
      const [dailyRows] = await pool.query(
        `SELECT 
          DATE(timestamp) as date,
          COUNT(*) as total,
          SUM(CASE WHEN log_type = 'access' THEN 1 ELSE 0 END) as access,
          SUM(CASE WHEN log_type = 'error' THEN 1 ELSE 0 END) as error
         FROM log_records 
         WHERE website_id = ? 
           AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         GROUP BY DATE(timestamp)
         ORDER BY DATE(timestamp) DESC`,
        [websiteId]
      );

      const canEdit = request.user.is_superuser || request.user.capabilities.includes('websites:write');
      const canDelete = request.user.is_superuser || request.user.capabilities.includes('websites:delete');

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('websites/detail', {
        user: request.user,
        navigationMenu,
        currentPath: '/websites',
        website,
        logCount,
        logTypeStats,
        dailyStats: dailyRows,
        recentLogs,
        canEdit,
        canDelete,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Website detail error:', error);
      console.log(error);
      return reply.code(500).send('An error occurred loading the website details');
    }
  });

  /**
   * GET /websites/:id/edit
   * Display edit website form (requires websites:write capability)
   */
  fastify.get('/websites/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:write')) {
        return reply.code(403).send('Access denied: websites:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const websiteId = parseInt(request.params.id);

      if (isNaN(websiteId)) {
        return reply.code(400).send('Invalid website ID');
      }

      const targetWebsite = await Website.findById(websiteId);
      if (!targetWebsite) {
        return reply.code(404).send('Website not found');
      }

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('websites/form', {
        user: request.user,
        navigationMenu,
        currentPath: '/websites',
        targetWebsite,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Website edit form error:', error.message);
      return reply.code(500).send('An error occurred loading the edit form');
    }
  });

  /**
   * POST /websites/:id/edit
   * Update website (requires websites:write capability)
   */
  fastify.post('/websites/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:write')) {
        return reply.code(403).send('Access denied: websites:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const websiteId = parseInt(request.params.id);

      if (isNaN(websiteId)) {
        return reply.code(400).send('Invalid website ID');
      }

      const { domain, is_ssl, is_dev, owner_email, admin_email } = request.body;

      const updates = {
        domain: domain.trim(),
        is_ssl: is_ssl === '1',
        is_dev: is_dev === '1',
        owner_email: owner_email && owner_email.trim() ? owner_email.trim() : null,
        admin_email: admin_email && admin_email.trim() ? admin_email.trim() : null
      };

      await Website.updateWebsite(websiteId, updates, {
        user_id: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/websites/' + websiteId + '?success=' + encodeURIComponent('Website updated successfully'));
    } catch (error) {
      fastify.log.error('Update website error:', error.message);
      return reply.redirect('/websites/' + request.params.id + '/edit?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /websites/:id/delete
   * Delete website (requires websites:delete capability)
   */
  fastify.post('/websites/:id/delete', {
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

      if (!user.is_superuser && !user.capabilities.includes('websites:delete')) {
        return reply.code(403).send('Access denied: websites:delete capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Website = require('../models/Website');
      const websiteId = parseInt(request.params.id);

      if (isNaN(websiteId)) {
        return reply.code(400).send('Invalid website ID');
      }

      await Website.deleteWebsite(websiteId, {
        user_id: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/websites?success=' + encodeURIComponent('Website deleted successfully'));
    } catch (error) {
      fastify.log.error('Delete website error:', error.message);
      return reply.redirect('/websites/' + request.params.id + '?error=' + encodeURIComponent(error.message));
    }
  });

  // ============================================================================
  // HOSTS ROUTES
  // ============================================================================

  /**
   * GET /hosts
   * Display hosts list page (requires hosts:read capability)
   */
  fastify.get('/hosts', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:read')) {
        return reply.code(403).send('Access denied: hosts:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const { search, page = 1 } = request.query;
      const limit = 25;
      const offset = (parseInt(page) - 1) * limit;

      const filters = {};
      if (search) {
        filters.search = search;
      }

      const hosts = await Host.listHosts({ ...filters, limit, offset });
      
      // Get log count for each host
      const pool = getPool();
      for (var i = 0; i < hosts.length; i++) {
        var [logRows] = await pool.query(
          'SELECT COUNT(*) as count FROM log_records WHERE host_id = ?',
          [hosts[i].id]
        );
        hosts[i].log_count = logRows[0].count;
      }

      const totalCount = await Host.getHostCount(filters);
      const totalPages = Math.ceil(totalCount / limit);

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('hosts/list', {
        user: request.user,
        navigationMenu,
        currentPath: '/hosts',
        hosts,
        search: search || '',
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit
        },
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
    //   fastify.log.error('Hosts list error:', error.message);
    //   fastify.log.error('Stack trace:', error.stack);
        console.log(error);
      return reply.code(500).send('An error occurred loading the hosts list');
    }
  });

  /**
   * GET /hosts/new
   * Display create host form (requires hosts:write capability)
   */
  fastify.get('/hosts/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:write')) {
        return reply.code(403).send('Access denied: hosts:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    const navigationMenu = getNavigationMenu(request.user);
    return reply.renderView('hosts/form', {
      user: request.user,
      navigationMenu,
      currentPath: '/hosts',
      targetHost: null,
      error: request.query.error || null,
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      }
    });
  });

  /**
   * POST /hosts/new
   * Create new host (requires hosts:write capability)
   */
  fastify.post('/hosts/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:write')) {
        return reply.code(403).send('Access denied: hosts:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const { hostname } = request.body;

      const host = await Host.createHost({
        hostname: hostname.trim(),
        created_by: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/hosts/' + host.id + '?success=' + encodeURIComponent('Host created successfully'));
    } catch (error) {
      fastify.log.error('Create host error:', error.message);
      return reply.redirect('/hosts/new?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /hosts/:id
   * Display host detail page (requires hosts:read capability)
   */
  fastify.get('/hosts/:id', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:read')) {
        return reply.code(403).send('Access denied: hosts:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const hostId = parseInt(request.params.id);

      if (isNaN(hostId)) {
        return reply.code(400).send('Invalid host ID');
      }

      const host = await Host.findById(hostId);
      if (!host) {
        return reply.code(404).send('Host not found');
      }

      const logCount = await Host.getLogCount(hostId);
      const recentLogs = await Host.getRecentLogs(hostId, 10);
      const associatedWebsites = await Host.getAssociatedWebsites(hostId);

      // Get log type breakdown for last 7 days
      const pool = getPool();
      const [logTypeRows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN log_type = 'access' THEN 1 ELSE 0 END) as access,
          SUM(CASE WHEN log_type = 'error' THEN 1 ELSE 0 END) as error
         FROM log_records 
         WHERE host_id = ? 
           AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [hostId]
      );

      const logTypeStats = {
        total: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].total || 0) : 0,
        access: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].access || 0) : 0,
        error: (logTypeRows && logTypeRows[0]) ? (logTypeRows[0].error || 0) : 0
      };

      // Get daily stats for last 7 days
      const [dailyRows] = await pool.query(
        `SELECT 
          DATE(timestamp) as date,
          COUNT(*) as total,
          SUM(CASE WHEN log_type = 'access' THEN 1 ELSE 0 END) as access,
          SUM(CASE WHEN log_type = 'error' THEN 1 ELSE 0 END) as error
         FROM log_records 
         WHERE host_id = ? 
           AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         GROUP BY DATE(timestamp)
         ORDER BY DATE(timestamp) DESC`,
        [hostId]
      );

      const canEdit = request.user.is_superuser || request.user.capabilities.includes('hosts:write');
      const canDelete = request.user.is_superuser || request.user.capabilities.includes('hosts:delete');

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('hosts/detail', {
        user: request.user,
        navigationMenu,
        currentPath: '/hosts',
        host,
        logCount,
        logTypeStats,
        dailyStats: dailyRows,
        recentLogs,
        associatedWebsites,
        canEdit,
        canDelete,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Host detail error:', error);
      console.log(error);
      return reply.code(500).send('An error occurred loading the host details');
    }
  });

  /**
   * GET /hosts/:id/edit
   * Display edit host form (requires hosts:write capability)
   */
  fastify.get('/hosts/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:write')) {
        return reply.code(403).send('Access denied: hosts:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const hostId = parseInt(request.params.id);

      if (isNaN(hostId)) {
        return reply.code(400).send('Invalid host ID');
      }

      const targetHost = await Host.findById(hostId);
      if (!targetHost) {
        return reply.code(404).send('Host not found');
      }

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('hosts/form', {
        user: request.user,
        navigationMenu,
        currentPath: '/hosts',
        targetHost,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Host edit form error:', error.message);
      return reply.code(500).send('An error occurred loading the edit form');
    }
  });

  /**
   * POST /hosts/:id/edit
   * Update host (requires hosts:write capability)
   */
  fastify.post('/hosts/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:write')) {
        return reply.code(403).send('Access denied: hosts:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const hostId = parseInt(request.params.id);

      if (isNaN(hostId)) {
        return reply.code(400).send('Invalid host ID');
      }

      const { hostname } = request.body;

      await Host.updateHost(hostId, { hostname: hostname.trim() }, {
        user_id: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/hosts/' + hostId + '?success=' + encodeURIComponent('Host updated successfully'));
    } catch (error) {
      fastify.log.error('Update host error:', error.message);
      return reply.redirect('/hosts/' + request.params.id + '/edit?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /hosts/:id/delete
   * Delete host (requires hosts:delete capability)
   */
  fastify.post('/hosts/:id/delete', {
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

      if (!user.is_superuser && !user.capabilities.includes('hosts:delete')) {
        return reply.code(403).send('Access denied: hosts:delete capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const Host = require('../models/Host');
      const hostId = parseInt(request.params.id);

      if (isNaN(hostId)) {
        return reply.code(400).send('Invalid host ID');
      }

      await Host.deleteHost(hostId, {
        user_id: request.user.id,
        ip_address: request.ip
      });

      return reply.redirect('/hosts?success=' + encodeURIComponent('Host deleted successfully'));
    } catch (error) {
      fastify.log.error('Delete host error:', error.message);
      return reply.redirect('/hosts/' + request.params.id + '?error=' + encodeURIComponent(error.message));
    }
  });

  // ============================================================================
  // ROLES ROUTES
  // ============================================================================

  /**
   * GET /roles
   * Display roles list page (requires roles:read capability)
   */
  fastify.get('/roles', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:read')) {
        return reply.code(403).send('Access denied: roles:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roles = await Role.listRoles();
      
      // Get capability and user counts for each role
      for (let i = 0; i < roles.length; i++) {
        const capabilities = await Role.getCapabilities(roles[i].id);
        roles[i].capability_count = capabilities.length;
        roles[i].user_count = await Role.getUserCount(roles[i].id);
      }

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('roles/list', {
        user: request.user,
        navigationMenu,
        currentPath: '/roles',
        roles,
        totalCount: roles.length,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Roles list error:', error);
      return reply.code(500).send('An error occurred loading the roles list');
    }
  });

  /**
   * GET /roles/new
   * Display create role form (requires roles:write capability)
   */
  fastify.get('/roles/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:write')) {
        return reply.code(403).send('Access denied: roles:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    const navigationMenu = getNavigationMenu(request.user);
    return reply.renderView('roles/form', {
      user: request.user,
      navigationMenu,
      currentPath: '/roles',
      targetRole: null,
      error: request.query.error || null,
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      }
    });
  });

  /**
   * POST /roles/new
   * Create new role (requires roles:write capability)
   */
  fastify.post('/roles/new', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:write')) {
        return reply.code(403).send('Access denied: roles:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const { name, description } = request.body;

      const role = await Role.createRole({
        name: name.trim(),
        description: description.trim(),
        is_system: false
      });

      return reply.redirect('/roles/' + role.id + '?success=' + encodeURIComponent('Role created successfully'));
    } catch (error) {
      fastify.log.error('Create role error:', error.message);
      return reply.redirect('/roles/new?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /roles/:id
   * Display role detail page (requires roles:read capability)
   */
  fastify.get('/roles/:id', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:read')) {
        return reply.code(403).send('Access denied: roles:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);

      if (isNaN(roleId)) {
        return reply.code(400).send('Invalid role ID');
      }

      const role = await Role.findById(roleId);
      if (!role) {
        return reply.code(404).send('Role not found');
      }

      const capabilities = await Role.getCapabilities(roleId);
      const userCount = await Role.getUserCount(roleId);

      // Get users with this role
      const pool = getPool();
      const [users] = await pool.query(
        `SELECT u.id, u.username, u.email, u.is_active, ur.assigned_at
         FROM users u
         INNER JOIN user_roles ur ON u.id = ur.user_id
         WHERE ur.role_id = ?
         ORDER BY u.username`,
        [roleId]
      );

      const canEdit = request.user.is_superuser || request.user.capabilities.includes('roles:write');
      const canDelete = request.user.is_superuser || request.user.capabilities.includes('roles:delete');
      const canManageCapabilities = request.user.is_superuser || request.user.capabilities.includes('roles:manage-capabilities');

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('roles/detail', {
        user: request.user,
        navigationMenu,
        currentPath: '/roles',
        role,
        capabilities,
        userCount,
        users,
        canEdit,
        canDelete,
        canManageCapabilities,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Role detail error:', error);
      return reply.code(500).send('An error occurred loading the role details');
    }
  });

  /**
   * GET /roles/:id/edit
   * Display edit role form (requires roles:write capability)
   */
  fastify.get('/roles/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:write')) {
        return reply.code(403).send('Access denied: roles:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);

      if (isNaN(roleId)) {
        return reply.code(400).send('Invalid role ID');
      }

      const targetRole = await Role.findById(roleId);
      if (!targetRole) {
        return reply.code(404).send('Role not found');
      }

      if (targetRole.is_system) {
        return reply.code(403).send('Cannot edit system roles');
      }

      // Get stats for sidebar
      const capCount = await Role.getCapabilities(roleId);
      targetRole.capabilities_count = capCount.length;
      targetRole.user_count = await Role.getUserCount(roleId);

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('roles/form', {
        user: request.user,
        navigationMenu,
        currentPath: '/roles',
        targetRole,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Role edit form error:', error.message);
      return reply.code(500).send('An error occurred loading the edit form');
    }
  });

  /**
   * POST /roles/:id/edit
   * Update role (requires roles:write capability)
   */
  fastify.post('/roles/:id/edit', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:write')) {
        return reply.code(403).send('Access denied: roles:write capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);

      if (isNaN(roleId)) {
        return reply.code(400).send('Invalid role ID');
      }

      const { name, description } = request.body;

      await Role.updateRole(roleId, {
        name: name.trim(),
        description: description.trim()
      });

      return reply.redirect('/roles/' + roleId + '?success=' + encodeURIComponent('Role updated successfully'));
    } catch (error) {
      fastify.log.error('Update role error:', error.message);
      return reply.redirect('/roles/' + request.params.id + '/edit?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /roles/:id/delete
   * Delete role (requires roles:delete capability)
   */
  fastify.post('/roles/:id/delete', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:delete')) {
        return reply.code(403).send('Access denied: roles:delete capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);

      if (isNaN(roleId)) {
        return reply.code(400).send('Invalid role ID');
      }

      await Role.deleteRole(roleId);

      return reply.redirect('/roles?success=' + encodeURIComponent('Role deleted successfully'));
    } catch (error) {
      fastify.log.error('Delete role error:', error.message);
      return reply.redirect('/roles/' + request.params.id + '?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /roles/:id/capabilities
   * Manage role capabilities (requires roles:manage-capabilities capability)
   */
  fastify.get('/roles/:id/capabilities', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:manage-capabilities')) {
        return reply.code(403).send('Access denied: roles:manage-capabilities capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);

      if (isNaN(roleId)) {
        return reply.code(400).send('Invalid role ID');
      }

      const role = await Role.findById(roleId);
      if (!role) {
        return reply.code(404).send('Role not found');
      }

      // Get assigned capabilities
      const assignedCapabilities = await Role.getCapabilities(roleId);
      const assignedIds = assignedCapabilities.map(c => c.id);

      // Get all capabilities
      const pool = getPool();
      const [allCapabilities] = await pool.query('SELECT * FROM capabilities ORDER BY category, name');

      // Filter available (not yet assigned)
      const availableCapabilities = allCapabilities.filter(c => !assignedIds.includes(c.id));

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('roles/capabilities', {
        user: request.user,
        navigationMenu,
        currentPath: '/roles',
        role,
        assignedCapabilities,
        availableCapabilities,
        success: request.query.success || null,
        error: request.query.error || null,
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        }
      });
    } catch (error) {
      fastify.log.error('Role capabilities page error:', error);
      return reply.code(500).send('An error occurred loading the capabilities management page');
    }
  });

  /**
   * POST /roles/:id/capabilities/:capabilityId/grant
   * Grant capability to role (requires roles:manage-capabilities capability)
   */
  fastify.post('/roles/:id/capabilities/:capabilityId/grant', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:manage-capabilities')) {
        return reply.code(403).send('Access denied: roles:manage-capabilities capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);
      const capabilityId = parseInt(request.params.capabilityId);

      if (isNaN(roleId) || isNaN(capabilityId)) {
        return reply.code(400).send('Invalid role or capability ID');
      }

      await Role.grantCapability(roleId, capabilityId, request.user.id);

      return reply.redirect('/roles/' + roleId + '/capabilities?success=' + encodeURIComponent('Capability granted successfully'));
    } catch (error) {
      fastify.log.error('Grant capability error:', error.message);
      return reply.redirect('/roles/' + request.params.id + '/capabilities?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * POST /roles/:id/capabilities/:capabilityId/revoke
   * Revoke capability from role (requires roles:manage-capabilities capability)
   */
  fastify.post('/roles/:id/capabilities/:capabilityId/revoke', {
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

      if (!user.is_superuser && !user.capabilities.includes('roles:manage-capabilities')) {
        return reply.code(403).send('Access denied: roles:manage-capabilities capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const roleId = parseInt(request.params.id);
      const capabilityId = parseInt(request.params.capabilityId);

      if (isNaN(roleId) || isNaN(capabilityId)) {
        return reply.code(400).send('Invalid role or capability ID');
      }

      await Role.revokeCapability(roleId, capabilityId);

      return reply.redirect('/roles/' + roleId + '/capabilities?success=' + encodeURIComponent('Capability revoked successfully'));
    } catch (error) {
      fastify.log.error('Revoke capability error:', error.message);
      return reply.redirect('/roles/' + request.params.id + '/capabilities?error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * GET /logs - Log Explorer
   * View and filter log records
   */
  fastify.get('/logs', {
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

      if (!user.is_superuser && !user.capabilities.includes('logs:read')) {
        return reply.code(403).send('Access denied: logs:read capability required');
      }

      request.user = user;
    }
  }, async (request, reply) => {
    try {
      const LogRecord = require('../models/LogRecord');
      
      // Parse query parameters
      const {
        website,
        host,
        type,
        code,
        remote,
        from,
        to,
        search,
        page = 1,
        limit = 50,
        dateRange = '7d'
      } = request.query;

      // Handle date range presets
      let fromDate = from;
      let toDate = to;
      
      if (!from && dateRange !== 'custom') {
        const now = new Date();
        toDate = now.toISOString();
        
        switch (dateRange) {
          case '24h':
            fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            break;
          case '30d':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            break;
          case '7d':
          default:
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
        }
      }

      // Get filter options for dropdowns
      const filterOptions = await LogRecord.getFilterOptions();

      // Search logs
      const result = await LogRecord.searchLogs({
        website,
        host,
        type,
        code,
        remote,
        from: fromDate,
        to: toDate,
        search,
        page,
        limit
      });

      // Pass filters back to view for maintaining state
      const filters = {
        website,
        host,
        type,
        code,
        remote,
        from: fromDate,
        to: toDate,
        search,
        dateRange,
        limit
      };

      const navigationMenu = getNavigationMenu(request.user);

      return reply.renderView('logs/explorer', {
        user: request.user,
        navigationMenu,
        logs: result.logs,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        filterOptions,
        filters,
        // Individual filter values for form
        website,
        host,
        type,
        code,
        remote,
        from: fromDate,
        to: toDate,
        search,
        dateRange
      });
    } catch (error) {
      fastify.log.error('Log explorer error:', error);
      return reply.code(500).send('Failed to load log explorer');
    }
  });
}

module.exports = uiRoutes;
