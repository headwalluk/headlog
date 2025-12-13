/**
 * Authentication Service
 * Handles user authentication, session management, and login/logout operations
 */

const User = require('../models/User');

/**
 * Authenticate user with username/password
 * @param {string} username - Username or email
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} { success: boolean, user?: Object, error?: string }
 */
async function authenticateUser(username, password) {
  try {
    // Try to find user by username first
    let user = await User.findByUsername(username);

    // If not found, try email
    if (!user) {
      user = await User.findByEmail(username);
    }

    // User not found
    if (!user) {
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    // Check if account is active
    if (!user.is_active) {
      return {
        success: false,
        error: 'Account is disabled'
      };
    }

    // Validate password
    const isValid = await User.validatePasswordHash(password, user.password_hash);

    if (!isValid) {
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    // Remove password hash from user object
    delete user.password_hash;

    return {
      success: true,
      user
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}

/**
 * Update user's last login information after successful authentication
 * @param {number} userId - User ID
 * @param {string} ipAddress - IP address
 * @returns {Promise<void>}
 */
async function recordLogin(userId, ipAddress) {
  try {
    await User.updateLastLogin(userId, ipAddress);
  } catch (error) {
    console.error('Failed to record login:', error);
    // Don't fail the login if we can't record it
  }
}

/**
 * Validate session and load user
 * @param {string} userId - User ID from session
 * @returns {Promise<Object|null>} User object or null if invalid
 */
async function validateSession(userId) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return null;
    }

    // Check if account is still active
    if (!user.is_active) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

module.exports = {
  authenticateUser,
  recordLogin,
  validateSession
};
