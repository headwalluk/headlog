/**
 * User Model
 * Handles user account operations including authentication
 */

const bcrypt = require('bcrypt');
const { getPool } = require('../config/database');
const auditService = require('../services/auditService');

const BCRYPT_ROUNDS = 12; // Cost factor for password hashing

// Password requirements
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/`~])/;

/**
 * Validate password strength
 * @param {string} password - Plain text password
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validatePassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    };
  }

  if (!PASSWORD_REGEX.test(password)) {
    return {
      valid: false,
      error: 'Password must contain uppercase, lowercase, number, and special character'
    };
  }

  return { valid: true, error: null };
}

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Validate password against hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password from database
 * @returns {Promise<boolean>} True if password matches
 */
async function validatePasswordHash(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Create new user
 * @param {Object} userData - { username, email, password, is_superuser, created_by, ip_address }
 * @returns {Promise<Object>} Created user object (without password_hash)
 */
async function createUser(userData) {
  const {
    username,
    email,
    password,
    is_superuser = false,
    created_by = null,
    ip_address = null
  } = userData;

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }

  // Hash password
  const password_hash = await hashPassword(password);

  const pool = getPool();

  try {
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, is_superuser) 
       VALUES (?, ?, ?, ?)`,
      [username, email, password_hash, is_superuser]
    );

    const userId = result.insertId;

    // Audit log: user created
    await auditService.logAction({
      user_id: created_by,
      action: 'user.created',
      resource_type: 'user',
      resource_id: userId,
      details: {
        username,
        email,
        is_superuser
      },
      ip_address
    });

    // Return user without password hash
    return {
      id: userId,
      username,
      email,
      is_active: true,
      is_superuser,
      created_at: new Date()
    };
  } catch (error) {
    // Handle duplicate username/email
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('username')) {
        throw new Error('Username already exists');
      }
      if (error.message.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    throw error;
  }
}

/**
 * Find user by ID
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} User object (without password_hash) or null
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username, email, is_active, is_superuser, 
            created_at, updated_at, last_login_at, last_login_ip
     FROM users 
     WHERE id = ?`,
    [id]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find user by username (for login)
 * @param {string} username - Username
 * @returns {Promise<Object|null>} User object (WITH password_hash) or null
 */
async function findByUsername(username) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username, email, password_hash, is_active, is_superuser,
            created_at, updated_at, last_login_at, last_login_ip
     FROM users 
     WHERE username = ?`,
    [username]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find user by email
 * @param {string} email - Email address
 * @returns {Promise<Object|null>} User object (without password_hash) or null
 */
async function findByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username, email, is_active, is_superuser,
            created_at, updated_at, last_login_at, last_login_ip
     FROM users 
     WHERE email = ?`,
    [email]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Update user's last login timestamp and IP
 * @param {number} userId - User ID
 * @param {string} ipAddress - IP address
 * @returns {Promise<void>}
 */
async function updateLastLogin(userId, ipAddress) {
  const pool = getPool();
  await pool.query(
    `UPDATE users 
     SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ? 
     WHERE id = ?`,
    [ipAddress, userId]
  );
}

/**
 * Update user details
 * @param {number} userId - User ID
 * @param {Object} updates - { username?, email?, is_active?, updated_by?, ip_address? }
 * @returns {Promise<Object>} Updated user object
 */
async function updateUser(userId, updates) {
  const pool = getPool();

  const { updated_by = null, ip_address = null, ...userUpdates } = updates;

  const allowedFields = ['username', 'email', 'is_active'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(userUpdates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(userId);

  try {
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    // Audit log: user updated
    await auditService.logAction({
      user_id: updated_by,
      action: 'user.updated',
      resource_type: 'user',
      resource_id: userId,
      details: userUpdates,
      ip_address
    });

    return await findById(userId);
  } catch (error) {
    // Handle duplicate username/email
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('username')) {
        throw new Error('Username already exists');
      }
      if (error.message.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    throw error;
  }
}

/**
 * Reset user password
 * @param {number} userId - User ID
 * @param {string} newPassword - New plain text password
 * @param {Object} options - { reset_by, ip_address }
 * @returns {Promise<void>}
 */
async function resetPassword(userId, newPassword, options = {}) {
  const { reset_by = null, ip_address = null } = options;

  // Validate password
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }

  // Hash password
  const password_hash = await hashPassword(newPassword);

  const pool = getPool();
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, userId]);

  // Audit log: password reset
  await auditService.logAction({
    user_id: reset_by,
    action: 'user.password_reset',
    resource_type: 'user',
    resource_id: userId,
    details: {
      reset_by_self: reset_by === userId
    },
    ip_address
  });
}

/**
 * Delete user
 * @param {number} userId - User ID
 * @param {Object} options - { deleted_by, ip_address }
 * @returns {Promise<void>}
 */
async function deleteUser(userId, options = {}) {
  const { deleted_by = null, ip_address = null } = options;

  // Get user details before deletion for audit log
  const user = await findById(userId);
  if (!user) {
    throw new Error(`User ID ${userId} not found`);
  }

  const pool = getPool();
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);

  // Audit log: user deleted
  await auditService.logAction({
    user_id: deleted_by,
    action: 'user.deleted',
    resource_type: 'user',
    resource_id: userId,
    details: {
      username: user.username,
      email: user.email
    },
    ip_address
  });
}

/**
 * List users with optional filters
 * @param {Object} options - { limit, offset, is_active, search }
 * @returns {Promise<Array>} Array of user objects
 */
async function listUsers(options = {}) {
  const { limit = 100, offset = 0, is_active, search } = options;

  const pool = getPool();
  const conditions = [];
  const params = [];

  if (is_active !== undefined) {
    conditions.push('is_active = ?');
    params.push(is_active);
  }

  if (search) {
    conditions.push('(username LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT id, username, email, is_active, is_superuser,
            created_at, updated_at, last_login_at, last_login_ip
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return rows;
}

/**
 * Get user count
 * @param {Object} filters - { is_active }
 * @returns {Promise<number>} User count
 */
async function getUserCount(filters = {}) {
  const { is_active } = filters;

  const pool = getPool();
  const conditions = [];
  const params = [];

  if (is_active !== undefined) {
    conditions.push('is_active = ?');
    params.push(is_active);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(`SELECT COUNT(*) as count FROM users ${whereClause}`, params);

  return rows[0].count;
}

module.exports = {
  createUser,
  findById,
  findByUsername,
  findByEmail,
  updateLastLogin,
  updateUser,
  resetPassword,
  deleteUser,
  listUsers,
  getUserCount,
  validatePassword,
  validatePasswordHash,
  PASSWORD_MIN_LENGTH
};
