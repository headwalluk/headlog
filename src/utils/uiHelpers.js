/**
 * UI Helper Utilities
 * Functions for route filtering, capability checks, and navigation rendering
 */

const { getAllRoutes, getRoutesBySection } = require('../config/routes');

/**
 * Check if user has access to a specific capability
 * @param {Object} user - User object with capabilities array and is_superuser flag
 * @param {string|null} capability - Required capability (null = no requirement)
 * @returns {boolean} True if user has access
 */
function hasCapability(user, capability) {
  // No capability required - all authenticated users have access
  if (capability === null) {
    return true;
  }

  // Superusers have all capabilities
  if (user.is_superuser) {
    return true;
  }

  // Check if user has the specific capability
  return user.capabilities && user.capabilities.includes(capability);
}

/**
 * Get routes accessible to a specific user
 * @param {Object} user - User object with capabilities
 * @returns {Array} Array of route definitions user can access
 */
function getUserRoutes(user) {
  if (!user) {
    return [];
  }

  return getAllRoutes().filter(route => hasCapability(user, route.capability));
}

/**
 * Check if user has access to a specific route
 * @param {Object} user - User object with capabilities
 * @param {Object} route - Route definition object
 * @returns {boolean} True if user can access the route
 */
function checkRouteAccess(user, route) {
  if (!user || !route) {
    return false;
  }

  return hasCapability(user, route.capability);
}

/**
 * Get navigation menu structure for a user
 * Groups routes by section and filters by user capabilities
 *
 * @param {Object} user - User object with capabilities
 * @returns {Object} Navigation structure organized by sections
 *
 * Example return structure:
 * {
 *   main: [{path, label, icon, ...}, ...],
 *   Security: [{path, label, icon, ...}, ...],
 *   Administration: [{path, label, icon, ...}, ...]
 * }
 */
function getNavigationMenu(user) {
  if (!user) {
    return {};
  }

  const allRoutes = getRoutesBySection();
  const userMenu = {};

  // Filter each section's routes by user capabilities
  Object.keys(allRoutes).forEach(section => {
    const accessibleRoutes = allRoutes[section].filter(route =>
      hasCapability(user, route.capability)
    );

    // Only include section if user has access to at least one route
    if (accessibleRoutes.length > 0) {
      userMenu[section] = accessibleRoutes;
    }
  });

  return userMenu;
}

/**
 * Check if a route path matches the current path
 * Handles exact matches and parent path highlighting
 *
 * @param {string} routePath - Route path from registry
 * @param {string} currentPath - Current URL path
 * @returns {boolean} True if route is active
 */
function isActiveRoute(routePath, currentPath) {
  if (!routePath || !currentPath) {
    return false;
  }

  // Exact match
  if (routePath === currentPath) {
    return true;
  }

  // Check if current path starts with route path (for sub-routes)
  // e.g., /users/123 should highlight /users
  if (currentPath.startsWith(routePath + '/')) {
    return true;
  }

  return false;
}

/**
 * Format route for EJS template rendering
 * Adds computed properties for easier template usage
 *
 * @param {Object} route - Route definition
 * @param {string} currentPath - Current URL path
 * @returns {Object} Route with additional rendering properties
 */
function formatRouteForMenu(route, currentPath) {
  return {
    ...route,
    isActive: isActiveRoute(route.path, currentPath),
    activeClass: isActiveRoute(route.path, currentPath) ? 'active' : ''
  };
}

module.exports = {
  hasCapability,
  getUserRoutes,
  checkRouteAccess,
  getNavigationMenu,
  isActiveRoute,
  formatRouteForMenu
};
