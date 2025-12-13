# CLI Tool Requirements

## Overview

Command-line interface for administrative tasks, bootstrapping, and operations that should not require web UI access. The CLI provides essential system management capabilities, particularly for initial setup and maintenance tasks.

**Core Philosophy:**

- Essential for bootstrapping (create first admin user before UI exists)
- Provides alternative to web UI for automation/scripting
- Server-side only (no remote CLI execution)
- Uses same models/services as web UI (DRY principle)
- Clear, intuitive command syntax

## Current Commands (v1.5.1)

### API Key Management

```bash
# List all API keys
node cli.js keys:list

# Output:
# ID  Status   Description           Last Used            Created
# 1   active   Production server     2025-12-13 14:23:01  2025-11-01 10:00:00
# 2   active   Staging environment   2025-12-12 09:15:22  2025-11-05 14:30:00
# 3   revoked  Old dev key           2025-10-01 12:00:00  2025-09-01 08:00:00

# Create new API key
node cli.js keys:create --description "My new key"

# Output:
# API Key created successfully!
#
# Key: sk_1a2b3c4d5e6f7g8h9i0j
#
# IMPORTANT: Save this key securely. It will not be shown again.
#
# Key ID: 4
# Description: My new key
# Created: 2025-12-13 15:30:00

# Create key for specific website
node cli.js keys:create --website example.com --description "example.com production"

# Revoke API key (soft delete, mark as inactive)
node cli.js keys:revoke <key-id>
node cli.js keys:revoke 3

# Output:
# API key #3 has been revoked.

# Delete API key (hard delete, permanent)
node cli.js keys:delete <key-id>
node cli.js keys:delete 3 --confirm

# Output:
# API key #3 has been permanently deleted.
```

## New Commands (v2.0.0+)

### User Management

```bash
# Create admin user (bootstrap command)
node cli.js users:create-admin

# Interactive prompts:
# Username: admin
# Email: admin@example.com
# Password: [hidden input, min 12 chars]
# Confirm password: [hidden]
#
# Admin user created successfully!
# Username: admin
# Email: admin@example.com
# Role: superuser (assigned automatically)
#
# You can now log in at: http://localhost:3005/

# Create admin user (non-interactive)
node cli.js users:create-admin \
  --username admin \
  --email admin@example.com \
  --password 'MySecure123!Pass'

# Create regular user
node cli.js users:create \
  --username johndoe \
  --email john@example.com \
  --password 'SecurePass123!' \
  --role viewer

# Output:
# User created successfully!
# Username: johndoe
# Email: john@example.com
# Roles: viewer
# Status: active

# List all users
node cli.js users:list

# Output:
# ID  Username    Email                 Roles           Status    Last Login
# 1   admin       admin@example.com     superuser       active    2025-12-13 14:00:00
# 2   johndoe     john@example.com      viewer          active    2025-12-12 10:30:00
# 3   analyst     analyst@example.com   security-an...  active    2025-12-13 09:15:00
# 4   olduser     old@example.com       viewer          disabled  2025-10-01 08:00:00

# List users with filters
node cli.js users:list --role viewer
node cli.js users:list --status active
node cli.js users:list --email "@example.com"

# Show user details
node cli.js users:show <username>
node cli.js users:show johndoe

# Output:
# User: johndoe
# ================
# ID: 2
# Email: john@example.com
# Status: active
# Roles: viewer
# Created: 2025-11-01 10:00:00
# Last Login: 2025-12-12 10:30:00
# Last Login IP: 192.168.1.100
#
# Websites Access: (none)
#
# API Keys: 1
#   - Key #5: "johndoe personal key" (active, last used 2025-12-12)

# Disable user (soft delete, preserves data)
node cli.js users:disable <username>
node cli.js users:disable johndoe

# Output:
# User 'johndoe' has been disabled.
# All active sessions have been terminated.

# Enable user
node cli.js users:enable <username>
node cli.js users:enable johndoe

# Delete user (hard delete, permanent)
node cli.js users:delete <username> --confirm
node cli.js users:delete johndoe --confirm

# Output:
# WARNING: This will permanently delete user 'johndoe' and all associated data.
# Type the username to confirm: johndoe
# User 'johndoe' has been permanently deleted.

# Reset user password
node cli.js users:reset-password <username>
node cli.js users:reset-password johndoe

# Interactive prompt:
# New password: [hidden]
# Confirm password: [hidden]
#
# Password reset successfully for user 'johndoe'
# All active sessions have been terminated.

# Reset password (non-interactive)
node cli.js users:reset-password johndoe --password 'NewSecure123!'

# Make user superuser (dangerous)
node cli.js users:make-superuser <username> --confirm
node cli.js users:make-superuser johndoe --confirm

# Output:
# WARNING: Superusers have unrestricted access to all system functions.
# Type 'CONFIRM' to proceed: CONFIRM
# User 'johndoe' is now a superuser.
```

### Role Management

```bash
# List all roles
node cli.js roles:list

# Output:
# ID  Name              Users  System  Description
# 1   superuser         1      yes     Full system access
# 2   administrator     2      yes     Manage users, roles, and settings
# 3   security-analyst  1      yes     Manage security rules and events
# 4   viewer            5      yes     Read-only access
# 5   custom-role       3      no      Custom role for project managers

# Show role details with capabilities
node cli.js roles:show <role-name>
node cli.js roles:show administrator

# Output:
# Role: administrator
# ==================
# ID: 2
# Description: Manage users, roles, and system configuration
# System Role: yes (cannot be deleted)
# Users: 2
#
# Capabilities:
#   Users:
#     - users:read
#     - users:write
#   Roles:
#     - roles:read
#     - roles:write
#     - roles:assign
#   Logs:
#     - logs:read
#   ... (etc)

# Create new role
node cli.js roles:create \
  --name project-manager \
  --description "Project managers with limited access"

# Assign role to user
node cli.js roles:assign <username> <role-name>
node cli.js roles:assign johndoe administrator

# Output:
# Role 'administrator' assigned to user 'johndoe'

# Remove role from user
node cli.js roles:remove <username> <role-name>
node cli.js roles:remove johndoe viewer

# Grant capability to role
node cli.js roles:grant-capability <role-name> <capability>
node cli.js roles:grant-capability project-manager websites:read

# Revoke capability from role
node cli.js roles:revoke-capability <role-name> <capability>
node cli.js roles:revoke-capability project-manager users:write

# Delete role (only non-system roles)
node cli.js roles:delete <role-name> --confirm
node cli.js roles:delete custom-role --confirm

# Output:
# WARNING: This will remove the role from all users.
# Type the role name to confirm: custom-role
# Role 'custom-role' has been deleted.
# 3 users have had this role removed.
```

### Capability Management

```bash
# List all capabilities
node cli.js capabilities:list

# Output:
# Category      Capability              Description                    Dangerous
# logs          logs:read               View log records               no
# logs          logs:write              Submit log records             no
# logs          logs:delete             Delete log records             yes
# users         users:read              View user list                 no
# users         users:write             Create/update users            no
# users         users:delete            Delete users                   yes
# ... (etc)

# List capabilities by category
node cli.js capabilities:list --category users

# List capabilities for a role
node cli.js capabilities:list --role administrator
```

### Security Analysis (v1.6.0+)

```bash
# Create event type
node cli.js event-types:add \
  --name malicious-bot \
  --severity medium \
  --description "Known bad bots and scrapers"

# List event types
node cli.js event-types:list

# Output:
# ID  Name                Severity  Rules  Events (24h)
# 1   malicious-bot       medium    5      234
# 2   vulnerability-probe high      8      45
# 3   protocol-abuse      medium    3      12

# Delete event type (only if no rules/events reference it)
node cli.js event-types:delete <name>

# Add security rule
node cli.js rules:add

# Interactive prompts:
# Rule name: backdoor-shells
# Event type: [dropdown of event types]
# Log type: (1) access, (2) error: 1
# Trigger pattern (regex): \b(shell|backdoor)\.php
# Output pattern (optional): "remote_ip":\s*"([^"]+)"
# Description: Backdoor shell upload attempts
# Enabled: (Y/n): Y
#
# Security rule created successfully!

# List security rules
node cli.js rules:list

# Output:
# ID  Name              Event Type          Log Type  Source      Enabled  Matches (24h)
# 1   backdoor-shells   vulnerability-probe access    user        yes      12
# 2   bad-bots          malicious-bot       access    user        yes      234
# 3   apache-shellshock vulnerability-probe access    fail2ban    yes      0

# Import fail2ban filter
node cli.js rules:import-fail2ban --filter apache-shellshock

# Interactive prompt:
# Select event type for 'apache-shellshock':
# 1) malicious-bot
# 2) vulnerability-probe
# 3) protocol-abuse
# Choice: 2
#
# Imported fail2ban filter 'apache-shellshock'
# Rule ID: 4
# Jail name: apache-shellshock
# Pattern: \(\) \{

# Import all fail2ban filters (with mappings file)
node cli.js rules:import-fail2ban --all --mappings config/fail2ban-mappings.json

# Enable/disable rule
node cli.js rules:enable <rule-name>
node cli.js rules:disable <rule-name>

# Delete rule
node cli.js rules:delete <rule-name> --confirm

# Run security analysis (manual)
node cli.js security:analyze

# Output:
# Starting security analysis...
# Processing batch 1 (10000 records)
# Processing batch 2 (10000 records)
# Processing batch 3 (5432 records)
#
# Analysis complete!
# Records scanned: 25432
# Events detected: 47
# Processing time: 12.3 seconds
#
# Events by type:
#   malicious-bot: 23
#   vulnerability-probe: 18
#   protocol-abuse: 6

# Run with dry-run (doesn't create events)
node cli.js security:analyze --dry-run --limit 1000

# Query security events
node cli.js events:query \
  --event-type vulnerability-probe \
  --since 2025-12-01 \
  --limit 50

# Output:
# ID      Timestamp             Event Type          Website      Host          IP
# 1234    2025-12-13 14:23:01   vulnerability-probe example.com  hhw1.head...  5.6.7.8
# 1235    2025-12-13 14:22:45   vulnerability-probe foobar.com   hhw2.head...  9.10.11.12

# Reset processing watermark (re-analyze all logs)
node cli.js watermark:reset --confirm

# Output:
# WARNING: This will re-analyze all log records.
# Type 'RESET' to confirm: RESET
# Processing watermark has been reset.
# Next analysis will start from log record #1.
```

### Host & IP Management

```bash
# List hosts
node cli.js hosts:list

# Output:
# ID  Hostname                    IPs  Log Count  Last Seen
# 1   localhost                   2    0          -
# 2   hhw1.headwall-hosting.com   3    1234567    2025-12-13 14:23:01
# 3   hhw6.headwall-hosting.com   7    987654     2025-12-13 14:22:50

# Show host with IPs
node cli.js hosts:show <hostname>
node cli.js hosts:show hhw6.headwall-hosting.com

# Output:
# Host: hhw6.headwall-hosting.com
# ==============================
# ID: 3
# Description: Production web server 6
# Log Count: 987654
# Last Seen: 2025-12-13 14:22:50
#
# IP Addresses (excluded from security analysis):
#   139.28.16.202 (IPv4) - Public IPv4
#   139.28.16.203 (IPv4) - Public IPv4
#   139.28.16.204 (IPv4) - Public IPv4
#   139.28.16.205 (IPv4) - Public IPv4
#   139.28.16.206 (IPv4) - Public IPv4
#   10.0.0.16 (IPv4) - Private IPv4
#   fd86:ea04:1111::16 (IPv6) - Private IPv6

# Add IP to host
node cli.js hosts:add-ip <hostname> <ip> --description "Description"
node cli.js hosts:add-ip hhw6.headwall-hosting.com 139.28.16.207 --description "New public IP"

# Output:
# IP 139.28.16.207 added to host 'hhw6.headwall-hosting.com'
# This IP will be excluded from security analysis.

# Remove IP from host
node cli.js hosts:remove-ip <hostname> <ip>
node cli.js hosts:remove-ip hhw6.headwall-hosting.com 139.28.16.207

# Output:
# IP 139.28.16.207 removed from host 'hhw6.headwall-hosting.com'
```

### Audit Log

```bash
# Query audit log
node cli.js audit:query

# Output (last 20 entries):
# Timestamp             User    Action            Resource        IP              Details
# 2025-12-13 14:23:01   admin   user.create       user #5         192.168.1.100   Created user 'johndoe'
# 2025-12-13 14:20:15   admin   role.assign       user #5         192.168.1.100   Assigned role 'viewer'
# 2025-12-13 14:15:30   admin   api-key.create    api_key #7      192.168.1.100   Created API key for johndoe
# 2025-12-13 14:10:00   admin   website.delete    website #12     192.168.1.100   Deleted website 'old-site.com'

# Filter by user
node cli.js audit:query --user admin

# Filter by action
node cli.js audit:query --action user.delete

# Filter by date range
node cli.js audit:query --since 2025-12-01 --until 2025-12-13

# Export to JSON
node cli.js audit:query --since 2025-12-01 --format json > audit-december.json
```

### System Management

```bash
# Show system info
node cli.js system:info

# Output:
# Headlog System Information
# ==========================
# Version: 2.0.0
# Node.js: v18.17.0
# Database: MariaDB 10.11.2
# Uptime: 5 days, 3 hours, 12 minutes
#
# Feature Flags:
#   UI_ENABLED: true
#   MODEL_API_ENABLED: true
#
# Statistics:
#   Total log records: 1,941,743
#   Websites: 132
#   Hosts: 6
#   Users: 8
#   Active sessions: 3
#
# Storage:
#   Database size: 2.3 GB
#   Oldest log: 2025-11-01 00:00:00
#   Newest log: 2025-12-13 14:23:01

# Test database connection
node cli.js system:test-db

# Output:
# Testing database connection...
# ✓ Connection successful
# ✓ All tables exist
# ✓ Indexes healthy
# Database: headlog_dev
# Host: localhost:3306
# Response time: 3ms

# Run housekeeping tasks manually
node cli.js system:housekeeping

# Output:
# Running housekeeping tasks...
# ✓ Purged 12,345 expired log records
# ✓ Purged 23 inactive websites
# ✓ Cleaned up 5 expired sessions
# ✓ Archived 234 security events
# Housekeeping complete.

# Generate random password (for manual user creation)
node cli.js system:generate-password

# Output:
# Kp9#mL2$vX4@nQ7!wR5
```

## Command Syntax Conventions

### Naming Convention

- Format: `<resource>:<action>`
- Examples: `users:create`, `roles:list`, `audit:query`
- Plural resource names (users, roles, keys, not user, role, key)
- Imperative action verbs (create, delete, show, not creating, deleting, showing)

### Arguments and Flags

- Required arguments: `<argument>`
- Optional arguments: `[argument]`
- Flags: `--flag-name value` or `--flag-name` (boolean)
- Short flags (single letter): `-f` (future enhancement)

### Confirmation Prompts

- Dangerous operations require `--confirm` flag
- Extra confirmation for destructive actions (type resource name)
- Examples: delete user, delete role, reset watermark

### Output Formatting

- Tables for list commands (aligned columns)
- Detailed output for show commands (labeled fields)
- Success messages for mutations (green text, if terminal supports)
- Error messages to stderr (red text, if terminal supports)
- JSON output option: `--format json` (for scripting)

## Error Handling

### Exit Codes

- `0` - Success
- `1` - General error (invalid syntax, missing arguments)
- `2` - Database error
- `3` - Authentication/authorization error
- `4` - Resource not found
- `5` - Validation error (weak password, invalid email, etc.)

### Error Messages

```bash
# Example: Invalid command
node cli.js invalid:command
# Error: Unknown command 'invalid:command'
# Run 'node cli.js --help' for available commands.
# Exit code: 1

# Example: Resource not found
node cli.js users:show nonexistent
# Error: User 'nonexistent' not found.
# Exit code: 4

# Example: Validation error
node cli.js users:create-admin --username a --password short
# Error: Validation failed:
#   - Username must be at least 3 characters
#   - Password must be at least 12 characters
# Exit code: 5
```

## Implementation Notes

### Libraries

- **Commander.js** - CLI framework (already in use)
- **Inquirer.js** - Interactive prompts (for password input, confirmations)
- **Chalk** - Terminal colors (optional, for better UX)
- **cli-table3** - Pretty tables (for list commands)

### Password Input

- Use Inquirer's password type (hides input)
- Validate password strength
- Confirm password (must match)
- Never echo password to terminal

### Non-Interactive Mode

- All commands support `--non-interactive` flag
- Required arguments must be provided via flags
- Fails if interactive input required but not available
- Useful for scripts and automation

### Help Text

```bash
# Global help
node cli.js --help

# Command-specific help
node cli.js users:create --help

# Output:
# Usage: node cli.js users:create [options]
#
# Create a new user account
#
# Options:
#   --username <string>    Username (required)
#   --email <email>        Email address (required)
#   --password <string>    Password (min 12 chars, required)
#   --role <role>          Assign role (optional, default: viewer)
#   --non-interactive      Don't prompt for missing values
#   -h, --help             Display help
```

## Future Enhancements

### Scripting Support

- Exit codes for all operations
- JSON output for easy parsing
- Quiet mode (suppress progress messages)
- Batch operations (create multiple users from CSV)

### Remote Administration

- SSH tunnel support (connect to remote database)
- Configuration profiles (dev, staging, production)
- Multi-tenancy (select tenant/instance)

### Advanced Features

- Database backup/restore commands
- Migration runner (manual migration execution)
- Performance analysis (slow query detection)
- Health monitoring (alert if issues detected)

---

**Document Status:** Requirements phase - ready for implementation

**Last Updated:** 2025-12-13

**Related Documents:**

- [dev-notes/authentication-authorization.md](authentication-authorization.md) - Auth system requirements
- [dev-notes/web-ui.md](web-ui.md) - Web UI requirements
- [dev-notes/batch-log-processing.md](batch-log-processing.md) - Security analysis requirements
