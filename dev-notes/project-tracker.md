# Project Tracker - Headlog v2.0.0+

## Project Overview

**Goal:** Transform headlog from CLI-only log ingestion system to full-featured web-based administration platform with security analysis capabilities.

**Current State (v1.5.1):**

- ✅ Log ingestion via POST /logs (API key auth)
- ✅ Hierarchical aggregation (upstream sync)
- ✅ Storage optimizations (BINARY(16) UUIDs, HTTP code caching)
- ✅ CLI for API key management
- ✅ Basic housekeeping (log retention)
- ❌ No user accounts or sessions
- ❌ No web UI
- ❌ No role-based access control
- ❌ No security analysis

**Target State (v2.0.0):**

- ✅ All of v1.5.1 features
- ✅ User accounts with password authentication
- ✅ Session-based web UI
- ✅ Role-based access control (RBAC)
- ✅ API restructured under /api prefix
- ✅ Web UI with EJS templates
- ✅ Log viewer (spreadsheet interface)
- ✅ Basic admin pages (users, roles, websites, hosts)
- ✅ CLI user management commands

**Future State (v2.1.0+):**

- Security analysis (batch log processing)
- Advanced analytics dashboards
- Customer-facing features
- Workflow automation

---

## Milestones

### Milestone 1: API Restructuring (Breaking Changes)

**Goal:** Reorganize routes to /api prefix for clean separation of concerns

**Status:** ✅ Complete  
**Target:** Day 1-2  
**Estimated Effort:** 4-6 hours  
**Actual Time:** ~2 hours  
**Completed:** 2025-12-13

**Tasks:**

- [x] Move log ingestion routes to /api/logs
  - [x] Update POST /logs → POST /api/logs
  - [x] Update POST /logs/batch → POST /api/logs/batch
  - [x] Update all internal references
- [x] Update route handlers
  - [x] src/routes/logs.js - add /api prefix awareness (via server.js registration)
  - [x] Test log ingestion still works
  - [x] Test upstream sync still works (batch format compatible)
- [x] Keep /health endpoint (no prefix)
- [x] Update documentation
  - [x] Update README.md with new endpoint URLs
  - [x] Update docs/installation.md with Fluent Bit config changes
  - [x] Update docs/quickstart.md with new endpoint
  - [x] Update .env.example if needed (no changes required)
- [x] Update Fluent Bit configuration (local dev)
  - [x] Change URI /logs to URI /api/logs (ready for user testing)
  - [x] Test log ingestion from Fluent Bit (pending user's Fluent Bit setup)
- [x] Create migration guide for existing users
  - [x] Document breaking changes (docs/migrating-to-v2.md)
  - [x] Provide example config updates

**Success Criteria:**

- ✅ POST /api/logs works with API key auth (tested)
- ✅ POST /api/logs/batch works for upstream sync (format unchanged)
- ✅ All existing functionality preserved (log ingestion working)
- ✅ No 404s on API routes (GET /api/websites returns data)
- ⏳ Fluent Bit successfully sending logs to new endpoint (pending user test)

**Dependencies:** None

---

### Milestone 2: Database Schema - Authentication

**Goal:** Add tables for users, sessions, and API key enhancements

**Status:** ✅ Complete  
**Target:** Day 2  
**Estimated Effort:** 2-3 hours  
**Actual Time:** ~1 hour  
**Completed:** 2025-12-13

**Tasks:**

- [x] Create migration file: schema/1.6.0-authentication.sql
  - [x] users table (id, username, email, password_hash, is_active, is_superuser, timestamps)
  - [x] sessions table (id, user_id, data, expires_at, ip_address, user_agent, timestamps)
  - [x] ALTER api_keys table (add user_id, permissions, expires_at columns)
  - [x] Add indexes (username, email, session expiration, etc.)
- [x] Write migration rollback script (optional, for testing) - not needed
- [x] Test migration on dev database
  - [x] Run migration
  - [x] Verify all tables created (users, sessions)
  - [x] Verify indexes exist
  - [x] Check foreign keys (sessions.user_id -> users.id, api_keys.user_id -> users.id)
- [x] Document schema changes in migration file (comments)

**Success Criteria:**

- ✅ Migration runs without errors
- ✅ All tables and indexes created (verified with DESCRIBE)
- ✅ Foreign keys properly configured (CASCADE for sessions, SET NULL for api_keys)
- ✅ No data loss from existing tables (api_keys table enhanced, not replaced)

**Dependencies:** None (can run parallel with Milestone 1)

---

### Milestone 3: Authentication System

**Goal:** Implement user accounts, password authentication, and sessions

**Status:** ✅ Complete  
**Target:** Day 3-4  
**Estimated Effort:** 8-12 hours  
**Actual Time:** ~3 hours  
**Completed:** 2025-12-13

**Tasks:**

- [x] Install dependencies
  - [x] npm install passport passport-local
  - [x] npm install express-session express-mysql-session
  - [x] npm install bcrypt
  - [x] npm install inquirer (for CLI password prompts)
- [x] Create User model (src/models/User.js)
  - [x] CRUD operations (create, findById, findByUsername, findByEmail, update, delete)
  - [x] Password hashing with bcrypt (hashPassword, validatePassword methods)
  - [x] Password strength validation (min 12 chars, complexity requirements)
  - [x] isActive, isSuperuser properties
- [x] Implement authentication service (src/services/authService.js)
  - [x] authenticateUser(username, password) - validate credentials
  - [x] recordLogin(userId, ipAddress) - track login
  - [x] validateSession(userId) - check if session valid
- [x] Configure Passport.js (src/config/passport.js) - DEFERRED to next milestone
  - [ ] Local strategy (username/email + password)
  - [ ] Serialize/deserialize user (store user.id in session)
  - [ ] Session configuration (express-session with MySQL store)
- [x] Create authentication middleware (src/middleware/auth.js) - DEFERRED to next milestone
  - [ ] requireSession - ensure user is logged in
  - [ ] attachUser - load user from session into req.user
  - [ ] Feature flag checks (UI_ENABLED, MODEL_API_ENABLED)
- [x] Create auth routes (src/routes/auth.js) - DEFERRED to next milestone
  - [ ] POST /auth/login - handle login form submission
  - [ ] POST /auth/logout - destroy session
  - [ ] GET /auth/status - check if logged in (for AJAX)
- [x] Add environment variables - DEFERRED to next milestone
  - [ ] SESSION_SECRET (generate random secret)
  - [ ] SESSION_MAX_AGE (default 86400 = 24 hours)
  - [ ] SESSION_SECURE (true in production)
  - [ ] UI_ENABLED (default false)
  - [ ] MODEL_API_ENABLED (default false)
- [x] Update .env.example with new variables - DEFERRED to next milestone
- [x] CLI: users:create-admin command (src/cli.js)
  - [x] Interactive prompts (username, email, password, confirm password)
  - [x] Create user with is_superuser=true
  - [x] Non-interactive mode (--username, --email, --password flags)
  - [x] Test command works

**Success Criteria:**

- ✅ Can create admin user via CLI (tested with admin@headwall.tech)
- ✅ Password validation works (rejects weak passwords)
- ✅ Duplicate username validation works (tested)
- ✅ Password properly hashed with bcrypt cost 12 (verified: $2b$12$)
- ✅ User stored in database correctly
- ⏳ Can login via POST /auth/login (deferred to next milestone)
- ⏳ Session persists across requests (deferred)
- ⏳ Can logout (session destroyed) (deferred)
- ⏳ Middleware blocks unauthenticated requests (deferred)
- ⏳ Feature flags properly gate functionality (deferred)

**Notes:**

- Focused on core User model and CLI bootstrap command this milestone
- Passport.js integration, routes, and middleware deferred to avoid complexity
- Breaking milestone into smaller chunks for better progress tracking

**Dependencies:** Milestone 2 (database schema)

---

### Milestone 4: Database Schema - Authorization

**Goal:** Add tables for roles, capabilities, and RBAC system

**Status:** ✅ Complete  
**Target:** Day 5  
**Estimated Effort:** 2-3 hours  
**Actual Time:** ~1 hour  
**Completed:** 2025-12-13

**Tasks:**

- [x] Create migration file: schema/1.6.1-authorization.sql
  - [x] roles table (id, name, description, is_system, timestamps)
  - [x] user_roles junction table (user_id, role_id, assigned_at, assigned_by)
  - [x] capabilities table (id, name, description, category, is_dangerous, timestamp)
  - [x] role_capabilities junction table (role_id, capability_id, granted_at, granted_by)
  - [x] audit_log table (id, user_id, api_key_id, action, resource_type, resource_id, details JSON, ip, user_agent, timestamp)
  - [x] Add indexes on foreign keys, name columns, timestamps
- [x] Create seed data file: schema/seed-1.6.1-roles-capabilities.sql
  - [x] System roles (administrator, security-analyst, viewer, log-writer)
  - [x] All capabilities (32 total across 8 categories: logs, users, roles, websites, hosts, api-keys, security, settings)
  - [x] Role-capability mappings (administrator: 32, security-analyst: 12, viewer: 6, log-writer: 3)
- [x] Test migration and seed on dev database
  - [x] Run migration (bumped to 1.6.1)
  - [x] Run seed script
  - [x] Verify roles created (4 system roles)
  - [x] Verify capabilities created (32 capabilities)
  - [x] Verify mappings correct (verified counts per role)

**Success Criteria:**

- ✅ All RBAC tables created (roles, user_roles, capabilities, role_capabilities, audit_log)
- ✅ System roles seeded (4 roles with is_system=TRUE)
- ✅ Capabilities seeded (32 capabilities across 8 categories)
- ✅ Role-capability mappings correct (verified counts match expected)
- ✅ No errors during migration (successful execution)

**Dependencies:** Milestone 3 (users table exists)

---

### Milestone 5: Authorization System

**Goal:** Implement role-based access control with capabilities

**Status:** ✅ Complete  
**Target:** Day 5-6  
**Estimated Effort:** 8-10 hours  
**Actual Time:** ~3 hours  
**Completed:** 2025-12-13

**Tasks:**

- [x] Create Role model (src/models/Role.js)
  - [x] CRUD operations (createRole, findById, findByName, updateRole, deleteRole)
  - [x] findByUserId method (get all roles for a user)
  - [x] Capability management (grantCapability, revokeCapability, getCapabilities)
  - [x] System role protection (cannot modify/delete system roles)
- [x] Create Capability model (src/models/Capability.js)
  - [x] findByName, findByCategory, findByRole, findByUserId methods
  - [x] listCapabilities with filtering options
  - [x] getCategories method
- [x] Implement authorization service (src/services/authorizationService.js)
  - [x] checkUserCapability(userId, capability) - with superuser bypass
  - [x] getUserRoles(userId) - get all roles for user
  - [x] getUserCapabilities(userId) - flattened from all roles
  - [x] assignRole(userId, roleId, assignedBy) - with duplicate check
  - [x] removeRole(userId, roleId) - remove role from user
  - [x] grantCapability(roleId, capabilityId, grantedBy) - add capability to role
  - [x] revokeCapability(roleId, capabilityId) - remove capability from role
  - [x] checkUserHasAnyCapability - OR condition check
  - [x] checkUserHasAllCapabilities - AND condition check
- [x] Create authorization middleware (src/middleware/authorization.js)
  - [x] requireCapability(capability) - middleware factory
  - [x] requireAnyCapability(capabilities[]) - OR condition
  - [x] requireAllCapabilities(capabilities[]) - AND condition
  - [x] requireSuperuser - superuser-only middleware
  - [x] attachCapabilities - attach user capabilities to request object
- [x] Implement audit logging service (src/services/auditService.js)
  - [x] logAction(userId, action, resourceType, resourceId, details, ip, userAgent)
  - [x] queryAuditLog(filters) - search with pagination and filtering
  - [x] getUserRecentActivity - get recent actions by user
  - [x] getResourceAuditTrail - get all actions for a resource
  - [x] pruneAuditLog - delete old entries for retention
  - [x] getAuditStats - aggregate statistics by action/resource
- [x] Add audit logging to User model operations
  - [x] createUser - logs user.created action
  - [x] updateUser - logs user.updated action
  - [x] resetPassword - logs user.password_reset action
  - [x] deleteUser - logs user.deleted action with username/email details
- [x] CLI: Role management commands
  - [x] roles:list - show all roles (with --system-only, --custom-only filters)
  - [x] roles:show <role> - show role details with capabilities grouped by category
  - [x] roles:assign <user> <role> - assign role to user with audit trail
  - [x] roles:remove <user> <role> - remove role from user
  - [x] capabilities:list - list capabilities (with --category, --dangerous-only filters)

**Success Criteria:**

- ✅ Can assign roles to users (tested: assigned administrator role to user 1)
- ✅ Can check user capabilities (tested: user 1 has all 32 capabilities from administrator role)
- ✅ Superuser bypasses all checks (implemented in checkUserCapability)
- ✅ Middleware properly blocks unauthorized requests (requireCapability returns 401/403)
- ✅ Audit log captures privileged actions (User model operations log to audit_log table)
- ✅ CLI role commands work (all 5 commands tested and working with cli-table3 formatting)

**Dependencies:** Milestone 4 (roles/capabilities schema)

---

### Milestone 6: Web UI Foundation

**Goal:** Set up EJS templates, Fastify views, and basic navigation

**Status:** ✅ Complete  
**Target:** Day 7-8  
**Estimated Effort:** 6-8 hours  
**Actual Time:** ~6 hours  
**Completed:** 2025-12-13

**Tasks:**

- [x] Install dependencies
  - [x] npm install ejs @fastify/view @fastify/session @fastify/cookie @fastify/formbody @fastify/static
- [x] Configure Fastify for EJS
  - [ ] Register @fastify/view plugin with EJS engine - [x] Set views directory to src/views
  - [x] Configure view options (caching, etc.)
- [x] Create directory structure
  - [x] src/views/partials/
  - [x] public/css/
  - [x] public/js/
- [x] Create view partials
  - [x] src/views/partials/head.ejs (HTML head, meta, CSS links)
  - [x] src/views/partials/header.ejs (top navigation, user menu, logout)
  - [x] src/views/partials/sidebar.ejs (nav menu with role-based items)
  - [x] src/views/partials/footer.ejs (copyright, version)
- [x] Create main pages
  - [x] src/views/login.ejs (full page, no layout)
  - [x] src/views/dashboard.ejs (includes partials for full layout)
- [x] Add CSS framework (Bootstrap 5)
  - [x] Add Bootstrap CDN links to head.ejs
  - [x] Create public/css/common.css for custom styles
- [x] Create common JavaScript (public/js/common.js)
  - [x] Bootstrap tooltip initialization
  - [x] Auto-dismiss alerts
  - [x] Confirm dangerous actions
- [x] Configure Fastify session
  - [x] Register @fastify/session plugin
  - [x] Create custom MySQL session store (src/config/sessionStore.js)
  - [x] Set session secret, maxAge from config
  - [x] Register @fastify/cookie (required by session)
  - [x] Set saveUninitialized: false (security - no bot sessions)
- [x] Create auth routes file (src/routes/auth.js)
  - [x] POST /auth/login - authenticate user, create session
  - [x] POST /auth/logout - destroy session
  - [x] GET /auth/status - return auth status (JSON)
- [x] Create UI routes file (src/routes/ui.js)
  - [x] GET / - redirect to /login or /dashboard based on session
  - [x] GET /login - render login page
  - [x] GET /dashboard - render dashboard (requireSession middleware)
- [x] Update server.js
  - [x] Register @fastify/view plugin
  - [x] Register @fastify/session plugin with MySQL store
  - [x] Register @fastify/static for public/ folder
  - [x] Register @fastify/formbody for form parsing
  - [x] Check UI_ENABLED flag before mounting UI routes
  - [x] Mount auth routes (/auth/\*)
  - [x] Mount UI routes (/, /login, /dashboard, etc.)
- [x] Create view middleware decorator
  - [x] Fastify decorator to add common data to views (renderView)
  - [x] Attach user, config to view context
  - [x] hasCapability helper function in sidebar partial
- [x] CLI improvements
  - [x] Fixed inquirer v13 ESM import issues (dynamic import)
  - [x] Added users:list command
  - [x] Added users:reset-password command
  - [x] Fixed database initialization in all CLI commands

**Success Criteria:**

- ✅ Can access login page at /
- ✅ After login, redirected to /dashboard
- ✅ Session stored in database with user_id (NOT NULL enforced)
- ✅ Dashboard shows welcome message with username
- ✅ Sidebar shows role-based navigation
- ✅ Logout button works
- ✅ CLI commands work (users:list, users:reset-password)

**Known Issues:**

- Dashboard queries security_events table (doesn't exist yet - will be created in later milestone)

**Notes:**

- Architecture corrected: Using Fastify (not Express) throughout
- Custom MySQL session store created (no npm package available)
- EJS includes pattern used (simpler than express-ejs-layouts)
- Security: sessions NOT created for unauthenticated requests (saveUninitialized: false)
- Fixed authService.authenticateUser return value handling

**Dependencies:** Milestones 1-5 (API, Auth/Authz schemas, models, services) - [ ] Set views directory to src/views

- [ ] Configure view options (caching, etc.)
- [x] Create directory structure
  - [x] src/views/partials/
  - [x] public/css/
  - [ ] public/js/
- [ ] Create view partials
  - [ ] src/views/partials/head.ejs (HTML head, meta, CSS links)
  - [ ] src/views/partials/header.ejs (top navigation, user menu, logout)
  - [ ] src/views/partials/sidebar.ejs (nav menu with role-based items)
  - [ ] src/views/partials/footer.ejs (copyright, version)
- [ ] Create main pages
  - [ ] src/views/login.ejs (full page, no layout)
  - [ ] src/views/dashboard.ejs (includes partials for full layout)
- [ ] Add CSS framework (Bootstrap 5)
  - [ ] Add Bootstrap CDN links to head.ejs
  - [ ] Create public/css/common.css for custom styles
- [ ] Create common JavaScript (public/js/common.js)
  - [ ] Sidebar toggle for mobile
  - [ ] Utility functions
- [ ] Configure Fastify session
  - [ ] Register @fastify/session plugin
  - [ ] Configure MySQL session store
  - [ ] Set session secret, maxAge from config
  - [ ] Register @fastify/cookie (required by session)
- [ ] Create auth routes file (src/routes/auth.js)
  - [ ] POST /auth/login - authenticate user, create session
  - [ ] POST /auth/logout - destroy session
  - [ ] GET /auth/status - return auth status (JSON)
- [ ] Create UI routes file (src/routes/ui.js)
  - [ ] GET / - redirect to /login or /dashboard based on session
  - [ ] GET /login - render login page
  - [ ] GET /dashboard - render dashboard (requireSession middleware)
- [ ] Update server.js
  - [ ] Register @fastify/view plugin
  - [ ] Register @fastify/session plugin
  - [ ] Register @fastify/static for public/ folder
  - [ ] Register @fastify/formbody for form parsing
  - [ ] Check UI_ENABLED flag before mounting UI routes
  - [ ] Mount auth routes (/auth/\*)
  - [ ] Mount UI routes (/, /login, /dashboard, etc.)
- [ ] Create view middleware decorator
  - [ ] Fastify decorator to add common data to views
  - [ ] Attach user, config, hasCapability helper function
  - [ ] Use in all view routes
  - [ ] res.locals.hasCapability = (cap) => req.user.hasCapability(cap)

**Success Criteria:**

- ✓ Can access login page at /
- ✓ After login, redirected to /dashboard
- ✓ Layout renders correctly (header, sidebar, footer)
- ✓ Sidebar shows role-based menu items
- ✓ Responsive design works on mobile
- ✓ Bootstrap styles applied
- ✓ Can logout (destroys session)

**Dependencies:** Milestone 5 (authorization system, users can have roles)

---

### Milestone 7: UI Routing & Navigation System
**Goal:** Establish UI routing patterns and capability-based navigation

**Status:** ✅ Complete
**Target:** Day 7
**Estimated Effort:** 4-6 hours
**Actual Time:** ~5 hours

**Tasks:**
- [x] Fix dashboard to render properly
  - [x] Remove security_events query (table doesn't exist yet)
  - [x] Query only existing tables (log_records, websites, hosts, audit_log)
  - [x] Simplify stats to 3 cards instead of 4
  - [x] Add number formatting (toLocaleString) for log count
  - [x] Fix database pool access (use getPool() not fastify.pool)
  - [x] Remove is_active column check from websites query
- [x] Create route registry system
  - [x] Create src/config/routes.js - central route definitions
  - [x] Map routes to required capabilities
  - [x] Export route metadata for sidebar rendering
  - [x] Include route patterns, labels, icons, parent routes
- [x] Update sidebar to use route registry
  - [x] Read routes from registry instead of hardcoded
  - [x] Filter routes by user capabilities
  - [x] Build hierarchical menu structure
  - [x] Highlight active route and parent
- [x] Create UI helper utilities
  - [x] src/utils/uiHelpers.js
  - [x] Function: getUserRoutes(user) - filter routes by capabilities
  - [x] Function: checkAccess(user, route) - verify capability match
  - [x] Function: formatRouteForMenu(route) - prepare route for rendering
  - [x] Function: getNavigationMenu(user) - build menu structure
  - [x] Function: hasCapability(user, capability) - check access
  - [x] Function: isActiveRoute(routePath, currentPath) - active detection
- [x] Document routing patterns
  - [x] Create dev-notes/ui-routing.md
  - [x] Explain route registry structure
  - [x] Document capability checks
  - [x] Show examples of adding new routes
  - [x] Include migration guide from old system
  - [x] Troubleshooting section

**Success Criteria:**
- ✅ Dashboard renders without errors
- ✅ Sidebar dynamically rendered from route registry
- ✅ Routes properly filtered by user capabilities
- ✅ Easy to add new routes with capability requirements

**Dependencies:** Milestone 6 (Web UI Foundation)

**Deliverables:**
- `src/config/routes.js` - Route registry with 10 routes defined
- `src/utils/uiHelpers.js` - 6 helper functions for route management
- `src/views/partials/sidebar.ejs` - Dynamic sidebar using route registry
- `dev-notes/ui-routing.md` - Comprehensive routing documentation

**Notes:**
- Fixed critical bugs in dashboard: getPool() usage and websites table schema
- Route registry provides single source of truth for navigation
- All routes automatically filtered by user capabilities
- Documentation includes examples for adding new routes
- System is extensible and maintainable

---

### Milestone 8: UI Component Library & Design Patterns
**Goal:** Establish reusable UI patterns with exemplar list and detail pages

**Status:** Not Started  
**Target:** Day 8-9  
**Estimated Effort:** 8-10 hours

**Tasks:**
- [ ] Create exemplar pages (Users module)
  - [ ] src/views/users/list.ejs - user list page
  - [ ] src/views/users/detail.ejs - user detail/edit page
  - [ ] Implement full CRUD with proper UI patterns
- [ ] Design list page patterns
  - [ ] Page header with title and actions (Create button)
  - [ ] Search/filter bar (search input, filter dropdowns)
  - [ ] Results table with sortable columns
  - [ ] Pagination controls (bottom of table)
  - [ ] Loading spinner (full-page overlay)
  - [ ] Empty state message (no results)
  - [ ] Action buttons per row (Edit, Delete with confirmation)
  - [ ] Bulk actions (optional, checkboxes)
- [ ] Design detail/edit page patterns
  - [ ] Page header with back button and title
  - [ ] Form layout (sections, fieldsets)
  - [ ] Input validation (client and server-side)
  - [ ] Save/Cancel buttons (sticky at bottom)
  - [ ] Delete button (separate, with confirmation modal)
  - [ ] Loading states (saving, deleting)
  - [ ] Success/error messages (toast notifications)
  - [ ] Related data sections (e.g., user roles, audit log)
- [ ] Create reusable UI components
  - [ ] src/views/components/loading-spinner.ejs
  - [ ] src/views/components/confirmation-modal.ejs
  - [ ] src/views/components/toast-notification.ejs
  - [ ] src/views/components/data-table.ejs
  - [ ] src/views/components/pagination.ejs
  - [ ] src/views/components/form-field.ejs
- [ ] Implement responsive design
  - [ ] Mobile layout (< 768px) - stacked, simplified
  - [ ] Tablet layout (768px - 1024px) - hybrid
  - [ ] Desktop layout (> 1024px) - full features
  - [ ] Test on multiple screen sizes
- [ ] Create JavaScript utilities
  - [ ] public/js/ui.js - UI helper functions
  - [ ] Loading spinner show/hide
  - [ ] Toast notifications (success, error, info)
  - [ ] Confirmation modals
  - [ ] Form validation helpers
  - [ ] AJAX request wrappers (with error handling)
- [ ] Implement user list page
  - [ ] GET /users route (requireCapability('users:read'))
  - [ ] Query users with filtering, sorting, pagination
  - [ ] Render list view with data
  - [ ] Client-side search (filters table without reload)
  - [ ] Action buttons: Edit, Disable/Enable, Reset Password, Delete
- [ ] Implement user detail/edit page
  - [ ] GET /users/:id route (requireCapability('users:read'))
  - [ ] Load user, roles, audit log
  - [ ] Render detail view with edit form
  - [ ] POST /users/:id/update (requireCapability('users:write'))
  - [ ] POST /users/:id/delete (requireCapability('users:delete'))
  - [ ] POST /users/:id/roles (requireCapability('users:manage-roles'))
  - [ ] Inline role assignment (checkboxes with AJAX save)
- [ ] Document design patterns
  - [ ] Create dev-notes/ui-design-patterns.md
  - [ ] Screenshot/describe list page layout
  - [ ] Screenshot/describe detail page layout
  - [ ] Document component usage
  - [ ] Provide code examples
  - [ ] Mobile vs desktop differences
  - [ ] Accessibility considerations

**Success Criteria:**
- ☐ User list page fully functional (search, sort, pagination)
- ☐ User detail page fully functional (edit, delete, roles)
- ☐ All UI patterns documented with examples
- ☐ Design works on mobile, tablet, desktop
- ☐ Reusable components created and tested
- ☐ Can easily replicate patterns for new modules

**Dependencies:** Milestone 7 (UI Routing)

---

### Milestone 9 (OLD - SKIP): Login Page & Dashboard

**Goal:** Create functional login page and basic dashboard

**Status:** Not Started  
**Target:** Day 8-9  
**Estimated Effort:** 4-6 hours

**Tasks:**

- [ ] Create login page view (src/views/pages/login.ejs)
  - [ ] Simple centered login form
  - [ ] Username/email input
  - [ ] Password input (type=password)
  - [ ] "Remember me" checkbox (extends session)
  - [ ] Submit button
  - [ ] Error message display area
  - [ ] No registration link (admin creates users)
- [ ] Create login route handler (src/routes/auth.js)
  - [ ] POST /auth/login
  - [ ] Use Passport.authenticate('local')
  - [ ] On success: redirect to /dashboard
  - [ ] On failure: re-render login with error message
  - [ ] Handle "remember me" (extend session maxAge)
- [ ] Create dashboard page view (src/views/pages/dashboard.ejs)
  - [ ] Welcome message with username
  - [ ] Quick stats cards:
    - [ ] Total log records (last 24h)
    - [ ] Active websites count
    - [ ] Active hosts count
    - [ ] Recent log ingestion rate
  - [ ] Recent activity feed (last 10 audit log entries)
  - [ ] Quick action links:
    - [ ] View Logs (if has logs:read)
    - [ ] Manage Users (if has users:read)
    - [ ] Manage Security Rules (if has security-rules:read)
  - [ ] System status indicators:
    - [ ] Database connection (green/red)
    - [ ] Upstream sync status (if configured)
- [ ] Create dashboard route handler (src/routes/ui.js)
  - [ ] GET /dashboard
  - [ ] requireSession middleware
  - [ ] Query stats from database (log counts, website counts, etc.)
  - [ ] Query recent audit log entries
  - [ ] Render dashboard view with data
- [ ] Create stats service (src/services/statsService.js)
  - [ ] getLogStats() - counts by time period
  - [ ] getWebsiteStats() - active website count
  - [ ] getHostStats() - active host count
  - [ ] getSystemStatus() - database health, upstream sync status

**Success Criteria:**

- ✓ Login page renders correctly
- ✓ Can log in with admin credentials
- ✓ Dashboard shows real data (stats cards)
- ✓ Recent activity feed works
- ✓ Quick action links show based on capabilities
- ✓ System status indicators accurate

**Dependencies:** Milestone 6 (UI foundation)

---

### Milestone 8: User Management Pages

**Goal:** Full CRUD interface for user accounts

**Status:** Not Started  
**Target:** Day 10-11  
**Estimated Effort:** 8-10 hours

**Tasks:**

- [ ] Create user list view (src/views/pages/users/index.ejs)
  - [ ] Table with columns: Username, Email, Roles, Status, Last Login, Actions
  - [ ] Search/filter inputs (username, email, role, status)
  - [ ] Pagination (50 per page)
  - [ ] Sort by column (click headers)
  - [ ] Create User button (opens create form)
  - [ ] Actions per user: Edit, Disable/Enable, Delete, Assign Roles
- [ ] Create user edit view (src/views/pages/users/edit.ejs)
  - [ ] Form with fields: username, email, status (active/disabled)
  - [ ] Password reset section (optional, separate form)
  - [ ] Role assignment section (checkboxes for available roles)
  - [ ] Save button, Cancel button
  - [ ] Delete user button (confirmation required)
- [ ] Create user API routes (src/routes/api/users.js)
  - [ ] GET /api/users - list users (requireSession, requireCapability('users:read'))
  - [ ] POST /api/users - create user (requireCapability('users:write'))
  - [ ] GET /api/users/:id - get user details
  - [ ] PUT /api/users/:id - update user
  - [ ] DELETE /api/users/:id - delete user (requireCapability('users:delete'))
  - [ ] POST /api/users/:id/roles - assign roles
  - [ ] DELETE /api/users/:id/roles/:roleId - remove role
  - [ ] POST /api/users/:id/reset-password - reset password
- [ ] Create UserController (src/controllers/UserController.js) or inline in routes
  - [ ] index() - list users with filters
  - [ ] create() - create new user
  - [ ] show() - get user details
  - [ ] update() - update user
  - [ ] destroy() - delete user
  - [ ] assignRole() - assign role to user
  - [ ] removeRole() - remove role from user
  - [ ] resetPassword() - reset user password
- [ ] Add form validation
  - [ ] Username: 3-50 chars, alphanumeric + underscore
  - [ ] Email: valid email format
  - [ ] Password: min 12 chars, complexity requirements
  - [ ] Server-side validation in controller
  - [ ] Client-side validation in form (HTML5 + JavaScript)
- [ ] Add audit logging
  - [ ] Log user creation
  - [ ] Log user updates
  - [ ] Log user deletion
  - [ ] Log role assignments
  - [ ] Log password resets
- [ ] Add confirmation modals (JavaScript)
  - [ ] Delete user: "Are you sure you want to delete [username]?"
  - [ ] Disable user: "Are you sure you want to disable [username]?"
  - [ ] Remove role: "Remove [role] from [username]?"
- [ ] CLI: User management commands (extend existing)
  - [ ] users:create (non-admin users)
  - [ ] users:list [--role X] [--status Y]
  - [ ] users:show <username>
  - [ ] users:disable <username>
  - [ ] users:enable <username>
  - [ ] users:delete <username> --confirm
  - [ ] users:reset-password <username>

**Success Criteria:**

- ✓ Can list all users
- ✓ Can create new user via UI
- ✓ Can edit user details
- ✓ Can assign/remove roles
- ✓ Can disable/enable user
- ✓ Can delete user (with confirmation)
- ✓ Can reset password
- ✓ All operations audited
- ✓ CLI commands work

**Dependencies:** Milestone 7 (dashboard exists, nav works)

---

### Milestone 9: Role Management Pages

**Goal:** Interface for managing roles and capabilities

**Status:** Not Started  
**Target:** Day 11-12  
**Estimated Effort:** 6-8 hours

**Tasks:**

- [ ] Create role list view (src/views/pages/roles/index.ejs)
  - [ ] Table: Role Name, Description, User Count, System Role, Actions
  - [ ] System roles marked (badge, can't delete)
  - [ ] Create Role button
  - [ ] Actions: Edit, Manage Capabilities, Delete (non-system only)
- [ ] Create role edit view (src/views/pages/roles/edit.ejs)
  - [ ] Form: name, description
  - [ ] Can't edit system roles (read-only)
  - [ ] Save, Cancel buttons
- [ ] Create capabilities management view (src/views/pages/roles/capabilities.ejs)
  - [ ] Grouped by category (Logs, Users, Roles, Websites, etc.)
  - [ ] Checkboxes for each capability
  - [ ] Dangerous capabilities highlighted (red badge)
  - [ ] Save button (batch update)
- [ ] Create role API routes (src/routes/api/roles.js)
  - [ ] GET /api/roles - list roles (requireCapability('roles:read'))
  - [ ] POST /api/roles - create role (requireCapability('roles:write'))
  - [ ] GET /api/roles/:id - get role details
  - [ ] PUT /api/roles/:id - update role
  - [ ] DELETE /api/roles/:id - delete role (non-system only)
  - [ ] GET /api/roles/:id/capabilities - list capabilities for role
  - [ ] POST /api/roles/:id/capabilities - grant capability
  - [ ] DELETE /api/roles/:id/capabilities/:capId - revoke capability
- [ ] Add validation
  - [ ] Can't delete system roles
  - [ ] Can't modify superuser role capabilities
  - [ ] Role name unique
- [ ] Add audit logging
  - [ ] Log role creation
  - [ ] Log role updates
  - [ ] Log capability grants/revokes

**Success Criteria:**

- ✓ Can list all roles
- ✓ Can create custom role
- ✓ Can edit role details
- ✓ Can manage capabilities (grant/revoke)
- ✓ System roles protected from deletion
- ✓ All operations audited

**Dependencies:** Milestone 8 (user management UI patterns established)

---

### Milestone 10: Website & Host Management Pages

**Goal:** Manage websites and host IP exclusions

**Status:** Not Started  
**Target:** Day 12-13  
**Estimated Effort:** 6-8 hours

**Tasks:**

- [ ] Create website list view (src/views/pages/websites/index.ejs)
  - [ ] Table: Domain, API Key Status, Log Count, Last Log, Actions
  - [ ] Search by domain
  - [ ] Filter by active/inactive
  - [ ] Create Website button
  - [ ] Actions: View Details, Edit, Regenerate API Key, Disable, Delete
- [ ] Create website edit view (src/views/pages/websites/edit.ejs)
  - [ ] Form: domain, description
  - [ ] Show API key creation date, last used
  - [ ] Regenerate API Key button (confirmation required)
  - [ ] Show recent logs (last 100)
  - [ ] Log ingestion instructions (curl example with API key)
- [ ] Create host list view (src/views/pages/hosts/index.ejs)
  - [ ] Table: Hostname, IP Count, Log Count, Last Seen, Actions
  - [ ] Actions: Edit, Manage IPs, View Logs
- [ ] Create host IPs view (src/views/pages/hosts/ips.ejs)
  - [ ] Host details at top (hostname, description)
  - [ ] Table: IP Address, Version, Description, Added Date, Actions
  - [ ] Add IP button (opens form)
  - [ ] Remove IP button (per IP, confirmation)
  - [ ] Validate IP format (IPv4/IPv6)
  - [ ] Auto-detect IP version
- [ ] Create website API routes (src/routes/api/websites.js)
  - [ ] GET /api/websites - list (requireCapability('websites:read'))
  - [ ] POST /api/websites - create (requireCapability('websites:write'))
  - [ ] GET /api/websites/:id - details
  - [ ] PUT /api/websites/:id - update
  - [ ] DELETE /api/websites/:id - delete (requireCapability('websites:delete'))
  - [ ] POST /api/websites/:id/regenerate-key - new API key
- [ ] Create host API routes (src/routes/api/hosts.js)
  - [ ] GET /api/hosts - list (requireCapability('hosts:read'))
  - [ ] GET /api/hosts/:id - details
  - [ ] PUT /api/hosts/:id - update (requireCapability('hosts:write'))
  - [ ] GET /api/hosts/:id/ips - list IPs
  - [ ] POST /api/hosts/:id/ips - add IP
  - [ ] DELETE /api/hosts/:id/ips/:ipId - remove IP
- [ ] Add validation
  - [ ] Domain must be valid format
  - [ ] IP address must be valid IPv4 or IPv6
  - [ ] Can't remove IP if it appears in recent logs (warning)
- [ ] CLI: Host IP management commands
  - [ ] hosts:list
  - [ ] hosts:show <hostname>
  - [ ] hosts:add-ip <hostname> <ip> [--description X]
  - [ ] hosts:remove-ip <hostname> <ip>

**Success Criteria:**

- ✓ Can list websites
- ✓ Can create/edit websites
- ✓ Can regenerate API keys
- ✓ Can list hosts
- ✓ Can manage host IPs (add/remove)
- ✓ IP validation works
- ✓ CLI commands work

**Dependencies:** Milestone 9 (UI patterns established)

---

### Milestone 11: Log Viewer (Spreadsheet Interface)

**Goal:** Full-featured log record viewer with filters and export

**Status:** Not Started  
**Target:** Day 14-16  
**Estimated Effort:** 12-16 hours

**Tasks:**

- [ ] Create log viewer view (src/views/pages/logs/viewer.ejs)
  - [ ] Full-width layout (collapsible sidebar)
  - [ ] Fixed toolbar at top
  - [ ] Filter form:
    - [ ] Date range picker (presets + custom)
    - [ ] Website multi-select dropdown
    - [ ] Host multi-select dropdown
    - [ ] HTTP code filter
    - [ ] Path contains input
    - [ ] IP address input
    - [ ] Apply Filters button
    - [ ] Clear Filters button
  - [ ] Export buttons (CSV, JSON)
  - [ ] Column visibility selector
  - [ ] Data table:
    - [ ] Sortable columns (Timestamp, Website, Host, HTTP Code, Method, Path, IP)
    - [ ] Color-coded HTTP codes
    - [ ] Fixed header (stays visible when scrolling)
    - [ ] Pagination controls (prev/next, page number, rows per page)
    - [ ] Row actions: View Details, Related Logs
  - [ ] Loading spinner (during queries)
- [ ] Create log detail modal (partial: src/views/partials/log-detail-modal.ejs)
  - [ ] Shows all log record fields
  - [ ] Pretty-printed JSON for raw_data
  - [ ] Copy buttons for IP, Path, User Agent
  - [ ] Links to website/host detail pages
  - [ ] Close button
- [ ] Create log viewer JavaScript (public/js/logs-viewer.js)
  - [ ] Filter form submission (AJAX)
  - [ ] Column sorting (AJAX)
  - [ ] Pagination (AJAX)
  - [ ] Export button handlers
  - [ ] Modal open/close
  - [ ] Keyboard shortcuts (F, E, N, P)
  - [ ] Debounce filter inputs (300ms)
- [ ] Create log viewer CSS (public/css/logs-viewer.css)
  - [ ] Spreadsheet-like table styles
  - [ ] Fixed header styles
  - [ ] Alternating row colors
  - [ ] Hover states
  - [ ] HTTP code color coding (green, yellow, orange, red)
  - [ ] Mobile responsive styles (card-based on small screens)
- [ ] Create log API routes (src/routes/api/logs.js)
  - [ ] GET /api/logs - list with filters (requireCapability('logs:read'))
    - [ ] Query params: dateStart, dateEnd, websites[], hosts[], httpCodes[], pathContains, ipAddress, sort, order, page, limit
    - [ ] Role-based filtering: customers only see their websites
    - [ ] Pagination (100 per page default)
    - [ ] Return: { logs: [...], total: N, page: X, pages: Y }
  - [ ] GET /api/logs/:id - single log details
  - [ ] POST /api/logs/export - export logs (CSV or JSON)
    - [ ] Respects current filters
    - [ ] Max 10,000 records
    - [ ] Returns downloadable file
- [ ] Implement role-based log access
  - [ ] Admin/Analyst: see all logs
  - [ ] Customer: only see logs from their linked websites
  - [ ] Query: JOIN user_websites WHERE user_id = ?
- [ ] Add export functionality
  - [ ] CSV format (all visible columns)
  - [ ] JSON format (full records)
  - [ ] Filename: logs-YYYY-MM-DD-HHMMSS.csv
  - [ ] Warning if exceeds 10,000 records
- [ ] Optimize database queries
  - [ ] Add indexes: (timestamp, website_id, http_code)
  - [ ] Consider partitioning by date (if very large dataset)
  - [ ] Use LIMIT/OFFSET for pagination
  - [ ] Query timeout: 30 seconds
- [ ] Add keyboard shortcuts
  - [ ] F - focus filter bar
  - [ ] E - export CSV
  - [ ] N - next page
  - [ ] P - previous page
  - [ ] Esc - close modal

**Success Criteria:**

- ✓ Can view logs with spreadsheet-like interface
- ✓ Filters work (date range, website, host, HTTP code, path, IP)
- ✓ Sorting works (click column headers)
- ✓ Pagination works (prev/next, jump to page)
- ✓ Role-based access enforced (customers see only their logs)
- ✓ Export works (CSV and JSON)
- ✓ Modal shows log details
- ✓ Related logs feature works
- ✓ Responsive on mobile (card-based view)
- ✓ Performance acceptable (<5 seconds for queries)
- ✓ Keyboard shortcuts work

**Dependencies:** Milestone 10 (UI patterns, website/host data available)

---

### Milestone 12: Audit Log Viewer

**Goal:** View and query audit log for privileged actions

**Status:** Not Started  
**Target:** Day 16  
**Estimated Effort:** 4-6 hours

**Tasks:**

- [ ] Create audit log view (src/views/pages/audit/index.ejs)
  - [ ] Table: Timestamp, User, Action, Resource, IP, Details
  - [ ] Filters: user, action type, resource type, date range
  - [ ] Pagination (100 per page)
  - [ ] Sort by timestamp (desc default)
  - [ ] Export button
  - [ ] View details modal (shows full JSON)
- [ ] Create audit API routes (src/routes/api/audit.js)
  - [ ] GET /api/audit - list entries (requireCapability('settings:read'))
  - [ ] GET /api/audit/:id - entry details
  - [ ] POST /api/audit/export - export to JSON
- [ ] CLI: Audit query command
  - [ ] audit:query [--user X] [--action Y] [--since Z]

**Success Criteria:**

- ✓ Can view audit log
- ✓ Filters work
- ✓ Details modal shows full data
- ✓ Export works
- ✓ CLI command works

**Dependencies:** Milestone 5 (audit logging implemented)

---

### Milestone 13: Settings Page

**Goal:** System settings management interface

**Status:** Not Started  
**Target:** Day 17  
**Estimated Effort:** 3-4 hours

**Tasks:**

- [ ] Create settings view (src/views/pages/settings/index.ejs)
  - [ ] Form sections:
    - [ ] Log retention days
    - [ ] Inactive website threshold days
    - [ ] Session timeout (hours)
    - [ ] Upstream sync config (if hierarchical mode)
  - [ ] Feature flag status (read-only):
    - [ ] UI_ENABLED
    - [ ] MODEL_API_ENABLED
  - [ ] Save button
- [ ] Create settings API routes (src/routes/api/settings.js)
  - [ ] GET /api/settings - get all settings (requireCapability('settings:read'))
  - [ ] PUT /api/settings - update settings (requireCapability('settings:write'))
- [ ] Settings service (src/services/settingsService.js)
  - [ ] getSettings() - read from config/database
  - [ ] updateSettings(data) - write to config/database
  - [ ] Note: Some settings require app restart

**Success Criteria:**

- ✓ Can view settings
- ✓ Can update settings
- ✓ Changes persist
- ✓ Warning shown if restart required

**Dependencies:** Milestone 11 (UI complete, settings last feature)

---

### Milestone 14: Testing & Bug Fixes

**Goal:** Comprehensive testing and bug resolution

**Status:** Not Started  
**Target:** Day 18-19  
**Estimated Effort:** 8-12 hours

**Tasks:**

- [ ] Manual testing
  - [ ] Test all user flows (login, create user, assign role, etc.)
  - [ ] Test role-based access control (try accessing pages without permission)
  - [ ] Test log viewer with large datasets (pagination, performance)
  - [ ] Test export functionality (CSV, JSON)
  - [ ] Test CLI commands (all user/role/audit commands)
  - [ ] Test on different browsers (Chrome, Firefox, Safari)
  - [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Security testing
  - [ ] Test session security (HttpOnly, Secure, SameSite)
  - [ ] Test CSRF protection
  - [ ] Test password hashing (bcrypt)
  - [ ] Test SQL injection prevention (prepared statements)
  - [ ] Test XSS prevention (EJS auto-escaping)
  - [ ] Test authorization bypass attempts
- [ ] Performance testing
  - [ ] Test log viewer with 1M+ records
  - [ ] Test query performance (should be <5 seconds)
  - [ ] Test export with 10K records
  - [ ] Test session lookup performance
- [ ] Bug fixes
  - [ ] Fix any issues found during testing
  - [ ] Address edge cases
  - [ ] Improve error messages
- [ ] Code review
  - [ ] Review all new code for quality
  - [ ] Ensure consistent code style
  - [ ] Add missing comments/documentation
  - [ ] Remove console.logs and debug code

**Success Criteria:**

- ✓ All features work as expected
- ✓ No critical bugs
- ✓ Performance acceptable
- ✓ Security tests pass
- ✓ Code quality acceptable

**Dependencies:** All previous milestones

---

### Milestone 15: Documentation & Release

**Goal:** Complete documentation and prepare for v2.0.0 release

**Status:** Not Started  
**Target:** Day 20  
**Estimated Effort:** 4-6 hours

**Tasks:**

- [ ] Update README.md
  - [ ] New features section (authentication, web UI, RBAC)
  - [ ] Updated installation instructions
  - [ ] Web UI setup guide
  - [ ] Breaking changes section (/api prefix)
- [ ] Update docs/installation.md
  - [ ] Add user creation steps
  - [ ] Add web UI access instructions
  - [ ] Update Fluent Bit config examples (new /api/logs endpoint)
- [ ] Create new docs
  - [ ] docs/web-ui-guide.md - Using the web UI
  - [ ] docs/user-management.md - Managing users and roles
  - [ ] docs/api-reference.md - API endpoint documentation (start, ongoing)
- [ ] Update .env.example
  - [ ] Add all new variables (SESSION_SECRET, UI_ENABLED, etc.)
  - [ ] Add comments explaining each variable
- [ ] Create CHANGELOG.md
  - [ ] Document v2.0.0 changes
  - [ ] Breaking changes
  - [ ] New features
  - [ ] Bug fixes
- [ ] Create migration guide
  - [ ] docs/migrating-to-v2.md
  - [ ] Fluent Bit configuration changes
  - [ ] Database migration steps
  - [ ] Environment variable changes
- [ ] Update package.json
  - [ ] Bump version to 2.0.0
  - [ ] Update dependencies
- [ ] Git tasks
  - [ ] Commit all changes
  - [ ] Tag release: v2.0.0
  - [ ] Push to repository

**Success Criteria:**

- ✓ All documentation updated
- ✓ Migration guide complete
- ✓ Version bumped to 2.0.0
- ✓ Release tagged

**Dependencies:** Milestone 14 (testing complete)

---

## Future Milestones (v2.1.0+)

### Milestone 16: Security Analysis - Phase 1 (v1.6.0)

- Event types model
- Security rules management
- Batch log processing
- Security events detection
- IP exclusion (already done in Milestone 10)

### Milestone 17: Security Analysis - Phase 2 (v1.7.0)

- External tool integration
- Tool execution framework
- Example tool scripts

### Milestone 18: Security Analysis - Phase 3 (v1.8.0)

- Fail2ban filter import
- Auto-sync with fail2ban rules
- Security dashboard UI

### Milestone 19: Advanced Analytics (v2.3.0)

- Charts and visualizations (Chart.js)
- Per-website dashboards
- Automated reports
- PDF export

---

## Progress Summary

**Overall Progress:** 5/15 milestones complete (33%)

**Phase 1 - Foundation (Milestones 1-5):** 5/5 complete (100%) ✅  
**Phase 2 - UI Core (Milestones 6-10):** Not Started  
**Phase 3 - Advanced Features (Milestones 11-13):** Not Started  
**Phase 4 - Polish (Milestones 14-15):** Not Started

**Current Milestone:** Milestone 6 (Web UI Foundation)

**Estimated Total Time:** 80-110 hours (10-14 working days at 8 hours/day)  
**Time Spent:** ~10 hours

---

## Risk Assessment

**Low Risk:**

- Database migrations (tested approach, can rollback)
- EJS templates (simple, well-documented)
- Passport.js integration (mature library)

**Medium Risk:**

- Log viewer performance (1.9M records, needs optimization)
- Role-based log filtering (complex SQL queries)
- Export functionality (large datasets, memory constraints)

**High Risk:**

- None identified (requirements well-defined, tech stack proven)

**Mitigation Strategies:**

- Test with real data early (1.9M records available)
- Optimize queries incrementally (indexes, EXPLAIN)
- Use streaming for large exports (if memory issues)
- Regular commits (easy rollback if issues)

---

## Next Steps

1. **Review this tracker** - Confirm milestones, tasks, and estimates
2. **Start Milestone 1** - API restructuring (low risk, quick win)
3. **Create branch** - `git checkout -b feature/web-ui-v2`
4. **Begin implementation** - Follow milestones sequentially
5. **Update tracker** - Check off tasks as completed
6. **Regular commits** - Commit after each milestone

---

**Document Status:** Planning phase - ready to start implementation

**Last Updated:** 2025-12-13

**Related Documents:**

- [dev-notes/authentication-authorization.md](authentication-authorization.md)
- [dev-notes/web-ui.md](web-ui.md)
- [dev-notes/cli-requirements.md](cli-requirements.md)
- [dev-notes/batch-log-processing.md](batch-log-processing.md)
