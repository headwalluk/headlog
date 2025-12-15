/**
 * Headlog CLI - Main Program
 * 
 * This file sets up the Commander.js program and loads all command modules.
 */

const { Command } = require('commander');

const program = new Command();

program
  .name('headlog')
  .description('Headlog centralized log aggregation CLI')
  .version(require('../../package.json').version);

// Load command modules
require('./commands/users')(program);
require('./commands/keys')(program);
require('./commands/schema')(program);
require('./commands/roles')(program);
require('./commands/capabilities')(program);

// Parse command line arguments
program.parse(process.argv);
