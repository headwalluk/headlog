/**
 * Centralized configuration module
 * Loads and validates environment variables once at startup
 */

require('dotenv').config();

/**
 * Parse integer from environment variable with default
 * @param {string} value
 * @param {number} defaultValue
 * @returns {number}
 */
function parseIntEnv(value, defaultValue) {
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean from environment variable with default
 * @param {string} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseBoolEnv(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  return value === 'true' || value === '1';
}

// Application configuration
const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Server
  server: {
    port: parseIntEnv(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    bodyLimit: 10485760 // 10MB for batched logs
  },

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseIntEnv(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    connectionLimit: 10
  },

  // Housekeeping
  housekeeping: {
    logRetentionDays: parseIntEnv(process.env.LOG_RETENTION_DAYS, 30),
    inactiveWebsiteDays: parseIntEnv(process.env.INACTIVE_WEBSITE_DAYS, 45)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // PM2
  pm2: {
    appInstance: process.env.NODE_APP_INSTANCE || '0',
    isWorkerZero: (process.env.NODE_APP_INSTANCE || '0') === '0'
  },

  // Migrations
  migrations: {
    autoRunDisabled: parseBoolEnv(process.env.AUTO_RUN_MIGRATIONS_DISABLED, false),
    directory: 'schema'
  },

  // Rate Limiting
  rateLimit: {
    enabled: parseBoolEnv(process.env.RATE_LIMIT_ENABLED, true),
    max: parseIntEnv(process.env.RATE_LIMIT_MAX, 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    cache: parseIntEnv(process.env.RATE_LIMIT_CACHE, 10000),
    allowList: process.env.RATE_LIMIT_ALLOWLIST
      ? process.env.RATE_LIMIT_ALLOWLIST.split(',').map(ip => ip.trim())
      : ['127.0.0.1', '::1']
  },

  // Security
  security: {
    skipDotenvPermissionCheck: parseBoolEnv(process.env.SKIP_DOTENV_PERMISSION_CHECK, false)
  }
};

// Validate required configuration
function validateConfig() {
  const required = [
    { key: 'database.user', value: config.database.user, name: 'DB_USER' },
    { key: 'database.password', value: config.database.password, name: 'DB_PASSWORD' },
    { key: 'database.name', value: config.database.name, name: 'DB_NAME' }
  ];

  const missing = required.filter(item => !item.value);

  if (missing.length > 0) {
    console.error('\n✗ Missing required environment variables:');
    missing.forEach(item => {
      console.error(`  - ${item.name} (${item.key})`);
    });
    console.error('\nPlease check your .env file.\n');
    process.exit(1);
  }
}

// Validate on load
validateConfig();

module.exports = config;
