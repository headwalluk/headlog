# CLI Reference

The Headlog CLI provides command-line tools for managing API keys, user accounts, roles, capabilities, and database migrations. All commands are run using the headlog executable:

```bash
bin/headlog <command> [options]
```

---

## Table of Contents

- [API Key Management](#api-key-management)
  - [keys:create](#keyscreate)
  - [keys:list](#keyslist)
  - [keys:activate](#keysactivate)
  - [keys:deactivate](#keysdeactivate)
  - [keys:delete](#keysdelete)
  - [keys:stats](#keysstats)
- [User Management](#user-management)
  - [users:create-admin](#userscreate-admin)
  - [users:list](#userslist)
  - [users:reset-password](#usersreset-password)
- [Role Management](#role-management)
  - [roles:list](#roleslist)
  - [roles:show](#rolesshow)
  - [roles:assign](#rolesassign)
  - [roles:remove](#rolesremove)
- [Capability Management](#capability-management)
  - [capabilities:list](#capabilitieslist)
- [Database Migrations](#database-migrations)
  - [schema:migrate](#schemamigrate)
  - [schema:status](#schemastatus)
  - [schema:history](#schemahistory)

---

## API Key Management

API keys authenticate external systems (like Fluent Bit agents) that send logs to Headlog. Keys are hashed with bcrypt before storage and cannot be retrieved after creation.

### keys:create

Generate and store a new API key.

**Usage:**

```bash
bin/headlog keys:create [options]
```

**Options:**

- `-d, --description <description>` - Description for the API key (optional)

**Example:**

```bash
bin/headlog keys:create --description "Production web servers"
```

**Output:**

```
✓ API Key created successfully!

  ID:          1
  Key:         headlog_5d8f7a9b2c4e1f6a8d3b9c7e4f1a2d5b
  Description: Production web servers
  Status:      Active

⚠️  Save this key securely - it cannot be retrieved again!
```

**Notes:**

- Keys use the format `headlog_<32-character-hex>`
- The plaintext key is shown only once at creation
- Keys are stored as bcrypt hashes (10 rounds)
- Used for Bearer token authentication: `Authorization: Bearer headlog_...`

---

### keys:list

List all API keys (active by default).

**Usage:**

```bash
bin/headlog keys:list [options]
```

**Options:**

- `--show-inactive` - Include deactivated keys in the list

**Examples:**

```bash
# Show only active keys
bin/headlog keys:list

# Show all keys (including inactive)
bin/headlog keys:list --show-inactive
```

**Output:**

```
Found 3 API key(s):

  ID  | Status   | Description                | Last Used           | Created
  ----------------------------------------------------------------------------------------
  3   | Active   | Production web servers     | 2025-12-14 10:30:45 | 2025-12-14
  2   | Inactive | Development testing        | 2025-12-13 14:20:10 | 2025-12-13
  1   | Active   | Fluent Bit agents          | Never               | 2025-12-10
```

**Notes:**

- Keys are ordered by creation date (newest first)
- `Last Used` tracks the most recent authentication with the key
- Description is truncated to 25 characters in the list view

---

### keys:activate

Reactivate a previously deactivated API key.

**Usage:**

```bash
bin/headlog keys:activate <keyId>
```

**Arguments:**

- `<keyId>` - Numeric ID of the API key to activate

**Example:**

```bash
bin/headlog keys:activate 2
```

**Output:**

```
✓ API key 2 activated successfully.
```

**Notes:**

- Reactivation is immediate (no grace period)
- Key retains its original creation date and usage statistics
- Can be used to restore accidentally deactivated keys

---

### keys:deactivate

Deactivate an API key without permanently deleting it.

**Usage:**

```bash
bin/headlog keys:deactivate <keyId>
```

**Arguments:**

- `<keyId>` - Numeric ID of the API key to deactivate

**Example:**

```bash
bin/headlog keys:deactivate 2
```

**Output:**

```
✓ API key 2 deactivated successfully.
```

**Notes:**

- Deactivated keys immediately fail authentication
- Key data is preserved (can be reactivated with `keys:activate`)
- Safer than deletion for temporary key suspension
- Does not affect usage history or last_used timestamp

---

### keys:delete

Permanently delete an API key from the database.

**Usage:**

```bash
bin/headlog keys:delete <keyId>
```

**Arguments:**

- `<keyId>` - Numeric ID of the API key to delete

**Example:**

```bash
bin/headlog keys:delete 2
```

**Output:**

```
✓ API key 2 deleted permanently.
```

**Notes:**

- Deletion is immediate and irreversible
- Use `keys:deactivate` instead for temporary suspension
- No confirmation prompt (use with caution)

---

### keys:stats

Show detailed statistics and information for a specific API key.

**Usage:**

```bash
bin/headlog keys:stats <keyId>
```

**Arguments:**

- `<keyId>` - Numeric ID of the API key

**Example:**

```bash
bin/headlog keys:stats 1
```

**Output:**

```
API Key Statistics:

  ID:          1
  Key:         ...2c4e1f6a
  Description: Production web servers
  Status:      Active
  Created:     2025-12-14T10:00:00.000Z
  Last Used:   2025-12-14T12:30:45.000Z
```

**Notes:**

- Only the last 8 characters of the hashed key are shown
- Useful for verifying key activity before deactivation/deletion
- `Last Used` timestamp updated on each successful authentication

---

## User Management

User accounts provide web UI access and role-based permissions. All users require authentication through the web interface.

### users:create-admin

Create a new superuser account (bootstrap command for initial setup).

**Usage:**

```bash
bin/headlog users:create-admin [options]
```

**Options:**

- `--username <username>` - Username (3+ characters, alphanumeric + underscore)
- `--email <email>` - Email address
- `--password <password>` - Password (use with caution - visible in shell history)
- `--non-interactive` - Skip prompts (requires all options)

**Examples:**

```bash
# Interactive mode (recommended)
bin/headlog users:create-admin

# Non-interactive mode
bin/headlog users:create-admin \
  --username admin \
  --email admin@example.com \
  --password "SecureP@ssw0rd!" \
  --non-interactive
```

**Interactive Prompts:**

```
🔐 Create Admin User

? Username: admin
? Email: admin@example.com
? Password: ********
? Confirm password: ********
```

**Output:**

```
✓ Admin user created successfully!

  ID:       1
  Username: admin
  Email:    admin@example.com
  Role:     Superuser
```

**Password Requirements:**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Notes:**

- Superusers bypass all role/capability checks
- Use for initial setup only (create regular users through web UI)
- Non-interactive mode logs password in shell history (not recommended)

---

### users:list

List all user accounts with status and login information.

**Usage:**

```bash
bin/headlog users:list [options]
```

**Options:**

- `--active-only` - Show only active users
- `--superuser-only` - Show only superuser accounts

**Examples:**

```bash
# List all users
bin/headlog users:list

# List only active users
bin/headlog users:list --active-only

# List only superusers
bin/headlog users:list --superuser-only
```

**Output:**

```
Total users: 3

┌────┬──────────┬────────────────────┬────────┬──────────┬────────────┬────────────┐
│ ID │ Username │ Email              │ Active │ Superuser│ Created    │ Last Login │
├────┼──────────┼────────────────────┼────────┼──────────┼────────────┼────────────┤
│ 1  │ admin    │ admin@example.com  │ ✓      │ ✓        │ 2025-12-10 │ 2025-12-14 │
│ 2  │ analyst  │ analyst@example.com│ ✓      │ ✗        │ 2025-12-11 │ 2025-12-13 │
│ 3  │ viewer   │ viewer@example.com │ ✗      │ ✗        │ 2025-12-12 │ Never      │
└────┴──────────┴────────────────────┴────────┴──────────┴────────────┴────────────┘
```

**Notes:**

- Users are ordered by creation date (newest first)
- Inactive users cannot log in to the web UI
- Last Login shows "Never" for accounts that haven't logged in

---

### users:reset-password

Reset a user's password (useful for account recovery).

**Usage:**

```bash
bin/headlog users:reset-password <user-id-or-username> [options]
```

**Arguments:**

- `<user-id-or-username>` - Numeric user ID or username

**Options:**

- `--password <password>` - New password (use with caution)
- `--non-interactive` - Skip prompts (requires --password)

**Examples:**

```bash
# Interactive mode (recommended)
bin/headlog users:reset-password admin

# By user ID
bin/headlog users:reset-password 1

# Non-interactive mode
bin/headlog users:reset-password admin \
  --password "NewSecureP@ss!" \
  --non-interactive
```

**Interactive Prompts:**

```
Resetting password for user: admin (admin@example.com)

? New password: ********
? Confirm password: ********
```

**Output:**

```
✓ Password reset successfully
```

**Notes:**

- Follows same password requirements as user creation
- Password hashed with bcrypt before storage
- User is not notified of password change
- Does not invalidate active sessions

---

## Role Management

Roles group capabilities and can be assigned to users for permission management. System roles are predefined and cannot be deleted.

### roles:list

List all roles in the system.

**Usage:**

```bash
bin/headlog roles:list [options]
```

**Options:**

- `--system-only` - Only show system (built-in) roles
- `--custom-only` - Only show custom (user-created) roles

**Examples:**

```bash
# List all roles
bin/headlog roles:list

# List only system roles
bin/headlog roles:list --system-only

# List only custom roles
bin/headlog roles:list --custom-only
```

**Output:**

```
┌────┬─────────────────────┬────────┬─────────────────────────────────────────────┐
│ ID │ Name                │ Type   │ Description                                 │
├────┼─────────────────────┼────────┼─────────────────────────────────────────────┤
│ 1  │ Administrator       │ System │ Full system access including user manage... │
│ 2  │ Analyst             │ System │ Can view and analyze logs, manage websit... │
│ 3  │ Viewer              │ System │ Read-only access to logs and dashboards     │
│ 4  │ Custom Operator     │ Custom │ Custom role for operations team             │
└────┴─────────────────────┴────────┴─────────────────────────────────────────────┘
```

**Notes:**

- System roles are created during initial migrations
- Custom roles can be created through the web UI
- Description is truncated to 50 characters in list view

---

### roles:show

Show detailed information about a specific role, including all assigned capabilities.

**Usage:**

```bash
bin/headlog roles:show <role-id-or-name>
```

**Arguments:**

- `<role-id-or-name>` - Numeric role ID or role name

**Examples:**

```bash
# By role ID
bin/headlog roles:show 1

# By role name
bin/headlog roles:show Administrator
```

**Output:**

```
=== Role Details ===

  ID:          1
  Name:        Administrator
  Description: Full system access including user management and configuration
  Type:        System Role
  Users:       2
  Created:     2025-12-10T08:00:00.000Z

=== Capabilities ===

  logs:
    - logs:view
    - logs:export

  security:
    - security:view_analysis
    - security:manage_threats [DANGEROUS]

  system:
    - system:manage_users [DANGEROUS]
    - system:manage_roles [DANGEROUS]
    - system:view_config

  websites:
    - websites:view
    - websites:manage
```

**Notes:**

- Capabilities are grouped by category for readability
- `[DANGEROUS]` flag indicates high-risk permissions
- User count shows how many users currently have this role
- Multiple users can have the same role

---

### roles:assign

Assign a role to a user account.

**Usage:**

```bash
bin/headlog roles:assign <user-id> <role-id-or-name> [options]
```

**Arguments:**

- `<user-id>` - Numeric user ID
- `<role-id-or-name>` - Numeric role ID or role name

**Options:**

- `--assigned-by <user-id>` - User ID making the assignment (for audit trail, default: 0)

**Examples:**

```bash
# Assign by role name
bin/headlog roles:assign 2 Analyst

# Assign by role ID
bin/headlog roles:assign 2 2

# With audit trail
bin/headlog roles:assign 2 Analyst --assigned-by 1
```

**Output:**

```
✓ Role 'Analyst' assigned to user 'john_doe'
```

**If role already assigned:**

```
⚠ User 'john_doe' already has role 'Analyst'
```

**Notes:**

- Users can have multiple roles (capabilities are additive)
- Assignment creates an audit log entry
- Superusers bypass role checks entirely
- Role changes take effect immediately (may require re-login)

---

### roles:remove

Remove a role from a user account.

**Usage:**

```bash
bin/headlog roles:remove <user-id> <role-id-or-name>
```

**Arguments:**

- `<user-id>` - Numeric user ID
- `<role-id-or-name>` - Numeric role ID or role name

**Examples:**

```bash
# Remove by role name
bin/headlog roles:remove 2 Analyst

# Remove by role ID
bin/headlog roles:remove 2 2
```

**Output:**

```
✓ Role 'Analyst' removed from user 'john_doe'
```

**If role not assigned:**

```
⚠ User 'john_doe' did not have role 'Analyst'
```

**Notes:**

- Removing a role immediately revokes its capabilities
- Users must have at least one role to access the UI
- Cannot remove roles from superusers (superuser flag overrides roles)
- Removal creates an audit log entry

---

## Capability Management

Capabilities are individual permissions that control specific system actions. They are typically managed through roles rather than assigned directly to users.

### capabilities:list

List all available capabilities in the system.

**Usage:**

```bash
bin/headlog capabilities:list [options]
```

**Options:**

- `--category <category>` - Filter by category (e.g., logs, system, security)
- `--dangerous-only` - Only show capabilities marked as dangerous

**Examples:**

```bash
# List all capabilities
bin/headlog capabilities:list

# List only log-related capabilities
bin/headlog capabilities:list --category logs

# List only dangerous capabilities
bin/headlog capabilities:list --dangerous-only
```

**Output:**

```
┌────┬─────────────────────┬─────────┬───────────┬──────────────────────────────────────┐
│ ID │ Name                │ Category│ Dangerous │ Description                          │
├────┼─────────────────────┼─────────┼───────────┼──────────────────────────────────────┤
│ 1  │ logs:view           │ logs    │ No        │ View log records and search logs     │
│ 2  │ logs:export         │ logs    │ No        │ Export logs to external formats      │
│ 3  │ websites:view       │ websites│ No        │ View website list and details        │
│ 4  │ websites:manage     │ websites│ No        │ Create and modify website records    │
│ 5  │ system:manage_users │ system  │ Yes       │ Create, modify, and delete user a... │
│ 6  │ system:manage_roles │ system  │ Yes       │ Manage roles and capability assig... │
└────┴─────────────────────┴─────────┴───────────┴──────────────────────────────────────┘
```

**Capability Categories:**

- **logs** - Log viewing and export functionality
- **websites** - Website management (CRUD operations)
- **hosts** - Host management (CRUD operations)
- **roles** - Role management (CRUD operations)
- **security** - Security analysis and threat management
- **system** - User management and system configuration

**Dangerous Capabilities:**

Capabilities marked as dangerous grant high-risk permissions:

- User account management
- Role and permission changes
- System configuration access
- Security policy modifications

**Notes:**

- Capabilities are defined in system migrations
- Custom capabilities can be added through database migrations
- Superusers bypass all capability checks
- Description is truncated to 40 characters in list view

---

## Database Migrations

Database migrations manage schema changes and data updates across versions. Migrations run in order and are tracked to prevent duplicate execution.

### schema:migrate

Run all pending database migrations.

**Usage:**

```bash
bin/headlog schema:migrate
```

**Output:**

```
🔄 Running database migrations...

  Applying migration 1.5.0-01 - upstream-sync-tables.sql
  ✓ Migration 1.5.0-01 completed successfully

  Applying migration 1.8.0-01 - users-roles-capabilities.sql
  ✓ Migration 1.8.0-01 completed successfully

✓ Migrations completed successfully!
  Executed: 2
  Skipped:  0
```

**If already up to date:**

```
🔄 Running database migrations...

✓ Migrations completed successfully!
  Executed: 0
  Skipped:  5
```

**On failure:**

```
🔄 Running database migrations...

  Applying migration 1.8.0-01 - users-roles-capabilities.sql
  ✗ Migration 1.8.0-01 failed: Table 'users' already exists

✗ Migration execution failed!
  Executed: 0
  Failed:   1
```

**Notes:**

- Migrations run in version order (semver-sorted)
- Failed migrations are logged and halt execution
- Re-running after failure skips successful migrations
- Always backup database before running migrations
- `AUTO_RUN_MIGRATIONS_DISABLED=true` in `.env` disables automatic migration on server start

---

### schema:status

Show current migration status without executing any migrations.

**Usage:**

```bash
bin/headlog schema:status
```

**Output:**

```
📊 Database Migration Status:

  Project Version:       1.8.2
  Total Migrations:      5
  Applicable Migrations: 5
  Executed Migrations:   3
  Pending Migrations:    2

  Pending:
    - 1.8.0-02: Add website_roles and host_roles tables
    - 1.8.0-03: Add security_analysis tables
```

**If up to date:**

```
📊 Database Migration Status:

  Project Version:       1.8.2
  Total Migrations:      5
  Applicable Migrations: 5
  Executed Migrations:   5
  Pending Migrations:    0

  ✓ All migrations up to date!
```

**Migration Terminology:**

- **Total Migrations** - All migration files in `schema/` directory
- **Applicable Migrations** - Migrations for versions ≤ current project version
- **Executed Migrations** - Migrations successfully run (tracked in `migrations` table)
- **Pending Migrations** - Applicable migrations not yet executed

**Notes:**

- Safe to run at any time (read-only operation)
- Use before `schema:migrate` to preview changes
- Checks version compatibility before suggesting migrations

---

### schema:history

Show complete history of executed migrations.

**Usage:**

```bash
bin/headlog schema:history [options]
```

**Options:**

- `--failed` - Show only failed migration attempts

**Examples:**

```bash
# Show all executed migrations
bin/headlog schema:history

# Show only failed migrations
bin/headlog schema:history --failed
```

**Output:**

```
📋 Migration History (5 entries):

  Version | Filename                          | Status   | Executed At
  -------------------------------------------------------------------------------------
  1.8.0-03| 1.8.0-03-security-analysis.sql    | ✓ Pass   | 2025-12-14 10:30:45
  1.8.0-02| 1.8.0-02-website-host-roles.sql   | ✓ Pass   | 2025-12-14 10:30:42
  1.8.0-01| 1.8.0-01-users-roles-capabilit... | ✓ Pass   | 2025-12-14 10:30:38
  1.5.0-01| 1.5.0-01-upstream-sync-tables.sql | ✓ Pass   | 2025-12-08 14:20:15
  1.3.0-01| 1.3.0-01-binary-uuids.sql         | ✓ Pass   | 2025-12-08 09:15:32
```

**With failures:**

```
📋 Migration History (2 entries):

  Version | Filename                          | Status   | Executed At
  -------------------------------------------------------------------------------------
  1.8.0-01| 1.8.0-01-users-roles-capabilit... | ✗ Failed | 2025-12-14 10:25:18
          Error: Table 'users' already exists
  1.5.0-01| 1.5.0-01-upstream-sync-tables.sql | ✓ Pass   | 2025-12-08 14:20:15
```

**Notes:**

- History is stored in `migrations` table
- Failed migrations are retried on next `schema:migrate` run
- Execution order preserved (most recent first)
- Error messages truncated to 80 characters

---

## Common Workflows

### Initial Setup

```bash
# 1. Create admin account (first user)
bin/headlog users:create-admin

# 2. Generate API key for Fluent Bit
bin/headlog keys:create --description "Web server log ingestion"

# 3. Check database migration status
bin/headlog schema:status

# 4. Run pending migrations if needed
bin/headlog schema:migrate
```

### User Onboarding

```bash
# 1. Create user through web UI (not available via CLI yet)

# 2. Assign appropriate role
bin/headlog roles:assign <user-id> Analyst

# 3. Verify role assignment
bin/headlog roles:show Analyst
```

### API Key Rotation

```bash
# 1. Create new API key
bin/headlog keys:create --description "Production - New"

# 2. Update Fluent Bit configuration with new key

# 3. Test new key with test log ingestion

# 4. Deactivate old key
bin/headlog keys:deactivate <old-key-id>

# 5. After verification period, delete old key
bin/headlog keys:delete <old-key-id>
```

### Troubleshooting

```bash
# Check if user account is active
bin/headlog users:list

# View user's assigned roles and capabilities
bin/headlog roles:show <role-name>

# Verify API key is active and not expired
bin/headlog keys:stats <key-id>

# Check migration status if features not working
bin/headlog schema:status
```

---

## Exit Codes

All CLI commands follow standard Unix exit code conventions:

- `0` - Success
- `1` - Error (check stderr output for details)

Use exit codes in scripts:

```bash
#!/bin/bash
bin/headlog schema:migrate
if [ $? -eq 0 ]; then
  echo "Migrations successful, starting server..."
  npm start
else
  echo "Migration failed, aborting startup"
  exit 1
fi
```

---

## Security Considerations

### Password Safety

- **Avoid** `--password` flag in production (logged in shell history)
- Use interactive mode for sensitive operations
- Passwords hashed with bcrypt (cost factor 10) before storage
- Enforce strong password requirements:
  - Minimum 8 characters
  - Mixed case letters
  - Numbers and special characters

### API Key Safety

- Keys shown only once at creation
- Store keys securely (environment variables or secrets manager)
- Rotate keys periodically
- Use descriptive names to track key usage
- Deactivate rather than delete for audit trail

### Superuser Accounts

- Create only one superuser for initial setup
- Use role-based access for all other users
- Superusers bypass all permission checks
- Cannot restrict superuser capabilities

### Audit Trail

- Role assignments tracked with `assigned_by` user ID
- API key usage logged with last_used timestamps
- Migration history preserved in `migrations` table
- User login activity tracked in `last_login_at`

---

## Related Documentation

- **[Installation Guide](installation.md)** - Initial server setup and configuration
- **[Quick Start Guide](quickstart.md)** - Get running in 5 minutes
- **[API Reference](api-reference.md)** - HTTP API endpoint documentation *(coming soon)*

---

## Support

For issues or questions:

- **GitHub Issues:** [headwalluk/headlog/issues](https://github.com/headwalluk/headlog/issues)
- **Documentation:** [docs/](../docs/)
- **Development Notes:** [dev-notes/](../dev-notes/)
