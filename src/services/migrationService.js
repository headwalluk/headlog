/**
 * Database migration service
 * Handles schema versioning and migration execution
 */

const fs = require('fs').promises;
const path = require('path');
const { getPool } = require('../config/database');
const config = require('../config');

/**
 * Ensure schema_migrations table exists
 */
async function ensureMigrationsTable() {
  const pool = getPool();

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      version VARCHAR(20) NOT NULL UNIQUE,
      filename VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      
      INDEX idx_version (version),
      INDEX idx_executed_at (executed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  await pool.query(createTableSQL);
}

/**
 * Get all executed migrations from database
 * @returns {Promise<Array>} Array of migration records
 */
async function getExecutedMigrations() {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT version, filename, executed_at, success, error_message FROM schema_migrations ORDER BY version'
  );
  return rows;
}

/**
 * Record migration execution result
 * @param {string} version - Semver version
 * @param {string} filename - SQL filename
 * @param {boolean} success - Whether execution succeeded
 * @param {string|null} errorMessage - Error details if failed
 */
async function recordMigration(version, filename, success, errorMessage = null) {
  const pool = getPool();
  await pool.query(
    'INSERT INTO schema_migrations (version, filename, success, error_message) VALUES (?, ?, ?, ?)',
    [version, filename, success, errorMessage]
  );
}

/**
 * Parse migration filename to extract version and description
 * @param {string} filename - e.g., "0.1.0-initial-schema.sql"
 * @returns {Object|null} { version, description } or null if invalid
 */
function parseMigrationFilename(filename) {
  const match = filename.match(/^(\d+\.\d+\.\d+)-(.+)\.sql$/);
  if (!match) return null;

  return {
    version: match[1],
    description: match[2]
  };
}

/**
 * Compare two semver version strings
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] < parts2[i]) return -1;
    if (parts1[i] > parts2[i]) return 1;
  }

  return 0;
}

/**
 * Get all migration files from schema directory
 * @returns {Promise<Array>} Sorted array of { version, filename, filepath, description }
 */
async function getMigrationFiles() {
  const schemaDir = path.join(process.cwd(), config.migrations.directory);

  try {
    const files = await fs.readdir(schemaDir);

    const migrations = files
      .filter(f => f.endsWith('.sql'))
      .map(filename => {
        const parsed = parseMigrationFilename(filename);
        if (!parsed) return null;

        return {
          version: parsed.version,
          filename,
          filepath: path.join(schemaDir, filename),
          description: parsed.description
        };
      })
      .filter(m => m !== null);

    // Sort by version
    migrations.sort((a, b) => compareVersions(a.version, b.version));

    return migrations;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Schema directory doesn't exist yet
      return [];
    }
    throw error;
  }
}

/**
 * Get current project version from package.json
 * @returns {string} Semver version
 */
function getProjectVersion() {
  const packageJson = require(path.join(process.cwd(), 'package.json'));
  return packageJson.version;
}

/**
 * Split SQL content into individual statements
 * Handles comments and multi-line statements properly
 * @param {string} sql - SQL content
 * @returns {Array<string>} Array of SQL statements
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inString = false;
  let stringChar = null;
  let inComment = false;
  let inMultiLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Handle multi-line comments /* ... */
    if (!inString && char === '/' && nextChar === '*') {
      inMultiLineComment = true;
      i++; // Skip next char
      continue;
    }
    if (inMultiLineComment && char === '*' && nextChar === '/') {
      inMultiLineComment = false;
      i++; // Skip next char
      continue;
    }
    if (inMultiLineComment) continue;

    // Handle single-line comments --
    if (!inString && char === '-' && nextChar === '-') {
      inComment = true;
      i++; // Skip next char
      continue;
    }
    if (inComment && char === '\n') {
      inComment = false;
      continue;
    }
    if (inComment) continue;

    // Handle strings
    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      currentStatement += char;
      continue;
    }
    if (inString && char === stringChar && sql[i - 1] !== '\\') {
      inString = false;
      stringChar = null;
      currentStatement += char;
      continue;
    }

    // Handle statement terminator
    if (!inString && char === ';') {
      currentStatement += char;
      const trimmed = currentStatement.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      currentStatement = '';
      continue;
    }

    currentStatement += char;
  }

  // Add last statement if it doesn't end with semicolon
  const trimmed = currentStatement.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements.filter(s => s.length > 0);
}

/**
 * Execute a single migration file
 * @param {Object} migration - Migration metadata
 * @param {Object} logger - Logger instance
 * @returns {Promise<boolean>} Success status
 */
async function executeMigration(migration, logger) {
  const pool = getPool();
  let connection;

  try {
    logger.info(`Executing migration ${migration.version}: ${migration.description}`);

    // Read SQL file
    const sqlContent = await fs.readFile(migration.filepath, 'utf8');

    // Split into individual statements
    const statements = splitSQLStatements(sqlContent);
    logger.info(`  Executing ${statements.length} SQL statements...`);

    // Get dedicated connection
    connection = await pool.getConnection();

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await connection.query(statement);
      } catch (error) {
        logger.error(`  Failed at statement ${i + 1}/${statements.length}`);
        logger.error(`  Statement preview: ${statement.substring(0, 100)}...`);
        logger.error(`  Error: ${error.message}`);
        throw error;
      }
    }

    // Record success
    await recordMigration(migration.version, migration.filename, true);

    logger.info(`✓ Migration ${migration.version} completed successfully`);
    return true;
  } catch (error) {
    logger.error(`✗ Migration ${migration.version} failed:`, error.message);

    // Record failure
    try {
      await recordMigration(migration.version, migration.filename, false, error.message);
    } catch (recordError) {
      logger.error('Failed to record migration failure:', recordError.message);
    }

    return false;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Run pending migrations
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} { success, executed, failed, skipped }
 */
async function runMigrations(logger) {
  try {
    // Ensure tracking table exists
    await ensureMigrationsTable();

    // Get current project version
    const projectVersion = getProjectVersion();
    logger.info(`Current project version: ${projectVersion}`);

    // Get all migration files
    const allMigrations = await getMigrationFiles();

    if (allMigrations.length === 0) {
      logger.info('No migration files found in schema/ directory');
      return { success: true, executed: 0, failed: 0, skipped: 0 };
    }

    // Filter migrations <= project version
    const applicableMigrations = allMigrations.filter(
      m => compareVersions(m.version, projectVersion) <= 0
    );

    logger.info(
      `Found ${applicableMigrations.length} applicable migrations (of ${allMigrations.length} total)`
    );

    // Get already executed migrations
    const executedMigrations = await getExecutedMigrations();
    const executedVersions = new Set(executedMigrations.filter(m => m.success).map(m => m.version));

    // Find pending migrations
    const pendingMigrations = applicableMigrations.filter(m => !executedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      logger.info('All migrations up to date');
      return { success: true, executed: 0, failed: 0, skipped: 0 };
    }

    logger.info(`Running ${pendingMigrations.length} pending migrations...`);

    // Execute each pending migration
    let executed = 0;
    let failed = 0;

    for (const migration of pendingMigrations) {
      const success = await executeMigration(migration, logger);

      if (success) {
        executed++;
      } else {
        failed++;
        // Stop on first failure
        logger.error('Migration failed. Stopping execution.');
        break;
      }
    }

    const result = {
      success: failed === 0,
      executed,
      failed,
      skipped: applicableMigrations.length - pendingMigrations.length
    };

    if (result.success) {
      logger.info(`✓ All migrations completed. Executed: ${executed}, Skipped: ${result.skipped}`);
    } else {
      logger.error(`✗ Migration execution failed. Executed: ${executed}, Failed: ${failed}`);
    }

    return result;
  } catch (error) {
    logger.error('Migration system error:', error);
    throw error;
  }
}

/**
 * Get migration status summary
 * @returns {Promise<Object>} Status information
 */
async function getMigrationStatus() {
  await ensureMigrationsTable();

  const projectVersion = getProjectVersion();
  const allMigrations = await getMigrationFiles();
  const executedMigrations = await getExecutedMigrations();

  const applicableMigrations = allMigrations.filter(
    m => compareVersions(m.version, projectVersion) <= 0
  );

  const executedVersions = new Set(executedMigrations.filter(m => m.success).map(m => m.version));

  const pendingMigrations = applicableMigrations.filter(m => !executedVersions.has(m.version));

  return {
    projectVersion,
    totalMigrations: allMigrations.length,
    applicableMigrations: applicableMigrations.length,
    executedMigrations: executedMigrations.filter(m => m.success).length,
    pendingMigrations: pendingMigrations.length,
    pending: pendingMigrations,
    executed: executedMigrations
  };
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  getExecutedMigrations
};
