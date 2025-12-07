#!/usr/bin/env node

// Load config early (validates DB credentials)
require('./src/config');
const { Command } = require('commander');
const { getPool, initDatabase, closeDatabase } = require('./src/config/database');
const { generateApiKey } = require('./src/utils/generateApiKey');
const {
  runMigrations,
  getMigrationStatus,
  getExecutedMigrations
} = require('./src/services/migrationService');

const program = new Command();

program.name('headlog-cli').description('Headlog API key management CLI').version('0.1.0');

// ============================================================================
// keys:create - Generate and store a new API key
// ============================================================================
program
  .command('keys:create')
  .description('Generate and store a new API key')
  .option('-d, --description <description>', 'Description for the API key')
  .action(async options => {
    try {
      await initDatabase();
      const pool = getPool();

      const key = generateApiKey();
      const description = options.description || null;

      const [result] = await pool.query('INSERT INTO api_keys (`key`, description) VALUES (?, ?)', [
        key,
        description
      ]);

      console.log('\n✓ API Key created successfully!\n');
      console.log(`  ID:          ${result.insertId}`);
      console.log(`  Key:         ${key}`);
      console.log(`  Description: ${description || '(none)'}`);
      console.log('  Status:      Active\n');
      console.log('⚠️  Save this key securely - it cannot be retrieved again!\n');

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error creating API key:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// keys:list - List all API keys
// ============================================================================
program
  .command('keys:list')
  .description('List all API keys')
  .option('--show-inactive', 'Include inactive keys')
  .action(async options => {
    try {
      await initDatabase();
      const pool = getPool();

      let query = 'SELECT * FROM api_keys';
      if (!options.showInactive) {
        query += ' WHERE is_active = 1';
      }
      query += ' ORDER BY created_at DESC';

      const [rows] = await pool.query(query);

      if (rows.length === 0) {
        console.log('\nNo API keys found.\n');
      } else {
        console.log(`\n Found ${rows.length} API key(s):\n`);
        console.log(
          '  ID  | Key (last 8)  | Status   | Description                | Last Used           | Created'
        );
        console.log('  ' + '-'.repeat(110));

        rows.forEach(row => {
          const keyPreview = '...' + row.key.slice(-8);
          const status = row.is_active ? 'Active  ' : 'Inactive';
          const description = (row.description || '').substring(0, 25).padEnd(25);
          const lastUsed = row.last_used_at
            ? new Date(row.last_used_at).toISOString().substring(0, 19).replace('T', ' ')
            : 'Never'.padEnd(19);
          const created = new Date(row.created_at).toISOString().substring(0, 10);

          console.log(
            `  ${String(row.id).padEnd(3)} | ${keyPreview.padEnd(13)} | ${status} | ${description} | ${lastUsed} | ${created}`
          );
        });
        console.log('');
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error listing API keys:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// keys:deactivate - Deactivate an API key
// ============================================================================
program
  .command('keys:deactivate <keyId>')
  .description('Deactivate an API key')
  .action(async keyId => {
    try {
      await initDatabase();
      const pool = getPool();

      const [result] = await pool.query('UPDATE api_keys SET is_active = 0 WHERE id = ?', [keyId]);

      if (result.affectedRows === 0) {
        console.log(`\n✗ API key with ID ${keyId} not found.\n`);
      } else {
        console.log(`\n✓ API key ${keyId} deactivated successfully.\n`);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error deactivating API key:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// keys:activate - Reactivate an API key
// ============================================================================
program
  .command('keys:activate <keyId>')
  .description('Reactivate an API key')
  .action(async keyId => {
    try {
      await initDatabase();
      const pool = getPool();

      const [result] = await pool.query('UPDATE api_keys SET is_active = 1 WHERE id = ?', [keyId]);

      if (result.affectedRows === 0) {
        console.log(`\n✗ API key with ID ${keyId} not found.\n`);
      } else {
        console.log(`\n✓ API key ${keyId} activated successfully.\n`);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error activating API key:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// keys:delete - Permanently delete an API key
// ============================================================================
program
  .command('keys:delete <keyId>')
  .description('Permanently delete an API key')
  .action(async keyId => {
    try {
      await initDatabase();
      const pool = getPool();

      const [result] = await pool.query('DELETE FROM api_keys WHERE id = ?', [keyId]);

      if (result.affectedRows === 0) {
        console.log(`\n✗ API key with ID ${keyId} not found.\n`);
      } else {
        console.log(`\n✓ API key ${keyId} deleted permanently.\n`);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error deleting API key:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// keys:stats - Show usage statistics for a key
// ============================================================================
program
  .command('keys:stats <keyId>')
  .description('Show usage statistics for an API key')
  .action(async keyId => {
    try {
      await initDatabase();
      const pool = getPool();

      const [rows] = await pool.query('SELECT * FROM api_keys WHERE id = ?', [keyId]);

      if (rows.length === 0) {
        console.log(`\n✗ API key with ID ${keyId} not found.\n`);
      } else {
        const key = rows[0];
        console.log('\n API Key Statistics:\n');
        console.log(`  ID:          ${key.id}`);
        console.log(`  Key:         ...${key.key.slice(-8)}`);
        console.log(`  Description: ${key.description || '(none)'}`);
        console.log(`  Status:      ${key.is_active ? 'Active' : 'Inactive'}`);
        console.log(`  Created:     ${new Date(key.created_at).toISOString()}`);
        console.log(
          `  Last Used:   ${key.last_used_at ? new Date(key.last_used_at).toISOString() : 'Never'}`
        );
        console.log('');
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('✗ Error retrieving API key stats:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// schema:migrate - Run pending database migrations
// ============================================================================
program
  .command('schema:migrate')
  .description('Run pending database migrations')
  .action(async () => {
    try {
      await initDatabase();

      console.log('\n🔄 Running database migrations...\n');

      // Create simple logger for CLI context
      const logger = {
        info: msg => console.log(`  ${msg}`),
        error: (msg, ...args) => console.error(`  ✗ ${msg}`, ...args)
      };

      const result = await runMigrations(logger);

      if (result.success) {
        console.log('\n✓ Migrations completed successfully!');
        console.log(`  Executed: ${result.executed}`);
        console.log(`  Skipped:  ${result.skipped}`);
        console.log('');
        process.exit(0);
      } else {
        console.error('\n✗ Migration execution failed!');
        console.error(`  Executed: ${result.executed}`);
        console.error(`  Failed:   ${result.failed}`);
        console.error('');
        process.exit(1);
      }
    } catch (error) {
      console.error('\n✗ Error running migrations:', error.message);
      console.error('');
      process.exit(1);
    } finally {
      await closeDatabase();
    }
  });

// ============================================================================
// schema:status - Show migration status
// ============================================================================
program
  .command('schema:status')
  .description('Show database migration status')
  .action(async () => {
    try {
      await initDatabase();

      const status = await getMigrationStatus();

      console.log('\n📊 Database Migration Status:\n');
      console.log(`  Project Version:       ${status.projectVersion}`);
      console.log(`  Total Migrations:      ${status.totalMigrations}`);
      console.log(`  Applicable Migrations: ${status.applicableMigrations}`);
      console.log(`  Executed Migrations:   ${status.executedMigrations}`);
      console.log(`  Pending Migrations:    ${status.pendingMigrations}`);

      if (status.pendingMigrations > 0) {
        console.log('\n  Pending:');
        status.pending.forEach(m => {
          console.log(`    - ${m.version}: ${m.description}`);
        });
      } else {
        console.log('\n  ✓ All migrations up to date!');
      }

      console.log('');

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error checking migration status:', error.message);
      console.error('');
      process.exit(1);
    }
  });

// ============================================================================
// schema:history - Show migration execution history
// ============================================================================
program
  .command('schema:history')
  .description('Show migration execution history')
  .option('--failed', 'Show only failed migrations')
  .action(async options => {
    try {
      await initDatabase();

      const migrations = await getExecutedMigrations();

      let filtered = migrations;
      if (options.failed) {
        filtered = migrations.filter(m => !m.success);
      }

      if (filtered.length === 0) {
        console.log('\n  No migration history found.\n');
      } else {
        console.log(`\n📋 Migration History (${filtered.length} entries):\n`);
        console.log('  Version | Filename                          | Status   | Executed At');
        console.log('  ' + '-'.repeat(85));

        filtered.forEach(m => {
          const version = m.version.padEnd(7);
          const filename = m.filename.substring(0, 32).padEnd(33);
          const status = m.success ? '✓ Pass  ' : '✗ Failed';
          const executedAt = new Date(m.executed_at)
            .toISOString()
            .substring(0, 19)
            .replace('T', ' ');

          console.log(`  ${version} | ${filename} | ${status} | ${executedAt}`);

          if (!m.success && m.error_message) {
            console.log(`          Error: ${m.error_message.substring(0, 80)}`);
          }
        });

        console.log('');
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error retrieving migration history:', error.message);
      console.error('');
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
