# Headlog

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/headwalluk/headlog/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-19%20passing-success.svg)](tests/)

**Centralised Apache Log Aggregation System**

A lightweight, high-performance Node.js service for collecting and storing Apache access and error logs from multiple web servers into a central MariaDB database. Built for simplicity, speed, and self-hosted infrastructure.

---

## Overview

Headlog replaces brittle shell scripts with a robust JSON-based log pipeline. Fluent Bit agents tail Apache logs on your web servers, parse them to JSON, and push batched records to this central API server via HTTP(S). The system automatically discovers new websites, handles compression, and scales horizontally with PM2 cluster mode.

**Key Features:**

- **Automatic Website Discovery** - New domains are detected and tracked automatically
- **High-Performance Ingestion** - Bulk inserts, connection pooling, and minimal overhead
- **Flexible Schema** - Hybrid relational/JSON storage for both querying and raw log access
- **Simple Authentication** - API key-based Bearer token auth (no external dependencies)
- **Housekeeping Automation** - Configurable log retention and inactive site cleanup
- **PM2 Cluster Ready** - Horizontal scaling across CPU cores with proper task coordination
- **Zero Cloud Dependencies** - Fully self-hosted, no SaaS lock-in

---

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Web Server 1   │      │  Web Server 2   │      │  Web Server N   │
│  (Fluent Bit)   │      │  (Fluent Bit)   │      │  (Fluent Bit)   │
│  ~50 websites   │      │  ~50 websites   │      │  ~50 websites   │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         │ HTTPS + Gzip           │ HTTPS + Gzip           │ HTTPS + Gzip
         │ Bearer Token           │ Bearer Token           │ Bearer Token
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │   Headlog API        │
                       │   (Node.js/Fastify)  │
                       │   PM2 Cluster Mode   │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │   MariaDB Database   │
                       │   (NVMe Storage)     │
                       │   - websites         │
                       │   - log_records      │
                       │   - api_keys         │
                       └──────────────────────┘
```

**Data Flow:**

1. Fluent Bit tails `/var/www/*/log/*.log` files on each web server
2. Logs are parsed to JSON, enriched with metadata (hostname, source_file)
3. Batched records are compressed (gzip) and sent via HTTP POST
4. Headlog authenticates, extracts domains, auto-creates website records
5. Bulk insert into MariaDB with indexed columns + full JSON storage
6. Housekeeping tasks periodically purge old data

---

## Technology Stack

- **Runtime:** Node.js 18+ (JavaScript, no TypeScript)
- **Framework:** Fastify (high-performance, native compression)
- **Database:** MariaDB with JSON column support
- **Process Manager:** PM2 (cluster mode)
- **Log Agents:** Fluent Bit (compiled from source on Debian)
- **Authentication:** Bearer tokens (custom implementation, no Passport)

**Dependencies:**

- `fastify` - Web framework
- `@fastify/compress` - Gzip handling
- `mysql2` - MariaDB driver
- `dotenv` - Environment config
- `node-cron` - Scheduled tasks
- `commander` - CLI tool

**Philosophy:** Minimal dependencies, no ORMs, raw SQL for transparency and performance.

---

## Quick Start

### 1. Prerequisites

```bash
# MariaDB 10.3+ (or MySQL 5.7+)
# Node.js 18+
# PM2 (optional for production)
```

### 2. Installation

```bash
git clone https://github.com/headwalluk/headlog.git
cd headlog
npm install
```

### 3. Configuration

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Database Setup

```bash
mysql -u root -p < schema.sql
```

### 5. Generate API Key

```bash
node cli.js keys:create --description "Production servers"
# Copy the generated key for Fluent Bit configuration
```

### 6. Start Server

```bash
# Development
node src/server.js

# Production (PM2)
pm2 start ecosystem.config.js
pm2 save
```

### 7. Configure Fluent Bit

Update `/etc/fluent-bit/fluent-bit.conf` on your web servers with the API endpoint and key. See `docs/implementation.md` for complete configuration.

---

## API Endpoints

All endpoints require Bearer token authentication:

```
Authorization: Bearer <your_api_key>
```

### Log Ingestion

- `POST /logs` - Ingest batched log records (gzip supported)

### Website Management

- `GET /websites` - List all websites
- `GET /websites/:domain` - Get website details
- `PUT /websites/:domain` - Update website metadata
- `DELETE /websites/:domain` - Delete website and logs

### Log Querying (Phase #2)

- `GET /logs` - Query logs with filtering and pagination

See `docs/requirements.md` for complete API documentation.

---

## CLI Tools

### API Key Management

```bash
# Create new key
node cli.js keys:create --description "Staging servers"

# List all keys
node cli.js keys:list

# Deactivate key
node cli.js keys:deactivate <key_id>

# Delete key
node cli.js keys:delete <key_id>

# Show key statistics
node cli.js keys:stats <key_id>
```

---

## Configuration

Environment variables (`.env` file):

```bash
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=headlog
DB_USER=headlog_user
DB_PASSWORD=secure_password

# Server
PORT=3000
NODE_ENV=production

# Housekeeping
LOG_RETENTION_DAYS=30          # Purge logs older than N days
INACTIVE_WEBSITE_DAYS=45       # Delete websites with no activity

# Logging
LOG_LEVEL=info
```

---

## Housekeeping

Automated maintenance tasks (run on PM2 worker 0 only):

- **Daily 2:00 AM** - Purge logs older than `LOG_RETENTION_DAYS`
- **Daily 3:00 AM** - Delete websites inactive for `INACTIVE_WEBSITE_DAYS`
- **Weekly Sunday 4:00 AM** - API key statistics cleanup

---

## Project Status

**Current Phase:** Phase #1 - Core Ingestion & Storage (Complete)

✅ Requirements specification complete  
✅ Initial implementation complete (v1.0.1)  
✅ Production deployment active  
✅ Storage optimizations complete (v1.3.0)

**Storage Optimizations:**
- Host deduplication using lookup table (~50-250 bytes/record saved)
- HTTP code deduplication with IANA registry (~2-10 bytes/record saved)
- DATETIME → TIMESTAMP conversion (4 bytes/record saved)
- **Total: ~56-264 bytes per record (560MB-2.64GB per 10M records)**

See [`docs/storage-optimization.md`](docs/storage-optimization.md) for technical details.

**Phase #2 (Future):**

- Log analysis and pattern detection
- Failed login tracking
- Bot detection and automated actions
- IP blacklisting integration
- Advanced querying capabilities

---

## Project Tracker: Hierarchical Aggregation (v1.5.0)

Multi-datacenter log forwarding with hierarchical topology. See [`docs/hierarchical-aggregation.md`](docs/hierarchical-aggregation.md) for complete design.

### Phase 1: Core Implementation (v1.5.0)

**Database Schema:**
- [ ] Add `archived_at` TIMESTAMP column to `log_records`
- [ ] Create `upstream_sync_batches` table (batch UUID, status, timestamps)
- [ ] Add `upstream_batch_uuid` column to `log_records`
- [ ] Create `batch_deduplication` table for upstream instances
- [ ] Write migration script (1.5.0-hierarchical-aggregation.sql)

**Configuration:**
- [ ] Add upstream config to `src/config/index.js`
  - `UPSTREAM_ENABLED`, `UPSTREAM_SERVER`, `UPSTREAM_API_KEY`
  - `UPSTREAM_BATCH_SIZE`, `UPSTREAM_BATCH_INTERVAL`
  - `UPSTREAM_BATCH_SIZE_MIN`, `UPSTREAM_BATCH_SIZE_RECOVERY`
  - `UPSTREAM_COMPRESSION`

**Core Sync Service:**
- [ ] Create `src/services/upstreamSyncService.js`
  - `getUnArchivedRecords()` - Query pending logs
  - `getAdaptiveBatchSize()` - Dynamic batch sizing
  - `reduceBatchSize()` / `increaseBatchSize()` - Adaptive algorithm
  - `postToUpstream()` - HTTP POST with compression
  - `markRecordsArchived()` - Update archived_at timestamps
  - `performUpstreamSync()` - Main sync orchestration with batch tracking
  - UUID collision check with retry logic

**Cron Task:**
- [ ] Create `src/tasks/upstreamSync.js`
  - `isNextBatchUploadDue()` - Interval throttling
  - `performUpstreamSyncIfDue()` - Cron entry point
- [ ] Register cron task in `src/housekeeping/tasks.js` (worker 0 only)

**Upstream Deduplication:**
- [ ] Add batch deduplication logic to `POST /logs` handler
  - Check `batch_deduplication` table
  - Insert new batch records
  - Return success for duplicate batches

**Housekeeping:**
- [ ] Modify purge logic to respect `archived_at` when upstream enabled
  - Only purge: `archived_at IS NOT NULL AND older than LOG_RETENTION_DAYS`
  - Un-archived records buffered indefinitely during outages

**Testing:**
- [ ] Unit tests for adaptive batch sizing
- [ ] Unit tests for UUID collision handling
- [ ] Integration test: two headlog instances (regional → central)
- [ ] Test network failure scenarios and retry logic
- [ ] Test duplicate batch rejection on upstream

**Documentation:**
- [ ] Update `QUICKSTART.md` with hierarchy setup instructions
- [ ] Update `docs/deployment-checklist.md` with upstream configuration
- [ ] Add example configurations (regional, central, standalone)

### Phase 2: Enhanced Features (v1.6.0)

- [ ] CLI command to retry specific failed batches
- [ ] Automatic retry of failed batches after cooldown period
- [ ] Dashboard/endpoint for viewing batch sync status
- [ ] Automatic cleanup of old completed batches
- [ ] Automatic cleanup of old deduplication records
- [ ] Configurable retention periods for batch metadata

### Phase 3: Advanced Features (v1.7.0)

- [ ] Extend `/health` endpoint with upstream sync status
- [ ] Prometheus metrics export for monitoring
- [ ] Schema version validation in batch metadata
- [ ] Per-API-key `can_forward_logs` authorization flag

---

## Documentation

- [`docs/requirements.md`](docs/requirements.md) - Complete requirements specification
- [`docs/implementation.md`](docs/implementation.md) - Implementation guide and code examples
- [`CHANGELOG.md`](CHANGELOG.md) - Version history and changes

---

## License

See [LICENSE](LICENSE) file for details.

---

## Contributing

This is a personal/internal project. If you have suggestions or find issues, feel free to open an issue or pull request.

---

## Author

**Paul Faulkner**  
Headwall Hosting
https://headwall-hosting.com
