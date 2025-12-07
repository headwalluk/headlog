const config = require('./config');
const fastify = require('fastify');
const compress = require('@fastify/compress');
const rateLimit = require('@fastify/rate-limit');
const fs = require('fs');
const path = require('path');
const { initDatabase, closeDatabase } = require('./config/database');
const { authenticate } = require('./middleware/auth');
const logRoutes = require('./routes/logs');
const websiteRoutes = require('./routes/websites');
const { initHousekeeping } = require('./housekeeping/tasks');
const { runMigrations } = require('./services/migrationService');

// Initialize Fastify
const app = fastify({
  logger: config.isDevelopment
    ? {
      level: config.logging.level,
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: true
        }
      }
    }
    : {
      level: config.logging.level
    },
  trustProxy: true,
  bodyLimit: config.server.bodyLimit
});

/**
 * Check .env file permissions for security
 */
function checkEnvPermissions() {
  // Allow skipping check via environment variable (for systems where this check doesn't work)
  if (process.env.SKIP_DOTENV_PERMISSION_CHECK === 'true') {
    console.warn('⚠️  Warning: .env permission check skipped (SKIP_DOTENV_PERMISSION_CHECK=true)');
    return;
  }

  const envPath = path.join(process.cwd(), '.env');

  // Check if .env file exists
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️  Warning: .env file not found');
    return; // Don't fail if .env doesn't exist (config might come from environment)
  }

  try {
    const stats = fs.statSync(envPath);
    const mode = stats.mode & parseInt('777', 8); // Get permission bits
    const octal = mode.toString(8);

    // Check if permissions are too permissive (not 600 or 400)
    // 600 = rw------- (owner read/write)
    // 400 = r-------- (owner read only)
    if (mode !== parseInt('600', 8) && mode !== parseInt('400', 8)) {
      console.error('\n');
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('🚨  SECURITY ERROR: .env file permissions are too permissive! 🚨');
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('');
      console.error(`Current permissions: ${octal} (should be 600 or 400)`);
      console.error(`File location: ${envPath}`);
      console.error('');
      console.error('The .env file contains sensitive credentials and MUST be');
      console.error('readable only by the owner to prevent unauthorized access.');
      console.error('');
      console.error('To fix this, run:');
      console.error(`  chmod 600 ${envPath}`);
      console.error('');
      console.error('Alternatively, if this check is not compatible with your');
      console.error('system, you can disable it by setting:');
      console.error('  SKIP_DOTENV_PERMISSION_CHECK=true');
      console.error('');
      console.error('Server startup aborted for security reasons.');
      console.error('═══════════════════════════════════════════════════════════════');
      console.error('\n');
      process.exit(1);
    }

    console.log(`✓ .env file permissions verified (${octal})`);
  } catch (error) {
    console.error('✗ Failed to check .env file permissions:', error.message);
    process.exit(1);
  }
}

/**
 * Initialize server
 */
async function start() {
  try {
    // Check .env file permissions before starting
    checkEnvPermissions();

    // Register compression plugin (gzip support)
    await app.register(compress, {
      global: true,
      encodings: ['gzip', 'deflate']
    });

    // Register rate limiting (before auth to save CPU on failed requests)
    if (config.rateLimit.enabled) {
      console.log('⌛ Initializing rate limiting...');
      await app.register(rateLimit, {
        max: config.rateLimit.max,
        timeWindow: config.rateLimit.timeWindow,
        cache: config.rateLimit.cache,
        allowList: function (request, key) {
          // Skip rate limiting for health check only
          if (request.url === '/health') {
            return true;
          }
          // Allow localhost (for CLI and testing)
          return config.rateLimit.allowList.includes(key);
        },
        skipOnError: false,
        addHeadersOnExceeding: {
          'x-ratelimit-limit': true,
          'x-ratelimit-remaining': true,
          'x-ratelimit-reset': true
        },
        addHeaders: {
          'x-ratelimit-limit': true,
          'x-ratelimit-remaining': true,
          'x-ratelimit-reset': true,
          'retry-after': true
        },
        errorResponseBuilder: function (request, context) {
          app.log.warn(
            {
              ip: request.ip,
              path: request.url,
              method: request.method,
              rateLimitHit: true
            },
            'Rate limit exceeded'
          );

          return {
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Maximum ${context.max} requests per ${context.after}`,
            retryAfter: context.after
          };
        }
      });
      app.log.info(
        `Rate limiting enabled: ${config.rateLimit.max} requests per ${config.rateLimit.timeWindow}`
      );
    } else {
      app.log.warn('Rate limiting disabled');
    }

    // Initialize database connection
    await initDatabase();

    // Run migrations (only on worker 0, unless disabled)
    if (config.pm2.isWorkerZero && !config.migrations.autoRunDisabled) {
      app.log.info('Running database migrations...');
      const migrationResult = await runMigrations(app.log);

      if (!migrationResult.success) {
        app.log.error('Database migrations failed. Cannot start server.');
        process.exit(1);
      }

      app.log.info('Database migrations completed successfully');
    } else if (config.migrations.autoRunDisabled) {
      app.log.warn('Auto-run migrations disabled (AUTO_RUN_MIGRATIONS_DISABLED=true)');
    }

    // Health check endpoint (no auth required)
    app.get('/health', async (request, reply) => {
      return reply.code(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Register authentication hook for all routes except /health
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') {
        return; // Skip auth for health check
      }
      await authenticate(request, reply);
    });

    // Register routes
    await app.register(logRoutes);
    await app.register(websiteRoutes);

    // Initialize housekeeping tasks (only on worker 0)
    initHousekeeping();

    // Start server
    const { port, host } = config.server;

    await app.listen({ port, host });

    console.log(`✓ Headlog server started on ${host}:${port} (worker ${config.pm2.appInstance})`);
    console.log(`✓ Environment: ${config.env}`);

    // Signal PM2 that app is ready
    if (process.send) {
      process.send('ready');
    }
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  try {
    await app.close();
    await closeDatabase();
    console.log('✓ Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

// Start the server
start();
