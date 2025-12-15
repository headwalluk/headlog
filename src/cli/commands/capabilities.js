/**
 * Capability Management Commands
 * 
 * Commands for listing and viewing capabilities.
 */

const Table = require('cli-table3');
const { initDatabase, closeDatabase } = require('../../config/database');
const Capability = require('../../models/Capability');

module.exports = function(program) {
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
};
