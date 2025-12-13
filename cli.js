#!/usr/bin/env node

// Load config early (validates DB credentials)
require('./src/config');
const { Command } = require('commander');
const bcrypt = require('bcrypt');
const Table = require('cli-table3');
const { getPool, initDatabase, closeDatabase } = require('./src/config/database');
const { generateApiKey } = require('./src/utils/generateApiKey');
const {
  runMigrations,
  getMigrationStatus,
  getExecutedMigrations
} = require('./src/services/migrationService');
const User = require('./src/models/User');
const Role = require('./src/models/Role');
const Capability = require('./src/models/Capability');
const authorizationService = require('./src/services/authorizationService');

const program = new Command();

program.name('headlog-cli').description('Headlog API key management CLI').version('0.1.0');

// ============================================================================
// users:create-admin - Create admin user (bootstrap command)
// ============================================================================
program
  .command('users:create-admin')
  .description('Create a new admin user (superuser)')
  .option('--username <username>', 'Username for the admin account')
  .option('--email <email>', 'Email address for the admin account')
  .option('--password <password>', 'Password (use with caution - visible in shell history)')
  .option('--non-interactive', 'Non-interactive mode (requires all options)')
  .action(async options => {
    try {
      await initDatabase();

      let username, email, password;

      if (options.nonInteractive) {
        // Non-interactive mode - require all options
        if (!options.username || !options.email || !options.password) {
          console.error('✗ Error: --non-interactive requires --username, --email, and --password');
          process.exit(1);
        }

        username = options.username;
        email = options.email;
        password = options.password;
      } else {
        // Interactive mode - prompt for missing values
        console.log('\n🔐 Create Admin User\n');

        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Username:',
            default: options.username,
            validate: input => {
              if (!input || input.length < 3) {
                return 'Username must be at least 3 characters';
              }
              if (!/^[a-zA-Z0-9_]+$/.test(input)) {
                return 'Username can only contain letters, numbers, and underscores';
              }
              return true;
            }
          },
          {
            type: 'input',
            name: 'email',
            message: 'Email:',
            default: options.email,
            validate: input => {
              if (!input || !input.includes('@')) {
                return 'Please enter a valid email address';
              }
              return true;
            }
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
            validate: input => {
              const validation = User.validatePassword(input);
              if (!validation.valid) {
                return validation.error;
              }
              return true;
            }
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:',
            mask: '*'
          }
        ]);

        // Validate passwords match
        if (answers.password !== answers.confirmPassword) {
          console.error('\n✗ Error: Passwords do not match');
          process.exit(1);
        }

        username = answers.username;
        email = answers.email;
        password = answers.password;
      }

      // Create the admin user
      const user = await User.createUser({
        username,
        email,
        password,
        is_superuser: true
      });

      console.log('\n✓ Admin user created successfully!\n');
      console.log(`  ID:       ${user.id}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Email:    ${user.email}`);
      console.log('  Role:     Superuser');
      console.log('');

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error creating admin user:', error.message);
      console.error('');
      await closeDatabase();
      process.exit(1);
    }
  });

// ============================================================================
// users:list - List all users
// ============================================================================
program
  .command('users:list')
  .description('List all users')
  .option('--active-only', 'Show only active users')
  .option('--superuser-only', 'Show only superusers')
  .action(async options => {
    try {
      const { initDatabase, getPool } = require('./src/config/database');
      await initDatabase();
      const pool = getPool();

      let query =
        'SELECT id, username, email, is_active, is_superuser, created_at, last_login_at FROM users WHERE 1=1';
      const params = [];

      if (options.activeOnly) {
        query += ' AND is_active = 1';
      }

      if (options.superuserOnly) {
        query += ' AND is_superuser = 1';
      }

      query += ' ORDER BY created_at DESC';

      const [users] = await pool.query(query, params);

      if (users.length === 0) {
        console.log('\nNo users found.');
        process.exit(0);
      }

      const Table = require('cli-table3');
      const table = new Table({
        head: ['ID', 'Username', 'Email', 'Active', 'Superuser', 'Created', 'Last Login'],
        colWidths: [6, 20, 30, 8, 10, 20, 20]
      });

      users.forEach(user => {
        table.push([
          user.id,
          user.username,
          user.email,
          user.is_active ? '✓' : '✗',
          user.is_superuser ? '✓' : '✗',
          user.created_at ? user.created_at.toISOString().split('T')[0] : 'N/A',
          user.last_login_at ? user.last_login_at.toISOString().split('T')[0] : 'Never'
        ]);
      });

      console.log(`\nTotal users: ${users.length}\n`);
      console.log(table.toString());
      process.exit(0);
    } catch (error) {
      console.error('✗ Error listing users:', error.message);
      process.exit(1);
    }
  });

// ============================================================================
// users:reset-password - Reset a user's password
// ============================================================================
program
  .command('users:reset-password <user-id-or-username>')
  .description("Reset a user's password")
  .option('--password <password>', 'New password (use with caution - visible in shell history)')
  .option('--non-interactive', 'Run without prompts (requires --password)')
  .action(async (userIdOrUsername, options) => {
    try {
      await initDatabase();

      // Find the user
      let user;
      if (/^\d+$/.test(userIdOrUsername)) {
        user = await User.findById(parseInt(userIdOrUsername));
      } else {
        user = await User.findByUsername(userIdOrUsername);
      }

      if (!user) {
        console.error(`✗ Error: User not found: ${userIdOrUsername}`);
        process.exit(1);
      }

      console.log(`\nResetting password for user: ${user.username} (${user.email})\n`);

      let newPassword;

      if (options.nonInteractive) {
        if (!options.password) {
          console.error('✗ Error: --non-interactive requires --password');
          process.exit(1);
        }
        newPassword = options.password;

        // Validate password
        const validation = User.validatePassword(newPassword);
        if (!validation.valid) {
          console.error('✗ Error: Invalid password');
          validation.errors.forEach(error => console.error(`  - ${error}`));
          process.exit(1);
        }
      } else {
        const inquirer = (await import('inquirer')).default;
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'New password:',
            mask: '*',
            validate: input => {
              const validation = User.validatePassword(input);
              if (!validation.valid) {
                return validation.errors.join('\n');
              }
              return true;
            }
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:',
            mask: '*'
          }
        ]);

        // Validate passwords match
        if (answers.password !== answers.confirmPassword) {
          console.error('\n✗ Error: Passwords do not match');
          process.exit(1);
        }

        newPassword = answers.password;
      }

      // Reset the password
      await User.resetPassword(user.id, newPassword);

      console.log('✓ Password reset successfully');
      process.exit(0);
    } catch (error) {
      console.error('✗ Error resetting password:', error.message);
      process.exit(1);
    }
  });

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
        console.log(`\n Found ${rows.length} API key(s):\n`);
        console.log(
          '  ID  | Status   | Description                | Last Used           | Created'
        );
        console.log('  ' + '-'.repeat(95));

        rows.forEach(row => {
          const status = row.is_active ? 'Active  ' : 'Inactive';
          const description = (row.description || '').substring(0, 25).padEnd(25);
          const lastUsed = row.last_used_at
            ? new Date(row.last_used_at).toISOString().substring(0, 19).replace('T', ' ')
            : 'Never'.padEnd(19);
          const created = new Date(row.created_at).toISOString().substring(0, 10);

          console.log(
            `  ${String(row.id).padEnd(3)} | ${status} | ${description} | ${lastUsed} | ${created}`
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

// ============================================================================
// roles:list - List all roles
// ============================================================================
program
  .command('roles:list')
  .description('List all roles')
  .option('--system-only', 'Only show system roles')
  .option('--custom-only', 'Only show custom (non-system) roles')
  .action(async options => {
    try {
      await initDatabase();

      let roles;
      if (options.systemOnly) {
        const allRoles = await Role.listRoles({ limit: 1000 });
        roles = allRoles.filter(r => r.is_system);
      } else if (options.customOnly) {
        roles = await Role.listRoles({ includeSystemRoles: false, limit: 1000 });
      } else {
        roles = await Role.listRoles({ limit: 1000 });
      }

      if (roles.length === 0) {
        console.log('\nNo roles found.\n');
        await closeDatabase();
        process.exit(0);
      }

      const table = new Table({
        head: ['ID', 'Name', 'Type', 'Description'],
        colWidths: [6, 25, 10, 50]
      });

      for (const role of roles) {
        table.push([
          role.id,
          role.name,
          role.is_system ? 'System' : 'Custom',
          role.description.substring(0, 47) + (role.description.length > 47 ? '...' : '')
        ]);
      }

      console.log('\n' + table.toString() + '\n');

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error listing roles:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  });

// ============================================================================
// roles:show - Show role details including capabilities
// ============================================================================
program
  .command('roles:show <role-id-or-name>')
  .description('Show detailed information about a role')
  .action(async roleIdOrName => {
    try {
      await initDatabase();

      // Try to find by ID first, then by name
      let role;
      if (/^\d+$/.test(roleIdOrName)) {
        role = await Role.findById(parseInt(roleIdOrName));
      } else {
        role = await Role.findByName(roleIdOrName);
      }

      if (!role) {
        console.error(`\n✗ Role '${roleIdOrName}' not found.\n`);
        await closeDatabase();
        process.exit(1);
      }

      // Get capabilities for this role
      const capabilities = await Role.getCapabilities(role.id);
      const userCount = await Role.getUserCount(role.id);

      console.log('\n=== Role Details ===\n');
      console.log(`  ID:          ${role.id}`);
      console.log(`  Name:        ${role.name}`);
      console.log(`  Description: ${role.description}`);
      console.log(`  Type:        ${role.is_system ? 'System Role' : 'Custom Role'}`);
      console.log(`  Users:       ${userCount}`);
      console.log(`  Created:     ${role.created_at}`);

      if (capabilities.length > 0) {
        console.log('\n=== Capabilities ===\n');

        // Group by category
        const byCategory = capabilities.reduce((acc, cap) => {
          if (!acc[cap.category]) acc[cap.category] = [];
          acc[cap.category].push(cap);
          return acc;
        }, {});

        Object.keys(byCategory)
          .sort()
          .forEach(category => {
            console.log(`  ${category}:`);
            byCategory[category].forEach(cap => {
              const dangerous = cap.is_dangerous ? ' [DANGEROUS]' : '';
              console.log(`    - ${cap.name}${dangerous}`);
            });
          });

        console.log('');
      } else {
        console.log('\n  No capabilities assigned.\n');
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error showing role:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  });

// ============================================================================
// roles:assign - Assign a role to a user
// ============================================================================
program
  .command('roles:assign <user-id> <role-id-or-name>')
  .description('Assign a role to a user')
  .option('--assigned-by <user-id>', 'User ID who is making the assignment (for audit)', '0')
  .action(async (userIdStr, roleIdOrName, options) => {
    try {
      await initDatabase();

      const userId = parseInt(userIdStr);

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        console.error(`\n✗ User ID ${userId} not found.\n`);
        await closeDatabase();
        process.exit(1);
      }

      // Find role
      let role;
      if (/^\d+$/.test(roleIdOrName)) {
        role = await Role.findById(parseInt(roleIdOrName));
      } else {
        role = await Role.findByName(roleIdOrName);
      }

      if (!role) {
        console.error(`\n✗ Role '${roleIdOrName}' not found.\n`);
        await closeDatabase();
        process.exit(1);
      }

      const assignedBy = parseInt(options.assignedBy);
      const wasAssigned = await authorizationService.assignRole(userId, role.id, assignedBy);

      if (wasAssigned) {
        console.log(`\n✓ Role '${role.name}' assigned to user '${user.username}'\n`);
      } else {
        console.log(`\n⚠ User '${user.username}' already has role '${role.name}'\n`);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error assigning role:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  });

// ============================================================================
// roles:remove - Remove a role from a user
// ============================================================================
program
  .command('roles:remove <user-id> <role-id-or-name>')
  .description('Remove a role from a user')
  .action(async (userIdStr, roleIdOrName) => {
    try {
      await initDatabase();

      const userId = parseInt(userIdStr);

      // Verify user exists
      const user = await User.findById(userId);
      if (!user) {
        console.error(`\n✗ User ID ${userId} not found.\n`);
        await closeDatabase();
        process.exit(1);
      }

      // Find role
      let role;
      if (/^\d+$/.test(roleIdOrName)) {
        role = await Role.findById(parseInt(roleIdOrName));
      } else {
        role = await Role.findByName(roleIdOrName);
      }

      if (!role) {
        console.error(`\n✗ Role '${roleIdOrName}' not found.\n`);
        await closeDatabase();
        process.exit(1);
      }

      const wasRemoved = await authorizationService.removeRole(userId, role.id);

      if (wasRemoved) {
        console.log(`\n✓ Role '${role.name}' removed from user '${user.username}'\n`);
      } else {
        console.log(`\n⚠ User '${user.username}' did not have role '${role.name}'\n`);
      }

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error removing role:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  });

// ============================================================================
// capabilities:list - List all capabilities
// ============================================================================
program
  .command('capabilities:list')
  .description('List all capabilities')
  .option('--category <category>', 'Filter by category')
  .option('--dangerous-only', 'Only show dangerous capabilities')
  .action(async options => {
    try {
      await initDatabase();

      const capabilities = await Capability.listCapabilities({
        category: options.category || null,
        dangerousOnly: options.dangerousOnly || false,
        limit: 1000
      });

      if (capabilities.length === 0) {
        console.log('\nNo capabilities found.\n');
        await closeDatabase();
        process.exit(0);
      }

      const table = new Table({
        head: ['ID', 'Name', 'Category', 'Dangerous', 'Description'],
        colWidths: [6, 25, 15, 11, 40]
      });

      for (const cap of capabilities) {
        table.push([
          cap.id,
          cap.name,
          cap.category,
          cap.is_dangerous ? 'Yes' : 'No',
          cap.description.substring(0, 37) + (cap.description.length > 37 ? '...' : '')
        ]);
      }

      console.log('\n' + table.toString() + '\n');

      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Error listing capabilities:', error.message);
      await closeDatabase();
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
