/**
 * Database Schema Management Commands
 * 
 * Commands for running migrations and checking schema status.
 */

const Table = require('cli-table3');
const { initDatabase, closeDatabase } = require('../../config/database');
const {
  runMigrations,
  getMigrationStatus,
  getExecutedMigrations
} = require('../../services/migrationService');

module.exports = function(program) {
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
          const table = new Table({
            head: ['Version', 'Filename', 'Status', 'Executed At'],
            colWidths: [10, 38, 10, 21]
          });

          filtered.forEach(m => {
            const filename = m.filename.substring(0, 35);
            const status = m.success ? '✓ Pass' : '✗ Failed';
            const executedAt = new Date(m.executed_at)
              .toISOString()
              .substring(0, 19)
              .replace('T', ' ');

            table.push([m.version, filename, status, executedAt]);

            // Add error message row if failed
            if (!m.success && m.error_message) {
              table.push([
                { colSpan: 4, content: `Error: ${m.error_message.substring(0, 70)}` }
              ]);
            }
          });

          console.log(`\n📋 Migration History (${filtered.length} entries):\n`);
          console.log(table.toString());
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
};
