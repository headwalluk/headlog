# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
