# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.0] - 2025-12-14

### Fixed

- **Fluent Bit Integration**: Resolved Content-Length mismatch errors with gzipped log ingestion
  - Fluent Bit sends gzipped JSON with Content-Length header representing compressed size
  - Fastify's default body parser was decompressing then validating Content-Length against uncompressed size
  - Implemented custom JSON content-type parser with manual gzip/deflate decompression using Node.js zlib
  - Parser checks Content-Encoding header and pipes payload through appropriate decompression stream
  - Bypasses Fastify's Content-Length validation entirely, eliminating FST_ERR_CTP_INVALID_CONTENT_LENGTH errors
  - Enables production-scale log ingestion from multiple Fluent Bit agents with standard gzip compression
  - Supports both gzip and deflate encodings, gracefully handles uncompressed payloads

### Changed

- **Error Handling**: Enhanced global error handler with special logging for Content-Length mismatch debugging
  - Logs full request headers (content-length, content-encoding, content-type, transfer-encoding) when Content-Length errors occur
  - Aids troubleshooting compression-related ingestion issues

### Removed

- Cleaned up deprecated Fastify configuration options (ignoreTrailingSlash, onProtoPoisoning, onConstructorPoisoning)
  - Eliminates FSTDEP022 deprecation warnings
  - Returns to minimal, stable Fastify initialization (trustProxy and bodyLimit only)

## [1.8.3] - 2025-12-14

### Security

- **Error Handling**: Added global error handler to prevent internal error details from leaking in production
  - Production mode returns generic error messages (no file paths, error codes, or stack traces)
  - Development mode still includes full error details for debugging
  - All errors logged server-side for troubleshooting

### Fixed

- **Log Processing**: Remote IP detection now checks `remote` property first, then falls back to `client` property
  - Supports both Apache error log variants
  - Port stripping applies to both fields when `STRIP_PORT_FROM_REMOTE_IP=true`
- **Git Repository**: Fixed `.gitignore` to not ignore `src/views/logs/` directory
  - Changed `logs/` to `/logs/` to only match root-level logs directory
  - Preserves source code structure in repository

## [1.8.2] - 2025-12-14

### Fixed

- **Upstream Sync**: Updated upstream batch sync to use new `POST /api/logs` endpoint (was still using deprecated `POST /logs`)
  - Fixes hierarchical aggregation failures after Milestone 1 API restructuring
  - Required for multi-datacenter log forwarding to work correctly

## [1.8.1] - 2025-12-14

### Changed

- **Performance Optimization**: API authentication now skips session validation when `UI_ENABLED=false`
  - Eliminates unnecessary database queries in API-only mode
  - Improves response time for log ingestion endpoints
  - More efficient for production deployments without web UI

### Fixed

- API key authentication flow optimized for production API-only deployments

## [1.8.0] - 2025-12-13

### Added

- **Website Management UI**
  - Website list page with search, SSL/dev filters, and pagination
  - Website detail page with statistics, log breakdown, and recent activity
  - Create/edit website forms with validation
  - Delete website with confirmation and log record warnings
  - All operations capability-gated (`websites:read`, `websites:write`, `websites:delete`)

- **Host Management UI**
  - Host list page with search and pagination
  - Host detail page with log statistics, activity breakdown, and associated websites
  - Create/edit host forms with hostname validation
  - Delete host protection (prevents deletion if logs exist)
  - All operations capability-gated (`hosts:read`, `hosts:write`, `hosts:delete`)

- **Role Management UI**
  - Role list page showing system and custom roles
  - Role detail page with assigned capabilities and user list
  - Create/edit role forms (system roles protected from modification)
  - Capability management page with grant/revoke interface
  - Capabilities grouped by category with dangerous capability warnings
  - All operations capability-gated (`roles:read`, `roles:write`, `roles:delete`, `roles:manage-capabilities`)

- **Log Explorer**
  - Unified log viewer for both access and error logs
  - Comprehensive filtering: date range, log type, website, host, HTTP code, IP address, search
  - Date range presets (24h, 7d, 30d) with custom range support
  - Server-side pagination (50 records per page, up to 500)
  - Single-click log detail modal with key-value display
  - Smart formatting for JSON, booleans, and long text
  - Raw JSON viewer (collapsed)
  - Mobile-responsive table with column hiding
  - Supports both session-based (browser) and API key authentication

- **Database Query Helper**
  - `scripts/db-query.sh` - Standardized script for ad-hoc database queries
  - Works from any directory using `$BASH_SOURCE` and `realpath`
  - Validates environment variables before execution
  - Documentation in `docs/database-queries.md`

- **Models**
  - `Host.js` - Complete CRUD with audit logging and statistics methods
  - `LogRecord.js` - Search/filter logs with pagination and detail retrieval

### Changed

- **Dashboard**: Removed "Welcome back" toast notification (low value)
- **API Authentication**: `/api/logs/:id` now supports both session-based (browser) and API key authentication
- **Server Hook**: Modified `onRequest` hook to check session auth before requiring API keys for `/api` routes

### Fixed

- Template structure issues in hosts views (duplicate headers, missing partials)
- Audit service references (changed from non-existent `auditLogger` to `auditService`)
- EJS template escaping issues by moving inline JavaScript to external files
- Static file path for log explorer JavaScript

### Documentation

- Added `dev-notes/log-explorer-page.md` - Comprehensive Log Explorer specification
- Added `docs/database-queries.md` - Database query helper usage guide
- Updated UI style guides with examples from new CRUD implementations

## [1.7.0] - 2025-12-13

### Added

- **Web UI Enhancements**
  - Bootstrap 5.3 now served from npm packages via `/vendor/` (no CDN dependency)
  - CORS support with `@fastify/cors` for API protection
  - UI can be disabled via `UI_ENABLED=false` (defaults to false for API-only mode)
  - Toast notifications (bottom-left, auto-dismiss) replacing inline alerts
  - Proper Bootstrap 5 navbar structure with left-sliding mobile sidebar
  - Login page branding with custom logo

- **User Management (Complete CRUD)**
  - User list page with search, filter (active/inactive), and pagination
  - User detail page with information cards, roles, and activity history
  - Create/edit user forms with validation and help sidebar
  - Password reset functionality from detail page
  - Role management page (assign/remove roles)
  - Delete user with confirmation modal
  - All operations capability-gated and audit logged

- **UI Routing System**
  - Centralized route registry (`src/config/routes.js`)
  - Dynamic sidebar navigation based on user capabilities
  - UI helper utilities for capability checks and menu generation
  - Comprehensive routing documentation

- **UI Style Guides**
  - List pages pattern guide
  - Detail/view pages pattern guide
  - Edit/create forms pattern guide
  - Related entity management pattern guide
  - UI conventions and cross-cutting patterns guide

### Changed

- **Bootstrap Assets**: Now served from `/vendor/bootstrap/` and `/vendor/bootstrap-icons/` instead of CDN
- **UI Default**: `UI_ENABLED` now defaults to `false` (API-only mode) instead of `true`
- **Session Logout**: Fixed to properly await session destruction before redirecting
- **Header Navigation**: Rebuilt using proper Bootstrap 5 navbar structure with `navbar-expand-md`
- **Sidebar**: Slides in from left on mobile instead of dropping from top

### Fixed

- Login/logout flow now works correctly with proper session destruction
- Dropdown menus position correctly with `navbar-expand-md` class
- Username validation pattern (escaped hyphen in regex)
- Static file paths (favicon and header icon now load correctly)
- Bootstrap JS now loaded on all pages via footer include
- Mobile sidebar animation (horizontal slide instead of vertical)

### Developer Experience

- Added comprehensive UI style guide documentation in `dev-notes/`
- Established design patterns for future CRUD modules
- User management pages serve as master examples

## [1.6.1] - 2025-12-12

### Fixed

- **Timestamp Extraction Bug**
  - Fixed `timestamp` column to use `log_timestamp` from raw log data (actual event time)
  - Previously was incorrectly using ingestion time instead of event time
  - Affects new records only; existing records retain original timestamps

## [1.5.0] - 2025-12-08

### Added

- **Hierarchical Aggregation: Core Implementation** (Phase 1)
  - Multi-datacenter log forwarding with tree-like topology
  - Database schema changes (Migration 1.5.0):
    - `archived_at` TIMESTAMP column for tracking upstream sync status
    - `upstream_sync_batches` table for batch tracking with UUID-based idempotency
    - `upstream_batch_uuid` column on log_records for batch association
    - `batch_deduplication` table for upstream instance deduplication
  - Upstream configuration section with 9 new environment variables
  - `upstreamSyncService.js` with adaptive batch sizing:
    - Automatic batch size reduction (20%) on failure
    - Gradual recovery (10% increase) on success
    - UUID collision detection with retry logic (max 3 attempts)
    - Native fetch API for HTTP POST (no axios dependency)
    - Optional gzip compression for bandwidth efficiency
  - `upstreamSync.js` cron task with interval throttling
  - Batch deduplication in POST /logs handler for upstream forwarding
  - Modified housekeeping purge logic to respect archived_at when upstream enabled
  - Un-archived records buffered indefinitely during upstream outages

### Changed

- Housekeeping now only purges archived records when upstream forwarding is enabled
- POST /logs handler now supports both direct ingestion and hierarchical batch format

## [1.3.0] - 2025-12-08

### Added

- **Storage Optimization: TIMESTAMP Conversion** (Migration 1.3.0)
  - Convert `timestamp` column from DATETIME (8 bytes) to TIMESTAMP (4 bytes)
  - Storage savings: 4 bytes per record (40MB per 10M records)
  - UTC-based with automatic timezone conversion
  - Complete storage optimization initiative finished

### Changed

- Storage efficiency improvements now complete across all three optimizations
- Total savings: ~56-264 bytes per record (560MB-2.64GB per 10M records)

## [1.2.1] - 2025-12-08

### Removed

- **Drop Legacy Host Column** (Migration 1.2.1)
  - Removed old `host` VARCHAR(255) column from `log_records`
  - Completes host deduplication optimization
  - Storage savings: ~50-255 bytes per record

## [1.2.0] - 2025-12-08

### Added

- **Storage Optimization: Host Deduplication** (Migration 1.2.0)
  - New `hosts` lookup table with SMALLINT UNSIGNED IDs
  - `hostService.js` with race-safe `getOrCreateHostIds()` using INSERT IGNORE
  - In-memory cache with 1-hour TTL and pre-warming (top 1000 hosts)
  - PM2 cluster safe - no coordination needed between workers
  - Batch operations: 2 queries max per ingestion batch
  - Added `host_id` foreign key column to `log_records`
  - Storage savings: ~50-250 bytes per record (500MB-2.5GB per 10M records)

### Changed

- `logService.js` updated to use batch host lookups
  - Two-pass processing for optimal performance
  - Extract unique hostnames, batch fetch/create, then process records

## [1.1.1] - 2025-12-08

### Removed

- **Drop Legacy Code Column** (Migration 1.1.1)
  - Removed old `code` VARCHAR(10) column from `log_records`
  - Completes HTTP codes optimization
  - Storage savings: ~3-11 bytes per record

## [1.1.0] - 2025-12-08

### Added

- **Storage Optimization: HTTP Code Deduplication** (Migration 1.1.0)
  - New `http_codes` lookup table with SMALLINT UNSIGNED IDs
  - Pre-populated with complete IANA HTTP Status Code Registry (62 codes)
  - Special code `id=0` for "N/A" (error logs without HTTP status)
  - `httpCodeService.js` with in-memory cache for all codes
  - Added `code_id` foreign key column to `log_records`
  - Storage savings: ~2-10 bytes per record (20-100MB per 10M records)
- **Storage Optimization Documentation**: `docs/storage-optimization.md`
  - Comprehensive analysis of all three optimization opportunities
  - Implementation strategies and code examples
  - Performance considerations and migration plans
- **Hierarchical Aggregation Design**: `docs/hierarchical-aggregation.md`
  - Complete design for multi-datacenter log forwarding
  - UUID collision detection for batch uniqueness
  - Adaptive batch sizing algorithm
  - Robust idempotency solution with deduplication

### Changed

- `logService.js` updated to use HTTP code lookups
- Server startup pre-loads HTTP code cache
- Updated to SMALLINT UNSIGNED for HTTP codes (was TINYINT - insufficient for codes >255)

### Fixed

- HTTP codes table now includes all IANA-registered codes (was missing 24 codes)
- Corrected descriptions to match IANA standards ("Content Too Large", "Unprocessable Content")

## [1.0.1] - 2025-12-07

### Added

- **API Query Design Documentation**: Comprehensive design for querying log records via REST API
  - `docs/api-querying-design.md` with dual approach strategy
  - Predefined security query patterns (wp-vuln-probe, sql-injection, directory-traversal, etc.)
  - Field-based ad-hoc query support design
  - Three-phase implementation roadmap
  - Security considerations and rate limiting strategies
  - Performance benchmarks and optimization triggers
  - 12 predefined security patterns for botnet/attack detection

### Removed

- Obsolete `schema.sql` file (replaced by automated migration system)

### Fixed

- Lint indentation issues in `src/server.js`

## [1.0.0] - 2025-12-07

### Added

- **Production Release**: First stable release, production-ready
- **Security Hardening**: `.env` file permission validation on startup
  - Checks for 600 or 400 permissions
  - Exits with detailed error if too permissive
  - `SKIP_DOTENV_PERMISSION_CHECK` bypass option for compatibility
- **README Enhancements**:
  - Version, license, Node version, and test status badges
  - Removed development warning
  - Project marked as production-ready

### Changed

- All tests passing (19 tests)
- Code formatting and linting cleanup

## [0.3.0] - 2025-12-07

### Added

- **Rate Limiting**: IP-based request rate limiting before authentication
  - `@fastify/rate-limit` plugin integration
  - Configurable limits (default: 100 requests/minute per IP)
  - Returns 429 with X-RateLimit headers
  - Runs before authentication to save CPU on bcrypt operations
  - Environment variables: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `RATE_LIMIT_CACHE`, `RATE_LIMIT_ALLOWLIST`
  - `docs/rate-limiting.md` - Comprehensive strategy analysis
  - `docs/querying-logs.md` - Database query strategies and security analysis examples

### Changed

- Rate limiting applied before authentication middleware for security optimization

## [0.2.1] - 2025-12-07

### Added

- **API Key Security**: Bcrypt hashing for API keys
  - Keys hashed with 10 salt rounds before storage
  - Authentication uses bcrypt.compare() for secure validation
  - Updated CLI tools to support hashed keys
  - Migration adds `hashed_key` column to `api_keys` table

### Changed

- API key storage moved from plaintext to bcrypt hashed
- CLI tools updated to work with hashed keys

## [0.2.0] - 2025-12-07

### Added

- **Database Migrations**: Custom migration system with version alignment
  - `schema/` directory for versioned SQL migration files
  - `schema_migrations` tracking table
  - Auto-run on server startup (worker 0 only)
  - CLI commands: `schema:migrate`, `schema:status`, `schema:history`
  - Comprehensive documentation in `docs/database-migrations.md`
  - Smart SQL statement parser handling comments and multi-line statements
  - `AUTO_RUN_MIGRATIONS_DISABLED` environment variable

- **Testing System**: Complete API integration tests using Node.js built-in test runner
  - `tests/api.test.js` - Main test suite with quick/complete modes
  - `tests/helpers.js` - Test utilities and fixtures
  - 19 comprehensive tests covering all API endpoints
  - Quick mode (4 smoke tests) and Complete mode (19 tests)
  - npm scripts: `test`, `test:quick`, `test:complete`
  - Support for gzip compression testing
  - Automatic test data cleanup

### Changed

- Empty log array now returns `400 Bad Request` (was accepting empty arrays)
- `PUT /websites/:domain` now returns updated website object (was returning status message only)
- Improved error logging in migration execution with statement-level error reporting

### Fixed

- Migration SQL parsing to handle comments and complex statements properly
- Boolean value handling in tests (MySQL returns `1`/`0` instead of `true`/`false`)

## [0.1.0] - 2025-12-07

### Phase #1 - Core Ingestion & Storage

#### Added

- Initial project structure and documentation
- Requirements specification (`docs/requirements.md`)
- Implementation guide (`docs/implementation.md`)
- Technology stack decisions (Node.js, Fastify, MariaDB, JavaScript)
- API endpoint design (RESTful, root-level routes)
- Data models (websites, log_records, api_keys)
- Authentication strategy (Bearer tokens, no Passport)
- Housekeeping task specifications
- PM2 cluster mode support planning
- CLI tool design for API key management

#### Planned

- Database schema implementation (`schema.sql`)
- Fastify server setup with gzip support
- Bearer token authentication middleware
- Log ingestion endpoint (`POST /logs`)
- Website CRUD endpoints
- Bulk insert optimization
- Domain extraction from `source_file` paths
- API key generation utilities
- CLI tool implementation
- Housekeeping cron jobs
- PM2 configuration
- Environment configuration templates
- Unit and integration tests
- Deployment documentation

---

## Version History

<!-- Versions will be added here as releases are made -->

---

**Note:** Version 1.0.0 released on 2025-12-07. Project is production-ready and deployed.
