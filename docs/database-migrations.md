# Database Migrations

## Overview

Headlog uses a simple, forward-only migration system that aligns with project versioning. Migrations are plain SQL files executed in version order, with tracking to prevent re-execution.

**Key Principles:**

- ✅ Simple - No external migration libraries
- ✅ Forward-only - No rollback complexity
- ✅ Version-aligned - Migration files match project versions
- ✅ Idempotent - Safe to run multiple times (won't re-execute)
- ✅ Auditable - Full execution history in database

---

## Directory Structure

```
schema/
├── 0.1.0-initial-schema.sql          # Initial database structure
├── 0.2.0-add-log-analysis.sql        # Future: Add analysis features
├── 0.3.0-add-indexes.sql             # Future: Performance improvements
└── 1.0.0-production-ready.sql        # Future: Production hardening
```

**Naming Convention:** `{version}-{description}.sql`

- Version must be valid semver (e.g., `0.1.0`, `1.2.3`)
- Description uses kebab-case
- Files are executed in semver order

---

## Migration Tracking Table

The `schema_migrations` table tracks which migrations have been executed:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(20) NOT NULL UNIQUE,
  filename VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  INDEX idx_version (version),
  INDEX idx_executed_at (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Fields:**

- `version` - Semver version (e.g., `0.1.0`)
- `filename` - Original SQL file name
- `executed_at` - When migration ran
- `success` - Whether execution succeeded
- `error_message` - Error details if failed

---

## Migration Execution

### Running Migrations

```bash
# Run all pending migrations up to current version
node cli.js schema:migrate

# Check migration status
node cli.js schema:status

# Show migration history
node cli.js schema:history
```

### Execution Logic

1. **Create tracking table** if it doesn't exist
2. **Read schema/ directory** and sort files by semver
3. **Get current project version** from `package.json`
4. **Filter migrations** to only those ≤ current version
5. **Check tracking table** for already-executed migrations
6. **Execute pending migrations** in order:
   - Read SQL file
   - Execute as single transaction (where DDL allows)
   - Record result in `schema_migrations`
   - Stop on first error (unless `--continue-on-error` flag)
7. **Report results** (success/failure summary)

### SQL Execution Strategy

**Problem:** Simple `;` splitting fails with stored procedures, triggers, and multi-line statements.

**Solution:** Use MySQL's multi-statement capability:

```javascript
// Enable multi-statement queries
const connection = await pool.getConnection();
await connection.query({ sql: sqlContent, multipleStatements: true });
```

This handles:

- Stored procedures with internal semicolons
- Triggers and functions
- Multi-line statements
- Comments and formatting

### Transaction Safety

Most DDL statements in MySQL are **not transactional** (they cause implicit commit). However:

- Wrap each migration file in `START TRANSACTION` / `COMMIT` where possible
- On error, `ROLLBACK` will only affect DML (INSERT, UPDATE, DELETE)
- DDL changes (CREATE TABLE, ALTER TABLE) cannot be rolled back

**Best Practice:** Keep each migration file atomic and testable.

---

## Version Comparison

Uses semver parsing to ensure correct execution order:

```javascript
const semver = require('semver'); // Add to dependencies if needed
// Or implement simple version compare

// Example:
migrations.sort((a, b) => semver.compare(a.version, b.version));
```

**Only execute migrations where:**

```javascript
semver.lte(migration.version, projectVersion);
```

This prevents accidentally running future migrations during development.

---

## Writing Migrations

### Template

```sql
-- Migration: 0.2.0 - Add user preferences
-- Description: Adds user_preferences table for storing custom settings
-- Author: Your Name
-- Date: 2025-12-07

-- Create table
CREATE TABLE IF NOT EXISTS user_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  preference_key VARCHAR(100) NOT NULL,
  preference_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_user_pref (user_id, preference_key),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add sample data (optional)
-- INSERT INTO user_preferences (user_id, preference_key, preference_value)
-- VALUES (1, 'theme', 'dark');
```

### Guidelines

1. **Use `IF NOT EXISTS`** where possible for idempotency
2. **Add comments** explaining the purpose
3. **Keep migrations focused** - One logical change per file
4. **Test locally first** before committing
5. **Avoid destructive changes** - Prefer adding columns over dropping
6. **Handle existing data** - Use ALTER TABLE carefully
7. **Document breaking changes** in migration comments

### Example: Adding a Column

```sql
-- Add email notification preference to websites table
ALTER TABLE websites
ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT TRUE
AFTER admin_email;

-- Backfill existing records (if needed)
UPDATE websites SET notify_email = TRUE WHERE notify_email IS NULL;
```

### Example: Adding an Index

```sql
-- Add index for faster log queries by date range
ALTER TABLE log_records
ADD INDEX IF NOT EXISTS idx_timestamp_website (timestamp, website_id);
```

---

## Migration Workflow

### Development

1. **Create migration file** in `schema/` directory

   ```bash
   # Use next version number
   touch schema/0.2.0-add-feature-x.sql
   ```

2. **Write SQL statements** following guidelines above

3. **Test locally**

   ```bash
   # Run migration
   node cli.js schema:migrate

   # Verify result
   node cli.js schema:status
   ```

4. **Update package.json version** to match

   ```json
   {
     "version": "0.2.0"
   }
   ```

5. **Commit together**
   ```bash
   git add schema/0.2.0-add-feature-x.sql package.json
   git commit -m "feat: Add feature X with database migration"
   ```

### Deployment

1. **Pull latest code**

   ```bash
   git pull origin main
   ```

2. **Install dependencies** (if package.json changed)

   ```bash
   npm install
   ```

3. **Run migrations**

   ```bash
   node cli.js schema:migrate
   ```

4. **Verify**

   ```bash
   node cli.js schema:status
   ```

5. **Restart application**
   ```bash
   pm2 restart headlog
   ```

---

## Troubleshooting

### Migration Failed

**Check error message:**

```bash
node cli.js schema:history
# Look at last migration's error_message
```

**Fix and retry:**

1. Fix the SQL file
2. Delete the failed entry from `schema_migrations` (if it was partially executed)
   ```sql
   DELETE FROM schema_migrations WHERE version = '0.2.0';
   ```
3. Re-run migration
   ```bash
   node cli.js schema:migrate
   ```

### Migration Stuck

**Manual intervention:**

```sql
-- Check current state
SELECT * FROM schema_migrations ORDER BY executed_at DESC;

-- Mark migration as failed (to retry)
UPDATE schema_migrations
SET success = FALSE, error_message = 'Manual retry'
WHERE version = '0.2.0';

-- Or mark as successful (to skip)
UPDATE schema_migrations
SET success = TRUE
WHERE version = '0.2.0';
```

### Version Mismatch

**Problem:** Project version is 0.3.0 but last migration is 0.1.0

**Solution:** Migrations are intentional - only create them when schema changes. Not every version needs a migration.

---

## Future Enhancements

Potential improvements for Phase #2:

- **Dry-run mode** - Show what would be executed without running
- **Rollback support** - Add `down` migrations (if needed)
- **Backup before migrate** - Automatic mysqldump before changes
- **Migration generator** - CLI to scaffold new migration files
- **Parallel execution** - For independent migrations (advanced)
- **Environment-specific** - Different migrations for dev/staging/prod

---

## Why Not Use Migration Libraries?

**Common options we considered:**

| Library         | Why We Didn't Use It                           |
| --------------- | ---------------------------------------------- |
| Knex.js         | Requires adding query builder (we use raw SQL) |
| node-pg-migrate | PostgreSQL-focused, adds complexity            |
| db-migrate      | External config, more overhead than needed     |
| Flyway          | Java-based, not Node.js native                 |
| Sequelize       | Full ORM, conflicts with our raw SQL approach  |

**Our approach wins because:**

- Zero external dependencies for migrations
- Simple to understand and maintain
- Perfect for self-hosted projects
- Version-aligned with package.json
- Easy to debug (just SQL files)
- Transparent execution (no magic)

---

## Examples

### Initial Schema (0.1.0)

This was our first migration, creating the core tables. See `schema/0.1.0-initial-schema.sql`.

### Adding Analysis Tables (0.2.0 - Future)

```sql
-- Migration: 0.2.0 - Add log analysis tables
-- Description: Support for pattern detection and alerts

CREATE TABLE IF NOT EXISTS log_patterns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pattern_name VARCHAR(100) NOT NULL UNIQUE,
  pattern_regex TEXT NOT NULL,
  severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pattern_matches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pattern_id INT NOT NULL,
  log_record_id BIGINT NOT NULL,
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (pattern_id) REFERENCES log_patterns(id),
  FOREIGN KEY (log_record_id) REFERENCES log_records(id) ON DELETE CASCADE,
  INDEX idx_pattern_date (pattern_id, matched_at)
) ENGINE=InnoDB;
```

---

## Summary

Our migration system is:

- **Simple** - Plain SQL files, no frameworks
- **Reliable** - Tracked execution, error handling
- **Maintainable** - Clear version alignment
- **Flexible** - Easy to extend as project grows

For a self-hosted, single-team project like Headlog, this approach provides the right balance of simplicity and functionality.
