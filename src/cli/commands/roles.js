/**
 * Role Management Commands
 * 
 * Commands for listing, viewing, and assigning roles to users.
 */

const Table = require('cli-table3');
const { initDatabase, closeDatabase } = require('../../config/database');
const User = require('../../models/User');
const Role = require('../../models/Role');
const authorizationService = require('../../services/authorizationService');

module.exports = function(program) {
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
};
