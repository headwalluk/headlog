-- Migration: 1.6.1 - Authorization System (RBAC)
-- Description: Add roles, capabilities, and audit logging for role-based access control
-- Author: Headlog Team
-- Date: 2025-12-13
-- Breaking Change: No (additive only - adds new tables)

-- ============================================================================
-- Step 1: Create roles table
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE COMMENT 'Role name (e.g., administrator, viewer)',
  description TEXT NULL COMMENT 'Human-readable description of role purpose',
  is_system BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'System roles cannot be deleted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_is_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Roles for role-based access control';

-- ============================================================================
-- Step 2: Create user_roles junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User who has this role',
  role_id BIGINT UNSIGNED NOT NULL COMMENT 'Role assigned to user',
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by BIGINT UNSIGNED NULL COMMENT 'User ID who assigned this role',
  
  UNIQUE KEY unique_user_role (user_id, role_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role_id (role_id),
  INDEX idx_assigned_by (assigned_by),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Maps users to their assigned roles';

-- ============================================================================
-- Step 3: Create capabilities table
-- ============================================================================
CREATE TABLE IF NOT EXISTS capabilities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Capability name (e.g., logs:read, users:write)',
  description TEXT NULL COMMENT 'Human-readable description of what this capability allows',
  category VARCHAR(50) NOT NULL COMMENT 'Category for grouping (e.g., logs, users, roles)',
  is_dangerous BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Requires extra confirmation (e.g., delete operations)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_name (name),
  INDEX idx_category (category),
  INDEX idx_is_dangerous (is_dangerous)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Granular permissions for role-based access control';

-- ============================================================================
-- Step 4: Create role_capabilities junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS role_capabilities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT UNSIGNED NOT NULL COMMENT 'Role that has this capability',
  capability_id BIGINT UNSIGNED NOT NULL COMMENT 'Capability granted to role',
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by BIGINT UNSIGNED NULL COMMENT 'User ID who granted this capability',
  
  UNIQUE KEY unique_role_capability (role_id, capability_id),
  INDEX idx_role_id (role_id),
  INDEX idx_capability_id (capability_id),
  INDEX idx_granted_by (granted_by),
  
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Maps roles to their granted capabilities';

-- ============================================================================
-- Step 5: Create audit_log table
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL COMMENT 'User who performed the action',
  api_key_id INT UNSIGNED NULL COMMENT 'API key used for the action (if applicable)',
  action VARCHAR(100) NOT NULL COMMENT 'Action performed (e.g., user.create, role.assign)',
  resource_type VARCHAR(50) NOT NULL COMMENT 'Type of resource affected (e.g., user, role, log)',
  resource_id VARCHAR(100) NULL COMMENT 'ID of the affected resource',
  details JSON NULL COMMENT 'Additional context about the action',
  ip_address VARCHAR(45) NULL COMMENT 'IP address of the request (IPv6 support)',
  user_agent VARCHAR(500) NULL COMMENT 'User agent string from browser/client',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_api_key_id (api_key_id),
  INDEX idx_action (action),
  INDEX idx_resource_type (resource_type),
  INDEX idx_resource_id (resource_id),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit trail for privileged actions and security events';

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. Role-Based Access Control (RBAC):
--    - Users can have multiple roles (many-to-many via user_roles)
--    - Roles have multiple capabilities (many-to-many via role_capabilities)
--    - Superusers bypass all capability checks (checked at application level)
--
-- 2. System Roles:
--    - Marked with is_system = TRUE
--    - Cannot be deleted via UI/API (enforced at application level)
--    - Seeded separately in 1.6.1-seed-roles-capabilities.sql
--
-- 3. Capabilities:
--    - Named with pattern: resource:action (e.g., logs:read, users:write)
--    - Categories group related capabilities (logs, users, roles, websites, etc.)
--    - Dangerous capabilities require additional confirmation (e.g., delete operations)
--
-- 4. Audit Logging:
--    - Tracks all privileged actions (user management, role changes, etc.)
--    - Links to user OR api_key (one will be NULL)
--    - JSON details field stores action-specific context
--    - IP and user agent help track suspicious activity
--
-- 5. Foreign Keys:
--    - user_roles: CASCADE delete (remove role when user deleted)
--    - role_capabilities: CASCADE delete (remove capability when role deleted)
--    - audit_log: SET NULL (preserve audit trail even if user/key deleted)
--
-- 6. Next Steps:
--    - Run seed script to populate system roles and capabilities
--    - Implement authorization service to check user capabilities
--    - Add requireCapability middleware for route protection
