const config = require('./config');
const fastify = require('fastify');
const compress = require('@fastify/compress');
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
 * Initialize server
 */
async function start() {
  try {
    // Register compression plugin (gzip support)
    await app.register(compress, {
      global: true,
      encodings: ['gzip', 'deflate']
    });

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
