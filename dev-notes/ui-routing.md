# UI Routing & Navigation System

## Overview

The Headlog UI uses a centralized route registry system that manages all navigation routes, capability-based access control, and sidebar menu generation. This document explains the architecture and how to work with it.

## Architecture

### Components

1. **Route Registry** (`src/config/routes.js`)
   - Single source of truth for all UI routes
   - Maps routes to required capabilities
   - Defines navigation structure (sections, ordering)
   - Provides helper functions for route lookups

2. **UI Helpers** (`src/utils/uiHelpers.js`)
   - Capability checking functions
   - Route filtering by user permissions
   - Navigation menu generation
   - Active route detection

3. **Sidebar Template** (`src/views/partials/sidebar.ejs`)
   - Dynamically renders navigation from route registry
   - Automatically filters routes by user capabilities
   - Highlights active routes and sections

## Route Definition Structure

Each route in the registry has the following properties:

```javascript
{
  path: '/users',              // URL path
  label: 'Users',              // Display label in navigation
  icon: 'bi-people',           // Bootstrap icon class
  capability: 'users:read',    // Required capability (null = no requirement)
  section: 'Administration',   // Section grouping (null = main nav)
  order: 10                    // Display order within section
}
```

### Properties Explained

- **path**: The URL path for the route. Must start with `/`.
- **label**: Human-readable text shown in the sidebar.
- **icon**: Bootstrap Icons class (e.g., `bi-house-door`, `bi-people`).
- **capability**: The capability required to access this route. Use `null` for routes available to all authenticated users (like Dashboard).
- **section**: Group routes into sections with headers. Use `null` for main navigation (top-level routes). Common sections: `'Security'`, `'Administration'`.
- **order**: Number determining display order within a section. Lower numbers appear first.

## Adding a New Route

### Step 1: Add Route Definition

Edit `src/config/routes.js` and add your route to the `routes` array:

```javascript
{
  path: '/reports',
  label: 'Reports',
  icon: 'bi-bar-chart',
  capability: 'reports:read',
  section: null,  // or 'Administration', 'Security', etc.
  order: 40
}
```

### Step 2: Create the Route Handler

Add the route handler in your UI routes file (e.g., `src/routes/ui.js` or a dedicated routes file):

```javascript
fastify.get(
  '/reports',
  {
    preHandler: async (request, reply) => {
      // Session check
      if (!request.session || !request.session.user_id) {
        return reply.redirect('/login');
      }

      // Load user and capabilities
      const authService = require('../services/authService');
      const user = await authService.validateSession(request.session.user_id);
      if (!user) {
        request.session.destroy();
        return reply.redirect('/login');
      }

      const capabilities = await authorizationService.getUserCapabilities(user.id);
      user.capabilities = capabilities.map(cap => cap.name);
      request.user = user;

      // Check capability (optional - sidebar already filters)
      if (!user.is_superuser && !user.capabilities.includes('reports:read')) {
        return reply.code(403).send('Access denied');
      }
    }
  },
  async (request, reply) => {
    const navigationMenu = getNavigationMenu(request.user);

    return reply.renderView('reports', {
      user: request.user,
      navigationMenu,
      currentPath: '/reports',
      config: {
        appName: 'Headlog',
        version: require('../../package.json').version,
        env: config.env
      }
    });
  }
);
```

### Step 3: Create the View Template

Create the EJS template (e.g., `src/views/reports.ejs`):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <%- include('partials/head') %>
  <title>Reports - <%= config.appName %></title>
</head>
<body>
  <%- include('partials/navbar', { user, config }) %>

  <div class="container-fluid">
    <div class="row">
      <%- include('partials/sidebar', { user, navigationMenu, currentPath }) %>

      <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
        <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
          <h1 class="h2">Reports</h1>
        </div>

        <!-- Your page content here -->

      </main>
    </div>
  </div>
</body>
</html>
```

### Step 4: Test

1. Ensure the capability exists in the database (`capabilities` table)
2. Assign the capability to a role
3. Assign the role to a user
4. Log in with that user and verify:
   - The route appears in the sidebar
   - Clicking it loads the page
   - Users without the capability don't see it

## Capability-Based Access Control

### How It Works

1. **Route Registry**: Each route specifies a required capability
2. **User Login**: When users log in, their capabilities are loaded
3. **Navigation Menu**: `getNavigationMenu(user)` filters routes by user capabilities
4. **Sidebar Rendering**: Only accessible routes are displayed
5. **Route Handlers**: Can optionally verify capability again (defense in depth)

### Capability Naming Convention

Capabilities follow the pattern: `resource:action`

Examples:
- `users:read` - View users
- `users:write` - Create/edit users
- `users:delete` - Delete users
- `logs:read` - View logs
- `settings:read` - View settings
- `settings:write` - Modify settings

### Superuser Bypass

Users with `is_superuser = 1` automatically have access to all routes, regardless of capabilities.

## Navigation Menu Structure

The `getNavigationMenu(user)` function returns an object organized by sections:

```javascript
{
  main: [
    { path: '/dashboard', label: 'Dashboard', icon: 'bi-house-door', ... },
    { path: '/logs', label: 'Logs', icon: 'bi-file-text', ... },
    // ... other main navigation routes
  ],
  Security: [
    { path: '/security/rules', label: 'Security Rules', ... },
    { path: '/security/events', label: 'Security Events', ... }
  ],
  Administration: [
    { path: '/users', label: 'Users', ... },
    { path: '/roles', label: 'Roles', ... },
    // ... other admin routes
  ]
}
```

- **main**: Routes with `section: null` (top-level navigation)
- **Security**: Routes with `section: 'Security'`
- **Administration**: Routes with `section: 'Administration'`

Sections are automatically created when routes are assigned to them. Empty sections (no accessible routes) are omitted.

## Active Route Highlighting

The sidebar automatically highlights the active route using the `currentPath` variable:

```javascript
currentPath === route.path || currentPath.startsWith(route.path + '/')
```

This handles:
- Exact matches: `/users` matches `/users`
- Sub-routes: `/users/123` highlights the `/users` menu item

## UI Helper Functions

### `hasCapability(user, capability)`

Check if a user has a specific capability:

```javascript
const { hasCapability } = require('../utils/uiHelpers');

if (hasCapability(user, 'users:write')) {
  // User can edit users
}
```

### `getUserRoutes(user)`

Get all routes accessible to a user:

```javascript
const { getUserRoutes } = require('../utils/uiHelpers');

const accessibleRoutes = getUserRoutes(user);
// Returns array of route objects user can access
```

### `getNavigationMenu(user)`

Get organized navigation menu structure:

```javascript
const { getNavigationMenu } = require('../utils/uiHelpers');

const menu = getNavigationMenu(user);
// Returns { main: [...], Security: [...], Administration: [...] }
```

### `checkRouteAccess(user, route)`

Check if user can access a specific route:

```javascript
const { checkRouteAccess, getRouteByPath } = require('../utils/uiHelpers');
const { getRouteByPath } = require('../config/routes');

const route = getRouteByPath('/users');
if (checkRouteAccess(user, route)) {
  // User can access the route
}
```

## Best Practices

### 1. Always Pass navigationMenu to Views

Every authenticated page should receive the `navigationMenu` for sidebar rendering:

```javascript
const navigationMenu = getNavigationMenu(request.user);

return reply.renderView('mypage', {
  user: request.user,
  navigationMenu,
  currentPath: '/mypage',
  // ... other data
});
```

### 2. Use Consistent Capability Names

Follow the `resource:action` convention:
- ✅ `users:read`, `logs:write`, `settings:delete`
- ❌ `read_users`, `can-view-logs`, `deleteSettings`

### 3. Group Related Routes

Use sections to organize related functionality:
- Main navigation: Core features (Dashboard, Logs, Websites, Hosts)
- Security: Security-related features
- Administration: System administration features

### 4. Order Routes Logically

Use the `order` property to arrange routes in a logical flow:
- Most frequently used routes first
- Related functionality grouped together
- Less common features later

### 5. Check Capabilities in Route Handlers

Even though the sidebar filters routes, add capability checks in handlers for defense in depth:

```javascript
if (!user.is_superuser && !user.capabilities.includes('reports:read')) {
  return reply.code(403).send('Access denied');
}
```

### 6. Test with Different User Roles

Always test new routes with:
- Superuser (should see everything)
- User with the required capability
- User without the capability (shouldn't see route)

## Troubleshooting

### Route Not Appearing in Sidebar

1. Check the capability exists in database: `SELECT * FROM capabilities WHERE name = 'your:capability';`
2. Check role has the capability: `SELECT * FROM role_capabilities WHERE capability_id = ?;`
3. Check user has the role: `SELECT * FROM user_roles WHERE user_id = ?;`
4. Check route definition in `src/config/routes.js`
5. Verify `navigationMenu` is passed to view
6. Check for console errors in browser

### Wrong Route Highlighted

- Ensure `currentPath` is set correctly in the view data
- Check if route paths overlap (e.g., `/user` and `/users`)
- Verify the active route logic in sidebar template

### Capability Check Failing

- Confirm user object has `capabilities` array
- Check `is_superuser` flag is properly set
- Verify capability name matches exactly (case-sensitive)

## Examples

### Example 1: Adding a Simple Route

```javascript
// 1. Add to routes.js
{
  path: '/activity',
  label: 'Activity',
  icon: 'bi-activity',
  capability: null,  // Available to all users
  section: null,
  order: 35
}

// 2. Add handler in ui.js
fastify.get('/activity', { preHandler: sessionAuth }, async (request, reply) => {
  const navigationMenu = getNavigationMenu(request.user);
  return reply.renderView('activity', {
    user: request.user,
    navigationMenu,
    currentPath: '/activity',
    config: { ... }
  });
});
```

### Example 2: Adding an Admin Section Route

```javascript
// 1. Add to routes.js
{
  path: '/admin/api-keys',
  label: 'API Keys',
  icon: 'bi-key',
  capability: 'api-keys:read',
  section: 'Administration',
  order: 50
}

// 2. Create capability in database
INSERT INTO capabilities (name, description) 
VALUES ('api-keys:read', 'View API keys');

// 3. Assign to admin role
INSERT INTO role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r, capabilities c
WHERE r.name = 'Administrator' AND c.name = 'api-keys:read';
```

## Migration from Old System

The previous sidebar used inline capability checks with EJS conditionals. The new system:

✅ **Advantages:**
- Single source of truth for routes
- Easier to add new routes (just one location)
- Consistent capability checking
- Better code organization
- Testable route configuration

❌ **Old System (Don't use):**
```ejs
<% if (user.is_superuser || user.capabilities.includes('users:read')) { %>
  <li><a href="/users">Users</a></li>
<% } %>
```

✅ **New System (Use this):**
```javascript
// Define once in routes.js
{ path: '/users', capability: 'users:read', ... }

// Sidebar automatically filters and renders
```

## Summary

The route registry system provides:
- **Centralized route management** - One place to define all routes
- **Automatic capability filtering** - Users only see what they can access
- **Consistent navigation** - Same structure across all pages
- **Easy extensibility** - Add routes with minimal code
- **Better maintainability** - Clear separation of concerns

When adding new features, always start by defining the route in the registry, then build the handler and view.
