/**
 * Authentication Routes
 * Handles login, logout, and session management
 */

const authService = require('../services/authService');
const config = require('../config');

async function authRoutes(fastify, _options) {
  /**
   * POST /auth/login
   * Authenticate user and create session
   */
  fastify.post('/login', async (request, reply) => {
    const { username, password, rememberMe } = request.body;

    if (!username || !password) {
      return reply.renderView('login', {
        error: 'Username and password are required',
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        },
        user: null
      });
    }

    try {
      // Authenticate user
      const result = await authService.authenticateUser(username, password);

      if (!result.success) {
        return reply.renderView('login', {
          error: result.error || 'Invalid username or password',
          config: {
            appName: 'Headlog',
            version: require('../../package.json').version,
            env: config.env
          },
          user: null
        });
      }

      const user = result.user;

      // Record login
      const ipAddress = request.ip;
      await authService.recordLogin(user.id, ipAddress);

      // Create session - set user_id FIRST before any other properties
      request.session.user_id = user.id;
      request.session.ip_address = ipAddress;
      request.session.user_agent = request.headers['user-agent'] || null;

      // Extend session if remember me
      if (rememberMe) {
        request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }

      // Save session explicitly BEFORE redirect to ensure user_id is persisted
      await new Promise((resolve, reject) => {
        request.session.save(err => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Redirect to dashboard
      return reply.redirect('/dashboard');
    } catch (error) {
      fastify.log.error('Login error:', error);
      return reply.renderView('login', {
        error: 'An error occurred during login. Please try again.',
        config: {
          appName: 'Headlog',
          version: require('../../package.json').version,
          env: config.env
        },
        user: null
      });
    }
  });

  /**
   * POST /auth/logout
   * Destroy session and redirect to login
   */
  fastify.post('/logout', async (request, reply) => {
    if (request.session) {
      await new Promise((resolve, reject) => {
        request.session.destroy((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    return reply.redirect('/login');
  });

  /**
   * GET /auth/status
   * Return authentication status (for AJAX)
   */
  fastify.get('/status', async (request, _reply) => {
    const authenticated = !!(request.session && request.session.user_id);

    if (authenticated) {
      const user = await authService.validateSession(request.session.user_id);
      return {
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_superuser: user.is_superuser
        }
      };
    }

    return {
      authenticated: false,
      user: null
    };
  });
}

module.exports = authRoutes;
