# Authentication & Authorization

## Overview

Security-first authentication and authorization system with granular feature flags. The system supports both API key authentication (for machine-to-machine) and user session authentication (for web UI), with role-based access control.

**Core Philosophy:**

- Security through feature flags - disable entire subsystems via `.env`
- Dual authentication: API keys (existing) + user sessions (new)
- Role-based authorization with capabilities
- Audit trail for all privileged actions
- No authentication = read-only log ingestion only

## Feature Flags

### Environment Configuration

```bash
# Feature Toggles (default: false for security)
UI_ENABLED=false          # Enable web UI (HTML/CSS/JS assets, login page)
MODEL_API_ENABLED=false   # Enable model manipulation APIs (users, roles, websites, etc.)

# When both disabled:
# - Only log ingestion endpoint active (POST /logs with API key)
# - Upstream sync works (server-to-server)
# - No user management, no web UI, no data modification

# Typical configurations:
# Production log collector: UI_ENABLED=false, MODEL_API_ENABLED=false
# Admin dashboard: UI_ENABLED=true, MODEL_API_ENABLED=true
# Headless admin: UI_ENABLED=false, MODEL_API_ENABLED=true (API only, no UI assets)
```

### Security Behavior

| UI_ENABLED | MODEL_API_ENABLED | Behavior                                              |
| ---------- | ----------------- | ----------------------------------------------------- |
| false      | false             | Log ingestion only (current production mode)          |
| false      | true              | API access only (no public assets, headless admin)    |
| true       | false             | View-only UI (can't modify data, read-only dashboard) |
| true       | true              | Full admin access (UI + API)                          |

**Important:** When `UI_ENABLED=false`, the `dist/` directory should be empty or absent. No HTML/CSS/JS served. This prevents any attack surface from the UI layer.

## Authentication Methods

### 1. API Key Authentication (Existing)

**Current Implementation:**

- Used for log ingestion: `POST /logs`
- API key stored in `api_keys` table (hashed)
- Validated via middleware

**Enhancements Needed:**

- Associate API keys with users (optional, for audit trail)
- API key permissions (can only POST logs, vs admin API keys)
- API key expiration dates
- Rate limiting per API key

**Schema Changes:**

```sql
ALTER TABLE api_keys
  ADD COLUMN user_id INT UNSIGNED NULL AFTER id,
  ADD COLUMN permissions JSON NULL,  -- ['logs:write', 'model:read', etc.]
  ADD COLUMN expires_at TIMESTAMP NULL,
  ADD COLUMN last_used_ip VARCHAR(45) NULL,
  ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

### 2. User Session Authentication (New)

**Method:** Cookie-based sessions for web UI

**Flow:**

1. User visits login page (only if `UI_ENABLED=true`)
2. Submits username/email + password
3. Server validates credentials
4. Creates session, sets HttpOnly cookie
5. Subsequent requests include session cookie
6. Middleware validates session and loads user + roles

**Session Storage:**

```sql
CREATE TABLE sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  data TEXT,  -- serialized session data
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_expires (expires_at),
  INDEX idx_user (user_id)
);
```

**Session Configuration:**

```bash
# Session Management
SESSION_SECRET=<random-secret-key>  # for signing cookies
SESSION_NAME=headlog_session
SESSION_MAX_AGE=86400  # 24 hours in seconds
SESSION_SECURE=true    # true in production (HTTPS only)
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=strict
```

## Authorization System

### User Model

```sql
CREATE TABLE users (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash
  is_active BOOLEAN DEFAULT TRUE,
  is_superuser BOOLEAN DEFAULT FALSE,  -- bypass all permission checks
  last_login_at TIMESTAMP NULL,
  last_login_ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_active (is_active)
);
```

**Password Requirements:**

- Minimum 12 characters
- Must contain: uppercase, lowercase, number, special character
- Hashed with bcrypt (cost factor 12)
- No password reuse (track last 5 passwords)

### Role-Based Access Control

```sql
CREATE TABLE roles (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,  -- can't be deleted (admin, viewer, etc.)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_name (name)
);

CREATE TABLE user_roles (
  user_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by INT UNSIGNED NULL,  -- user who assigned the role

  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_role (role_id)
);
```

### Capability System

**Capabilities** are granular permissions attached to roles.

```sql
CREATE TABLE capabilities (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,  -- e.g., 'logs:read', 'users:write'
  description TEXT,
  category VARCHAR(50) NOT NULL,  -- logs, users, roles, websites, security, etc.
  is_dangerous BOOLEAN DEFAULT FALSE,  -- requires superuser (e.g., users:delete)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name),
  INDEX idx_category (category)
);

CREATE TABLE role_capabilities (
  role_id INT UNSIGNED NOT NULL,
  capability_id INT UNSIGNED NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by INT UNSIGNED NULL,

  PRIMARY KEY (role_id, capability_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_role (role_id),
  INDEX idx_capability (capability_id)
);
```

### Capability Naming Convention

Format: `<resource>:<action>[:<scope>]`

**Examples:**

- `logs:read` - View log records
- `logs:write` - Submit log records (via API key or session)
- `logs:delete` - Delete log records (dangerous)
- `users:read` - View user list
- `users:write` - Create/update users
- `users:delete` - Delete users (dangerous)
- `roles:read` - View roles
- `roles:write` - Create/update roles
- `roles:assign` - Assign roles to users
- `websites:read` - View websites
- `websites:write` - Create/update websites
- `websites:delete` - Delete websites
- `hosts:read` - View hosts
- `hosts:write` - Manage host IPs
- `security-rules:read` - View security rules
- `security-rules:write` - Create/update security rules
- `security-events:read` - View detected security events
- `api-keys:read` - View API keys (own or all)
- `api-keys:write` - Create/revoke API keys
- `settings:read` - View system settings
- `settings:write` - Modify system settings (dangerous)
- `stats:read` - View statistics

### System Roles (Seeded)

```sql
-- Superuser (all capabilities, bypass checks)
INSERT INTO roles (name, description, is_system) VALUES
('superuser', 'Full system access, bypasses all permission checks', TRUE);

-- Administrator (all capabilities except dangerous ones)
INSERT INTO roles (name, description, is_system) VALUES
('administrator', 'Manage users, roles, and system configuration', TRUE);

-- Security Analyst (read security events, manage rules)
INSERT INTO roles (name, description, is_system) VALUES
('security-analyst', 'Manage security rules and view detected events', TRUE);

-- Viewer (read-only access)
INSERT INTO roles (name, description, is_system) VALUES
('viewer', 'Read-only access to logs and statistics', TRUE);

-- Log Writer (API keys only, for log ingestion)
INSERT INTO roles (name, description, is_system) VALUES
('log-writer', 'Submit log records via API', TRUE);
```

### Permission Check Logic

```javascript
// Middleware: requireCapability(capability)
function requireCapability(capability) {
  return async (req, res, next) => {
    // Check feature flags
    if (!config.MODEL_API_ENABLED) {
      return res.status(403).json({ error: 'Model API disabled' });
    }

    // Check authentication
    if (!req.user && !req.apiKey) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Superuser bypasses all checks
    if (req.user?.is_superuser) {
      return next();
    }

    // Check if user has capability (via roles)
    const hasCapability = await checkUserCapability(req.user.id, capability);
    if (!hasCapability) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Usage in routes:
router.get('/users', requireCapability('users:read'), listUsers);
router.post('/users', requireCapability('users:write'), createUser);
router.delete('/users/:id', requireCapability('users:delete'), deleteUser);
```

## Audit Trail

Track all privileged actions for security and compliance.

```sql
CREATE TABLE audit_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  api_key_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,  -- 'user.create', 'role.assign', 'website.delete', etc.
  resource_type VARCHAR(50) NOT NULL,  -- 'user', 'role', 'website', etc.
  resource_id VARCHAR(100) NULL,  -- ID of affected resource
  details JSON NULL,  -- before/after values, etc.
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_created (created_at)
);
```

**Audited Actions:**

- User CRUD operations
- Role assignments
- Capability grants
- API key creation/revocation
- Security rule changes
- Dangerous operations (deletes, bulk operations)

## API Endpoint Protection

### Current Endpoints (Unauthenticated)

```javascript
// Log ingestion (API key required)
POST /logs
  - Requires valid API key
  - No change needed

// Hierarchical sync (server-to-server, API key)
POST /logs/batch
  - Requires valid API key
  - No change needed

// Health check (public)
GET /health
  - No authentication
  - No change needed
```

### New Protected Endpoints (Require Authentication + Capability)

```javascript
// User Management (MODEL_API_ENABLED required)
GET    /api/users              - Capability: users:read
POST   /api/users              - Capability: users:write
GET    /api/users/:id          - Capability: users:read
PUT    /api/users/:id          - Capability: users:write
DELETE /api/users/:id          - Capability: users:delete (dangerous)
POST   /api/users/:id/roles    - Capability: roles:assign

// Role Management
GET    /api/roles              - Capability: roles:read
POST   /api/roles              - Capability: roles:write
GET    /api/roles/:id          - Capability: roles:read
PUT    /api/roles/:id          - Capability: roles:write
DELETE /api/roles/:id          - Capability: roles:write (can't delete system roles)

// Capability Management
GET    /api/capabilities       - Capability: roles:read
POST   /api/roles/:id/capabilities  - Capability: roles:write

// Website Management
GET    /api/websites           - Capability: websites:read
POST   /api/websites           - Capability: websites:write
GET    /api/websites/:id       - Capability: websites:read
PUT    /api/websites/:id       - Capability: websites:write
DELETE /api/websites/:id       - Capability: websites:delete

// Host Management
GET    /api/hosts              - Capability: hosts:read
GET    /api/hosts/:id          - Capability: hosts:read
PUT    /api/hosts/:id          - Capability: hosts:write
POST   /api/hosts/:id/ips      - Capability: hosts:write
DELETE /api/hosts/:id/ips/:ip  - Capability: hosts:write

// Log Records (read-only via UI)
GET    /api/logs               - Capability: logs:read
GET    /api/logs/:id           - Capability: logs:read
POST   /api/logs/export        - Capability: logs:read

// Security Analysis
GET    /api/event-types        - Capability: security-rules:read
POST   /api/event-types        - Capability: security-rules:write
GET    /api/security-rules     - Capability: security-rules:read
POST   /api/security-rules     - Capability: security-rules:write
GET    /api/security-events    - Capability: security-events:read

// API Keys
GET    /api/api-keys           - Capability: api-keys:read (own keys)
POST   /api/api-keys           - Capability: api-keys:write
DELETE /api/api-keys/:id       - Capability: api-keys:write

// Statistics
GET    /api/stats              - Capability: stats:read
GET    /api/stats/ingestion    - Capability: stats:read
GET    /api/stats/upstream     - Capability: stats:read
```

## Implementation Phases

### Phase 1: Core Authentication (v2.0.0)

**Goal:** Basic user authentication and session management

**Deliverables:**

- [ ] Database schema migration (2.0.0-authentication.sql)
  - users table
  - sessions table
  - ALTER api_keys (add user_id, permissions, expires_at)
- [ ] Implement src/models/User.js
  - Password hashing/validation (bcrypt)
  - Password strength validation
  - User CRUD operations
- [ ] Implement src/services/authService.js
  - login(username, password)
  - logout(sessionId)
  - validateSession(sessionId)
  - refreshSession(sessionId)
- [ ] Session middleware
  - Extract session cookie
  - Load user from session
  - Attach to req.user
- [ ] Environment variables: UI_ENABLED, MODEL_API_ENABLED
- [ ] Feature flag middleware (check if features enabled)
- [ ] Login/logout API endpoints
- [ ] CLI command: `users:create-admin` (bootstrap first user)

**Success Criteria:**

- Can create admin user via CLI
- Can login via API (POST /auth/login)
- Session persists across requests
- Can logout (destroys session)
- Feature flags properly disable endpoints

### Phase 2: Authorization System (v2.1.0)

**Goal:** Role-based access control with capabilities

**Deliverables:**

- [ ] Database schema migration (2.1.0-authorization.sql)
  - roles table
  - user_roles table
  - capabilities table
  - role_capabilities table
  - audit_log table
- [ ] Seed system roles and capabilities
- [ ] Implement src/models/Role.js
- [ ] Implement src/models/Capability.js
- [ ] Implement src/services/authorizationService.js
  - checkUserCapability(userId, capability)
  - getUserRoles(userId)
  - assignRole(userId, roleId)
  - grantCapability(roleId, capabilityId)
- [ ] Authorization middleware: requireCapability(capability)
- [ ] Protect all model API endpoints
- [ ] Audit logging for privileged actions
- [ ] CLI commands:
  - `roles:list`
  - `roles:assign <user> <role>`
  - `capabilities:list [--role X]`
  - `audit:query [--user X] [--action Y]`

**Success Criteria:**

- Role assignment works
- Capabilities properly restrict access
- Superuser bypasses all checks
- Audit log captures all privileged actions
- Feature flags respected (MODEL_API_ENABLED)

### Phase 3: API Key Enhancements (v2.2.0)

**Goal:** API keys with permissions and expiration

**Deliverables:**

- [ ] Update API key middleware to check permissions
- [ ] Implement API key permission validation
- [ ] API key expiration enforcement
- [ ] Link API keys to users (optional, for audit)
- [ ] CLI commands:
  - `keys:create [--user X] [--permissions Y] [--expires Z]`
  - `keys:revoke <key-id>`
  - `keys:list [--user X] [--show-permissions]`

**Success Criteria:**

- Can create API keys with specific permissions
- Expired API keys rejected
- API keys properly audited to user accounts

## Security Considerations

1. **Feature Flags as Kill Switches**
   - `UI_ENABLED=false` → No HTML/CSS/JS served, zero UI attack surface
   - `MODEL_API_ENABLED=false` → No data modification possible
   - Can lock down production to log ingestion only

2. **Password Security**
   - bcrypt with cost factor 12
   - Minimum 12 characters with complexity requirements
   - No password reuse (track history)
   - Rate limit login attempts (5 attempts per 15 minutes)

3. **Session Security**
   - HttpOnly cookies (no JavaScript access)
   - Secure flag in production (HTTPS only)
   - SameSite=strict (CSRF protection)
   - Session expiration (24 hours default)
   - Session invalidation on logout

4. **Superuser Protection**
   - Superuser status can only be granted via CLI
   - Audit all superuser actions
   - Recommend: create one superuser, then use admin roles

5. **Audit Everything**
   - All privileged actions logged
   - IP address and user agent captured
   - Before/after values for data changes
   - Immutable audit log (no deletion)

6. **API Key Protection**
   - Keys hashed in database
   - Expiration dates enforced
   - Permission restrictions
   - Rate limiting per key

## Configuration Examples

### Production Log Collector (Locked Down)

```bash
UI_ENABLED=false
MODEL_API_ENABLED=false
# Result: Only POST /logs works, everything else disabled
```

### Admin Dashboard (Full Access)

```bash
UI_ENABLED=true
MODEL_API_ENABLED=true
SESSION_SECURE=true  # HTTPS only
SESSION_MAX_AGE=28800  # 8 hours
# Result: Web UI + full API access
```

### Headless API Admin (No UI)

```bash
UI_ENABLED=false
MODEL_API_ENABLED=true
# Result: API access via sessions/keys, no public web assets
```

### Read-Only Dashboard

```bash
UI_ENABLED=true
MODEL_API_ENABLED=false
# Result: Can view data, can't modify (assign viewer roles only)
```

## Open Questions

1. **Multi-Factor Authentication**: Should we support TOTP/2FA for high-privilege accounts?
   - Recommendation: Phase 4 enhancement for superusers

2. **Password Reset**: How to handle forgotten passwords?
   - Email-based reset? (requires email configuration)
   - Admin-initiated reset via CLI?
   - Recommendation: CLI reset for v2.0.0, email reset in Phase 4

3. **Session Storage**: Database vs Redis?
   - Database: Simple, no additional dependencies
   - Redis: Better performance for high-traffic
   - Recommendation: Database for v2.0.0, Redis option in Phase 4

4. **OAuth/SSO**: Should we support external identity providers?
   - Recommendation: Future enhancement (v2.3.0+)

5. **API Rate Limiting**: Per-user or per-role?
   - Recommendation: Per-API-key and per-user session separately

---

**Document Status:** Requirements phase - ready for review

**Last Updated:** 2025-12-13

**Related Documents:**

- [dev-notes/web-ui.md](web-ui.md) - Web UI requirements
- [dev-notes/batch-log-processing.md](batch-log-processing.md) - Security analysis feature
- [docs/api-reference.md](../docs/api-reference.md) - API documentation (coming soon)
