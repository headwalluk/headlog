/**
 * User Management Commands
 * 
 * Commands for creating, listing, and managing user accounts.
 */

const { initDatabase, closeDatabase } = require('../../config/database');
const User = require('../../models/User');

module.exports = function(program) {
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
        const { initDatabase, getPool } = require('../../config/database');
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
};
