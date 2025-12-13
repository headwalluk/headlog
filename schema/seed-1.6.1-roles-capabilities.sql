-- Seed: 1.6.1 - System Roles and Capabilities
-- Description: Populate default roles and capabilities for RBAC system
-- Author: Headlog Team
-- Date: 2025-12-13
-- Note: Run this AFTER 1.6.1-authorization.sql migration

-- ============================================================================
-- Step 1: Insert System Roles
-- ============================================================================
INSERT INTO roles (name, description, is_system) VALUES
  ('administrator', 'Full access to all features except superuser-only operations', TRUE),
  ('security-analyst', 'View and manage security events, rules, and analysis', TRUE),
  ('viewer', 'Read-only access to logs and reports', TRUE),
  ('log-writer', 'Can create log records and manage API keys (for service accounts)', TRUE);

-- ============================================================================
-- Step 2: Insert Capabilities
-- ============================================================================

-- Log Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('logs:read', 'View log records and search logs', 'logs', FALSE),
  ('logs:write', 'Ingest new log records', 'logs', FALSE),
  ('logs:delete', 'Delete log records', 'logs', TRUE),
  ('logs:export', 'Export logs to CSV/JSON', 'logs', FALSE);

-- User Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('users:read', 'View user accounts and details', 'users', FALSE),
  ('users:write', 'Create and update user accounts', 'users', FALSE),
  ('users:delete', 'Delete user accounts', 'users', TRUE),
  ('users:manage-roles', 'Assign and remove user roles', 'users', FALSE),
  ('users:reset-password', 'Reset user passwords', 'users', FALSE);

-- Role Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('roles:read', 'View roles and their capabilities', 'roles', FALSE),
  ('roles:write', 'Create and update roles', 'roles', FALSE),
  ('roles:delete', 'Delete custom roles', 'roles', TRUE),
  ('roles:manage-capabilities', 'Grant and revoke capabilities from roles', 'roles', FALSE);

-- Website Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('websites:read', 'View website details and statistics', 'websites', FALSE),
  ('websites:write', 'Update website configuration', 'websites', FALSE),
  ('websites:delete', 'Delete websites and their logs', 'websites', TRUE);

-- Host Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('hosts:read', 'View host details and IP addresses', 'hosts', FALSE),
  ('hosts:write', 'Update host configuration and manage IPs', 'hosts', FALSE),
  ('hosts:delete', 'Delete hosts', 'hosts', TRUE);

-- API Key Management Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('api-keys:read', 'View API keys and their usage', 'api-keys', FALSE),
  ('api-keys:write', 'Create and update API keys', 'api-keys', FALSE),
  ('api-keys:delete', 'Delete API keys', 'api-keys', TRUE);

-- Security Analysis Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('security-events:read', 'View security events and violations', 'security', FALSE),
  ('security-events:write', 'Create security events manually', 'security', FALSE),
  ('security-events:delete', 'Delete security events', 'security', TRUE),
  ('security-rules:read', 'View security detection rules', 'security', FALSE),
  ('security-rules:write', 'Create and update security rules', 'security', FALSE),
  ('security-rules:delete', 'Delete security rules', 'security', TRUE),
  ('security-analysis:run', 'Trigger manual security analysis', 'security', FALSE);

-- System Settings Capabilities
INSERT INTO capabilities (name, description, category, is_dangerous) VALUES
  ('settings:read', 'View system settings and configuration', 'settings', FALSE),
  ('settings:write', 'Update system settings', 'settings', TRUE),
  ('audit-log:read', 'View audit log entries', 'settings', FALSE);

-- ============================================================================
-- Step 3: Assign Capabilities to Roles
-- ============================================================================

-- Administrator Role: Full access to everything
INSERT INTO role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r
CROSS JOIN capabilities c
WHERE r.name = 'administrator';

-- Security Analyst Role: Security events, rules, and read-only access
INSERT INTO role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r
CROSS JOIN capabilities c
WHERE r.name = 'security-analyst'
  AND c.name IN (
    'logs:read',
    'logs:export',
    'security-events:read',
    'security-events:write',
    'security-events:delete',
    'security-rules:read',
    'security-rules:write',
    'security-rules:delete',
    'security-analysis:run',
    'websites:read',
    'hosts:read',
    'audit-log:read'
  );

-- Viewer Role: Read-only access to logs and reports
INSERT INTO role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r
CROSS JOIN capabilities c
WHERE r.name = 'viewer'
  AND c.name IN (
    'logs:read',
    'logs:export',
    'security-events:read',
    'security-rules:read',
    'websites:read',
    'hosts:read'
  );

-- Log Writer Role: Service accounts that only need to write logs
INSERT INTO role_capabilities (role_id, capability_id)
SELECT r.id, c.id
FROM roles r
CROSS JOIN capabilities c
WHERE r.name = 'log-writer'
  AND c.name IN (
    'logs:write',
    'api-keys:read',
    'api-keys:write'
  );

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. System Roles:
--    - administrator: Full access (but not superuser - can't delete system roles)
--    - security-analyst: Focus on security events and analysis
--    - viewer: Read-only for customers/stakeholders
--    - log-writer: Minimal permissions for automated log ingestion
--
-- 2. Superuser Bypass:
--    - Superusers (is_superuser = TRUE) bypass ALL capability checks
--    - They don't need role assignments
--    - Only superusers can delete system roles and manage superuser status
--
-- 3. Custom Roles:
--    - Users can create custom roles with any capability combination
--    - Custom roles have is_system = FALSE
--    - Can be deleted/modified without restrictions
--
-- 4. Capability Naming Convention:
--    - Format: resource:action
--    - Actions: read, write, delete, manage-*, run
--    - Categories match resource types for UI grouping
--
-- 5. Future Capabilities:
--    - Add more as features are developed
--    - Examples: reports:generate, backups:create, integrations:configure
