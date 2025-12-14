const config = require('./config');
const fastify = require('fastify');
const cors = require('@fastify/cors');
const compress = require('@fastify/compress');
const rateLimit = require('@fastify/rate-limit');
const view = require('@fastify/view');
const session = require('@fastify/session');
const cookie = require('@fastify/cookie');
const formbody = require('@fastify/formbody');
const staticPlugin = require('@fastify/static');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { initDatabase, closeDatabase } = require('./config/database');
const { authenticate } = require('./middleware/auth');
const MySQLSessionStore = require('./config/sessionStore');
const logRoutes = require('./routes/logs');
const websiteRoutes = require('./routes/websites');
const { initHousekeeping } = require('./housekeeping/tasks');
const { runMigrations } = require('./services/migrationService');
const { initializeCodeCache } = require('./services/httpCodeService');
const { prewarmCache: prewarmHostCache } = require('./services/hostService');

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

    // Register compression plugin (gzip support for responses)
    // Note: Only compress responses, not decompress requests
    // Fastify automatically handles Content-Encoding on requests
    await app.register(compress, {
      global: false, // Don't globally compress all responses
      encodings: ['gzip', 'deflate'],
      threshold: 1024, // Only compress responses > 1KB
      // Decompression of requests is handled automatically by Fastify's body parser
      requestEncodings: ['gzip', 'deflate'] // Support compressed incoming requests
    });

    // Custom content type parser to handle compressed JSON without Content-Length validation
    // This fixes the issue where Fluent Bit sends gzipped data with Content-Length for
    // the compressed size, but Fastify validates against the uncompressed size
    app.removeContentTypeParser(['application/json']);
    app.addContentTypeParser('application/json', function (request, payload, done) {
      const chunks = [];
      
      // Check if we need to decompress (gzip or deflate)
      const encoding = request.headers['content-encoding'];
      let stream = payload;
      
      if (encoding === 'gzip') {
        stream = payload.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = payload.pipe(zlib.createInflate());
      }
      
      stream.on('data', chunk => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const json = JSON.parse(body);
          done(null, json);
        } catch (err) {
          err.statusCode = 400;
          done(err, undefined);
        }
      });
      
      stream.on('error', (err) => {
        done(err, undefined);
      });
    });

    // Add preParsing hook to log body parsing issues
    app.addHook('preParsing', async (request, reply, payload) => {
      // Log incoming request details for debugging Content-Length mismatches
      if (request.url.startsWith('/api/logs') && request.method === 'POST') {
        const contentLength = request.headers['content-length'];
        const contentEncoding = request.headers['content-encoding'];
        
        request.log.debug({
          url: request.url,
          contentLength,
          contentEncoding,
          hasPayload: !!payload
        }, 'Body parsing started');
      }
      
      return payload;
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

    // Initialize HTTP code cache
    app.log.info('Loading HTTP status codes into cache...');
    await initializeCodeCache();
    app.log.info('HTTP status codes loaded successfully');

    // Pre-warm host cache with most common hosts
    app.log.info('Pre-warming host cache...');
    await prewarmHostCache(1000); // Load top 1000 hosts by last_seen_at
    app.log.info('Host cache pre-warmed successfully');

    // Register CORS plugin
    if (config.cors.enabled) {
      await app.register(cors, {
        origin: config.ui.enabled && config.cors.origin ? config.cors.origin : false,
        credentials: config.ui.enabled // Allow credentials only when UI is enabled
      });
      
      if (config.ui.enabled && config.cors.origin) {
        app.log.info(`CORS enabled for origin: ${config.cors.origin}`);
      } else if (config.ui.enabled) {
        app.log.info('CORS enabled for same-origin requests only');
      } else {
        app.log.info('CORS blocking all cross-origin requests (API-only mode)');
      }
    }

    // Register plugins for UI (if enabled)
    if (config.ui.enabled) {
      app.log.info('Configuring Web UI...');

      // Register cookie support (required by session)
      await app.register(cookie);

      // Register session support with MySQL store
      const sessionStore = new MySQLSessionStore({
        tableName: config.session.tableName,
        ttl: config.session.maxAge
      });

      await app.register(session, {
        secret: config.session.secret,
        cookie: {
          secure: config.session.secure,
          maxAge: config.session.maxAge,
          httpOnly: true,
          sameSite: 'strict'
        },
        store: sessionStore,
        saveUninitialized: false,
        rolling: true
      });

      // Register form body parser
      await app.register(formbody);

      // Register static file serving
      await app.register(staticPlugin, {
        root: path.join(__dirname, '..', 'public'),
        prefix: '/static/'
      });

      // Register vendor assets from node_modules
      await app.register(staticPlugin, {
        root: path.join(__dirname, '..', 'node_modules'),
        prefix: '/vendor/',
        decorateReply: false
      });

      // Register view engine (EJS)
      await app.register(view, {
        engine: { ejs },
        root: path.join(__dirname, 'views'),
        options: {
          filename: path.join(__dirname, 'views')
        }
      });

      // Decorator to add common data to view context
      app.decorateReply('renderView', function (template, data = {}) {
        return this.view(template, {
          ...data,
          user: this.request.user || null,
          session: this.request.session || null,
          config: {
            appName: 'Headlog',
            version: require('../package.json').version,
            env: config.env
          }
        });
      });

      app.log.info('Web UI configured successfully');
    }

    // Global error handler - prevent internal error leaks
    app.setErrorHandler((error, request, reply) => {
      // Special handling for Content-Length mismatch errors - log extra details
      if (error.message && error.message.includes('Content-Length')) {
        app.log.error({
          err: error,
          url: request.url,
          method: request.method,
          ip: request.ip,
          headers: {
            'content-length': request.headers['content-length'],
            'content-encoding': request.headers['content-encoding'],
            'content-type': request.headers['content-type'],
            'transfer-encoding': request.headers['transfer-encoding']
          }
        }, 'Content-Length mismatch error - possible compression or network issue');
      } else {
        // Log full error details for debugging
        app.log.error({
          err: error,
          url: request.url,
          method: request.method,
          ip: request.ip
        }, 'Request error');
      }

      // In production, send generic error messages
      // In development, include more details for debugging
      if (config.isProduction) {
        // Production: Generic error message, no internal details
        const statusCode = error.statusCode || 500;
        
        if (statusCode >= 500) {
          // Server errors: completely generic message
          return reply.code(statusCode).send({
            statusCode,
            error: 'Internal Server Error',
            message: 'An error occurred processing your request'
          });
        } else {
          // Client errors (4xx): can include error message
          return reply.code(statusCode).send({
            statusCode,
            error: error.name || 'Error',
            message: error.message || 'Bad Request'
          });
        }
      } else {
        // Development: Include full error details for debugging
        return reply.code(error.statusCode || 500).send({
          statusCode: error.statusCode || 500,
          error: error.name || 'Error',
          message: error.message,
          code: error.code,
          stack: error.stack
        });
      }
    });

    // Health check endpoint (no auth required)
    app.get('/health', async (request, reply) => {
      return reply.code(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Register authentication hook for API routes only
    app.addHook('onRequest', async (request, reply) => {
      // Skip auth for health check and UI routes (UI has its own session auth)
      if (
        request.url === '/health' ||
        request.url.startsWith('/static/') ||
        request.url.startsWith('/auth/') ||
        request.url === '/login' ||
        request.url === '/'
      ) {
        return;
      }

      // For /api routes, check for session auth first (for browser requests)
      // then fall back to API key auth
      if (request.url.startsWith('/api')) {
        // Only check for session auth if UI is enabled (performance optimization)
        if (config.ui.enabled && request.session && request.session.user_id) {
          const authService = require('./services/authService');
          const user = await authService.validateSession(request.session.user_id);
          if (user) {
            // Valid session - let the route handler do capability checking
            return;
          }
        }
        
        // No valid session (or UI disabled) - require API key
        await authenticate(request, reply);
      }
    });

    // Register API routes under /api prefix
    await app.register(logRoutes, { prefix: '/api' });
    await app.register(websiteRoutes, { prefix: '/api' });

    // Register UI routes (if enabled)
    if (config.ui.enabled) {
      const authRoutes = require('./routes/auth');
      const uiRoutes = require('./routes/ui');

      await app.register(authRoutes, { prefix: '/auth' });
      await app.register(uiRoutes);

      app.log.info('Web UI routes registered');
    }

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
