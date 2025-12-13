/**
 * Authorization Service
 * Handles role-based access control (RBAC) checks and assignments
 */

const Role = require('../models/Role');
const Capability = require('../models/Capability');
const { getPool } = require('../config/database');

/**
 * Check if a user has a specific capability
 * Superusers automatically have all capabilities
 * @param {number} userId - User ID
 * @param {string} capabilityName - Capability name (e.g., 'logs:read')
 * @returns {Promise<boolean>} True if user has the capability
 */
async function checkUserCapability(userId, capabilityName) {
  const pool = getPool();

  // Check if user is a superuser (has all capabilities)
  const [userRows] = await pool.query(
    'SELECT is_superuser FROM users WHERE id = ? AND is_active = 1',
    [userId]
  );

  if (userRows.length === 0) {
    return false; // User not found or inactive
  }

  if (userRows[0].is_superuser) {
    return true; // Superusers have all capabilities
  }

  // Check if user has the capability through any of their roles
  const [capRows] = await pool.query(
    `SELECT 1
     FROM capabilities c
     INNER JOIN role_capabilities rc ON c.id = rc.capability_id
     INNER JOIN user_roles ur ON rc.role_id = ur.role_id
     WHERE ur.user_id = ? AND c.name = ?
     LIMIT 1`,
    [userId, capabilityName]
  );

  return capRows.length > 0;
}

/**
 * Get all roles assigned to a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of role objects with assignment details
 */
async function getUserRoles(userId) {
  return await Role.findByUserId(userId);
}

/**
 * Get all capabilities for a user (flattened from all roles)
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of unique capability objects
 */
async function getUserCapabilities(userId) {
  const pool = getPool();

  // Check if user is a superuser
  const [userRows] = await pool.query('SELECT is_superuser FROM users WHERE id = ?', [userId]);

  if (userRows.length === 0) {
    return [];
  }

  if (userRows[0].is_superuser) {
    // Superusers get all capabilities
    return await Capability.listCapabilities({ limit: 1000 });
  }

  // Get capabilities through roles
  return await Capability.findByUserId(userId);
}

/**
 * Assign a role to a user
 * @param {number} userId - User ID
 * @param {number} roleId - Role ID
 * @param {number} assignedBy - User ID who is making the assignment
 * @returns {Promise<boolean>} True if assigned (false if already assigned)
 */
async function assignRole(userId, roleId, assignedBy) {
  const pool = getPool();

  // Verify role exists
  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error(`Role ID ${roleId} not found`);
  }

  // Check if already assigned
  const [existing] = await pool.query(
    'SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, roleId]
  );

  if (existing.length > 0) {
    return false; // Already assigned
  }

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
     VALUES (?, ?, NOW(), ?)`,
    [userId, roleId, assignedBy]
  );

  return true;
}

/**
 * Remove a role from a user
 * @param {number} userId - User ID
 * @param {number} roleId - Role ID
 * @returns {Promise<boolean>} True if removed
 */
async function removeRole(userId, roleId) {
  const pool = getPool();

  const [result] = await pool.query('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [
    userId,
    roleId
  ]);

  return result.affectedRows > 0;
}

/**
 * Grant a capability to a role
 * @param {number} roleId - Role ID
 * @param {number} capabilityId - Capability ID
 * @param {number} grantedBy - User ID who granted this capability
 * @returns {Promise<boolean>} True if granted (false if already assigned)
 */
async function grantCapability(roleId, capabilityId, grantedBy) {
  return await Role.grantCapability(roleId, capabilityId, grantedBy);
}

/**
 * Revoke a capability from a role
 * @param {number} roleId - Role ID
 * @param {number} capabilityId - Capability ID
 * @returns {Promise<boolean>} True if revoked
 */
async function revokeCapability(roleId, capabilityId) {
  return await Role.revokeCapability(roleId, capabilityId);
}

/**
 * Get all users who have a specific role
 * @param {number} roleId - Role ID
 * @returns {Promise<Array>} Array of user objects with assignment details
 */
async function getUsersByRole(roleId) {
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.email, u.is_active, u.is_superuser,
            ur.assigned_at, ur.assigned_by
     FROM users u
     INNER JOIN user_roles ur ON u.id = ur.user_id
     WHERE ur.role_id = ?
     ORDER BY u.username`,
    [roleId]
  );

  return rows;
}

/**
 * Check if user has any of the specified capabilities
 * Useful for OR conditions (user needs at least one)
 * @param {number} userId - User ID
 * @param {Array<string>} capabilityNames - Array of capability names
 * @returns {Promise<boolean>} True if user has at least one capability
 */
async function checkUserHasAnyCapability(userId, capabilityNames) {
  const pool = getPool();

  // Check if user is a superuser
  const [userRows] = await pool.query(
    'SELECT is_superuser FROM users WHERE id = ? AND is_active = 1',
    [userId]
  );

  if (userRows.length === 0) {
    return false;
  }

  if (userRows[0].is_superuser) {
    return true;
  }

  // Check if user has any of the capabilities
  const placeholders = capabilityNames.map(() => '?').join(',');
  const [capRows] = await pool.query(
    `SELECT 1
     FROM capabilities c
     INNER JOIN role_capabilities rc ON c.id = rc.capability_id
     INNER JOIN user_roles ur ON rc.role_id = ur.role_id
     WHERE ur.user_id = ? AND c.name IN (${placeholders})
     LIMIT 1`,
    [userId, ...capabilityNames]
  );

  return capRows.length > 0;
}

/**
 * Check if user has all specified capabilities
 * Useful for AND conditions (user needs all)
 * @param {number} userId - User ID
 * @param {Array<string>} capabilityNames - Array of capability names
 * @returns {Promise<boolean>} True if user has all capabilities
 */
async function checkUserHasAllCapabilities(userId, capabilityNames) {
  const pool = getPool();

  // Check if user is a superuser
  const [userRows] = await pool.query(
    'SELECT is_superuser FROM users WHERE id = ? AND is_active = 1',
    [userId]
  );

  if (userRows.length === 0) {
    return false;
  }

  if (userRows[0].is_superuser) {
    return true;
  }

  // Check each capability individually
  for (const capName of capabilityNames) {
    const hasCapability = await checkUserCapability(userId, capName);
    if (!hasCapability) {
      return false;
    }
  }

  return true;
}

module.exports = {
  checkUserCapability,
  getUserRoles,
  getUserCapabilities,
  assignRole,
  removeRole,
  grantCapability,
  revokeCapability,
  getUsersByRole,
  checkUserHasAnyCapability,
  checkUserHasAllCapabilities
};
