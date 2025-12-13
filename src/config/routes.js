/**
 * Route Registry
 * Central definition of all UI routes with capability requirements
 *
 * This registry serves as the single source of truth for:
 * - Available routes in the application
 * - Required capabilities to access each route
 * - Sidebar navigation structure
 * - Route metadata (labels, icons, etc.)
 */

/**
 * Route definition structure:
 * {
 *   path: string - URL path for the route
 *   label: string - Display label in navigation
 *   icon: string - Bootstrap icon class (e.g., 'bi-house-door')
 *   capability: string|null - Required capability (null = all authenticated users)
 *   section: string|null - Section grouping for navigation (null = no section)
 *   order: number - Display order within section (lower = higher in list)
 * }
 */

const routes = [
  // Main navigation (no section)
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: 'bi-house-door',
    capability: null, // Available to all authenticated users
    section: null,
    order: 0
  },
  {
    path: '/logs',
    label: 'Logs',
    icon: 'bi-file-text',
    capability: 'logs:read',
    section: null,
    order: 10
  },
  {
    path: '/websites',
    label: 'Websites',
    icon: 'bi-globe',
    capability: 'websites:read',
    section: null,
    order: 20
  },
  {
    path: '/hosts',
    label: 'Hosts',
    icon: 'bi-hdd-network',
    capability: 'hosts:read',
    section: null,
    order: 30
  },

  // Security section
  {
    path: '/security/rules',
    label: 'Security Rules',
    icon: 'bi-shield-check',
    capability: 'security-rules:read',
    section: 'Security',
    order: 10
  },
  {
    path: '/security/events',
    label: 'Security Events',
    icon: 'bi-exclamation-triangle',
    capability: 'security-events:read',
    section: 'Security',
    order: 20
  },

  // Administration section
  {
    path: '/users',
    label: 'Users',
    icon: 'bi-people',
    capability: 'users:read',
    section: 'Administration',
    order: 10
  },
  {
    path: '/roles',
    label: 'Roles',
    icon: 'bi-shield-lock',
    capability: 'roles:read',
    section: 'Administration',
    order: 20
  },
  {
    path: '/audit',
    label: 'Audit Log',
    icon: 'bi-clock-history',
    capability: 'audit-log:read',
    section: 'Administration',
    order: 30
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: 'bi-gear',
    capability: 'settings:read',
    section: 'Administration',
    order: 40
  }
];

/**
 * Get all routes
 * @returns {Array} All route definitions
 */
function getAllRoutes() {
  return routes;
}

/**
 * Get route by path
 * @param {string} path - Route path to find
 * @returns {Object|null} Route definition or null if not found
 */
function getRouteByPath(path) {
  return routes.find(route => route.path === path) || null;
}

/**
 * Get all unique sections
 * @returns {Array} Array of section names (excluding null)
 */
function getSections() {
  const sections = [...new Set(routes.map(r => r.section).filter(s => s !== null))];
  return sections;
}

/**
 * Get routes grouped by section
 * @returns {Object} Routes grouped by section key
 */
function getRoutesBySection() {
  const grouped = {};

  routes.forEach(route => {
    const key = route.section || 'main';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(route);
  });

  // Sort routes within each section by order
  Object.keys(grouped).forEach(key => {
    grouped[key].sort((a, b) => a.order - b.order);
  });

  return grouped;
}

module.exports = {
  routes,
  getAllRoutes,
  getRouteByPath,
  getSections,
  getRoutesBySection
};
