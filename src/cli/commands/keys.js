/**
 * API Key Management Commands
 * 
 * Commands for creating, listing, and managing API keys.
 */

const bcrypt = require('bcrypt');
const Table = require('cli-table3');
const { getPool, initDatabase, closeDatabase } = require('../../config/database');
const { generateApiKey } = require('../../utils/generateApiKey');

module.exports = function(program) {
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

        // Hash the key before storing (bcrypt with 10 rounds)
        const keyHash = await bcrypt.hash(key, 10);

        const [result] = await pool.query('INSERT INTO api_keys (`key`, description) VALUES (?, ?)', [
          keyHash,
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
          const table = new Table({
            head: ['ID', 'Status', 'Description', 'Last Used', 'Created'],
            colWidths: [6, 10, 30, 21, 13]
          });

          rows.forEach(row => {
            const status = row.is_active ? 'Active' : 'Inactive';
            const description = (row.description || '').substring(0, 27);
            const lastUsed = row.last_used_at
              ? new Date(row.last_used_at).toISOString().substring(0, 19).replace('T', ' ')
              : 'Never';
            const created = new Date(row.created_at).toISOString().substring(0, 10);

            table.push([row.id, status, description, lastUsed, created]);
          });

          console.log(`\nFound ${rows.length} API key(s):\n`);
          console.log(table.toString());
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
};
