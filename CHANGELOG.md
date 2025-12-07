# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

**Note:** This project is currently in active development. Version 1.0.0 will be released when Phase #1 is complete and production-ready.
