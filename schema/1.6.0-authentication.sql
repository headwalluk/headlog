-- Migration: 1.6.0 - Authentication System
-- Description: Add user accounts, sessions, and enhanced API key management for web UI
-- Author: Headlog Team
-- Date: 2025-12-13
-- Breaking Change: No (additive only - adds new tables and columns)

-- ============================================================================
-- Step 1: Create users table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique username for login',
  email VARCHAR(255) NOT NULL UNIQUE COMMENT 'User email address',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hashed password (cost factor 12)',
  is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Account status (false = disabled)',
  is_superuser BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Superuser bypasses all permission checks',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Last successful login timestamp',
  last_login_ip VARCHAR(45) NULL DEFAULT NULL COMMENT 'IP address of last login (supports IPv6)',
  
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_is_active (is_active),
  INDEX idx_last_login_at (last_login_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User accounts for web UI authentication';

-- ============================================================================
-- Step 2: Create sessions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(128) NOT NULL PRIMARY KEY COMMENT 'Session ID from express-session',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User ID this session belongs to',
  data TEXT NOT NULL COMMENT 'Serialized session data (JSON)',
  expires_at TIMESTAMP NOT NULL COMMENT 'Session expiration timestamp',
  ip_address VARCHAR(45) NULL DEFAULT NULL COMMENT 'IP address of session creation (IPv6 support)',
  user_agent VARCHAR(500) NULL DEFAULT NULL COMMENT 'Browser user agent string',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Session storage for express-session with MariaDB backend';

-- ============================================================================
-- Step 3: Enhance API keys table with user association
-- ============================================================================
ALTER TABLE api_keys
  ADD COLUMN user_id BIGINT UNSIGNED NULL DEFAULT NULL 
    COMMENT 'User who owns this API key (NULL for legacy keys)' AFTER id,
  ADD COLUMN permissions JSON NULL DEFAULT NULL 
    COMMENT 'JSON array of granted permissions for fine-grained access control',
  ADD COLUMN expires_at TIMESTAMP NULL DEFAULT NULL 
    COMMENT 'Optional expiration timestamp for temporary API keys',
  ADD COLUMN last_used_ip VARCHAR(45) NULL DEFAULT NULL 
    COMMENT 'IP address of most recent API request (IPv6 support)' AFTER last_used_at,
  ADD INDEX idx_user_id (user_id),
  ADD INDEX idx_expires_at (expires_at),
  ADD CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) 
    REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. Password Security:
--    - Passwords must be hashed with bcrypt (cost factor 12)
--    - Minimum 12 characters with complexity requirements enforced in application
--    - Never store plaintext passwords
--
-- 2. Session Management:
--    - Sessions expire after 24 hours by default (configurable in .env)
--    - HttpOnly cookies prevent XSS attacks
--    - Secure flag required in production (HTTPS)
--    - SameSite=strict prevents CSRF
--
-- 3. API Key Enhancements:
--    - user_id links API keys to user accounts (NULL for legacy keys)
--    - permissions JSON allows fine-grained access control
--    - expires_at enables temporary API keys for automated tasks
--    - last_used_ip helps track API key usage patterns
--
-- 4. Foreign Keys:
--    - sessions.user_id -> users.id (CASCADE DELETE)
--    - api_keys.user_id -> users.id (SET NULL)
--
-- 5. Bootstrap Process:
--    - First admin user created via CLI: node cli.js users:create-admin
--    - No database seeding (security best practice)
--
-- 6. Backward Compatibility:
--    - Existing API keys continue to work (user_id = NULL)
--    - Log ingestion unaffected by new authentication system
--    - Web UI disabled by default (UI_ENABLED=false)

