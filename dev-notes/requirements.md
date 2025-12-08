# Project Requirements: Centralised Apache Logging System

## Overview

A lightweight, self-hosted system to aggregate Apache Access and Error logs from multiple web servers into a central MariaDB database. The goal is to replace brittle Bash/grep scripts with a robust, structured JSON pipeline using Fluent Bit and Node.js.

This document covers **Phase #1**: Building a stable, high-performance log ingestion and storage system.

**Phase #2** (future): Analysis, pattern detection, automated actions (bot tracking, firewall updates, alerts), and rate limiting.

---

## Architecture

### 1. Log Agents (Sources)

- **Software:** Fluent Bit (compiled from source)
- **OS:** Debian Linux
- **Scope:** ~10 servers, each hosting ~50 websites
- **Log Location:** `/var/www/*/log/access.log` and `/var/www/*/log/error.log`
- **Role:** Tail logs, parse to JSON, inject metadata (hostname, source_file), batch, compress (gzip), and push via HTTP

### 2. Log Receiver (Central)

- **Software:** Node.js with Fastify framework
- **Role:**
  - Receive batched JSON payloads via HTTP POST
  - Authenticate requests using Bearer tokens (API keys)
  - Parse `source_file` field to identify websites
  - Auto-create website records when new domains are detected
  - Perform high-performance bulk inserts into MariaDB
- **Network:** Must handle Gzip compressed payloads
- **Process Management:** PM2 in Cluster mode

### 3. Storage

- **Database:** MariaDB (self-hosted, NVMe storage)
- **Schema Strategy:** Hybrid Relational/JSON
  - Core indexed fields (timestamp, host, code, website_id) as relational columns
  - Full structured log record stored as JSON column for flexibility
  - See Database Schema section below

---

## Data Models

### Website

Represents a website/domain being monitored. Auto-created when logs are received for unknown domains.

**Fields:**

- `id` (primary key, auto-increment)
- `domain` (varchar, unique, indexed) - extracted from source_file path
- `is_ssl` (boolean, default: true)
- `is_dev` (boolean, default: false)
- `owner_email` (varchar, nullable)
- `admin_email` (varchar, nullable)
- `last_activity_at` (timestamp) - updated on each log ingestion
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Log Source Types

Each website has two distinct log sources:

- **Access Logs** - HTTP request logs (method, path, status code, etc.)
- **Error Logs** - Apache error messages (level, pid, client, message)

Log type is determined by parsing the `source_file` field:

- `/var/www/{domain}/log/access.log` → Access log
- `/var/www/{domain}/log/error.log` → Error log

**Domain Extraction Example:**

- `source_file: /var/www/example.com/log/access.log` → `domain: example.com`
- `source_file: /var/www/subdomain.example.org/log/error.log` → `domain: subdomain.example.org`

### Log Records

All ingested log entries, regardless of type.

**Relational Columns (indexed):**

- `id` (primary key, auto-increment)
- `website_id` (foreign key to websites table, ON DELETE CASCADE)
- `log_type` (enum: 'access', 'error')
- `timestamp` (datetime, indexed) - extracted from Fluent Bit timestamp
- `host` (varchar) - source server hostname
- `code` (varchar, nullable) - HTTP status code (access logs only)
- `remote` (varchar, nullable, indexed) - client IP address
- `created_at` (timestamp) - when record was inserted

**JSON Column:**

- `raw_data` (JSON) - complete log record as received from Fluent Bit

**Important:** Strict foreign key constraint with CASCADE DELETE ensures log records are automatically deleted when their parent website is removed.

### API Keys

Authentication tokens for log sources.

**Fields:**

- `id` (primary key, auto-increment)
- `key` (varchar(40), unique, indexed) - alphanumeric (a-z, A-Z, 0-9), 40 characters
- `description` (text, nullable) - human-readable label
- `is_active` (boolean, default: true)
- `last_used_at` (timestamp, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Key Requirements:**

- Format: Alphanumeric only (uppercase + lowercase + digits)
- Length: 40 characters
- Generated securely (crypto.randomBytes)
- Multiple sources can share the same key
- Keys can be deactivated without deletion

---

## API Endpoints

**Authentication:**
All endpoints require authentication via Bearer token in the `Authorization` header.

- Format: `Authorization: Bearer <api_key>`
- No unauthenticated requests are permitted

**API Design:**

- Root-level routes (no `/api/` prefix) - this is a dedicated API service
- RESTful resource-based endpoints
- Standard HTTP verbs match intent

---

### POST /logs

Primary ingestion endpoint for Fluent Bit agents.

**Request:**

- Content-Type: `application/json` or `application/x-gzip`
- Body: Array of log record objects (may be gzip compressed)
- Each record must contain:
  - `source_file` (string) - original log file path
  - `host` (string) - source server hostname
  - Additional fields vary by log type (see examples below)

**Example Access Log Record:**

```json
{
  "remote": "203.0.113.45",
  "user": "-",
  "method": "GET",
  "path": "/wp-admin/js/user-profile.min.js?ver=6.9",
  "protocol": "HTTP/1.1",
  "code": "200",
  "size": "3632",
  "referer": "https://example.com/wp-login.php",
  "agent": "Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0",
  "source_file": "/var/www/example.com/log/access.log",
  "host": "web-server-01"
}
```

**Example Error Log Record:**

```json
{
  "time": "Dec 07 15:10:11.942253 2025",
  "level": "proxy_fcgi:error",
  "pid": "78913:tid 78913",
  "client": "203.0.113.45:0",
  "message": "AH01071: Got error 'PHP message: Always allow', referer: https://example.com/wp-login.php",
  "source_file": "/var/www/example.com/log/error.log",
  "host": "web-server-01"
}
```

**Response:**

- `200 OK` - Logs accepted and queued for insertion
  ```json
  { "status": "ok", "received": 25 }
  ```
- `400 Bad Request` - Malformed payload
- `401 Unauthorized` - Invalid or missing API key
- `500 Internal Server Error` - Database or processing error

**Processing Logic:**

1. Validate API key
2. Update `api_keys.last_used_at`
3. Decompress payload if gzipped
4. For each log record:
   - Parse `source_file` to extract domain
   - Determine log type (access/error) from filename
   - Find or create website record (auto-creation)
   - Update `websites.last_activity_at`
   - Prepare bulk insert
5. Execute bulk insert into log_records table
6. Return success response

**Error Handling:**

- Malformed records: Log to console.error(), skip record, continue processing batch
- PM2 will capture console output to log files

---

### GET /logs

Query log records with filtering and pagination. _(Phase #2)_

**Query Parameters:**

- `website` - Filter by domain
- `log_type` - Filter by 'access' or 'error'
- `start_date` / `end_date` - Time range
- `host` - Filter by source server
- `remote` - Filter by client IP
- `code` - Filter by HTTP status code
- `limit` / `offset` - Pagination

**Response:**

- `200 OK` - Returns array of log records with metadata

---

### GET /websites

List all websites.

**Query Parameters:**

- `active` (boolean) - Filter by recent activity
- `limit` / `offset` - Pagination

**Response:**

- `200 OK` - Returns array of website objects
  ```json
  {
    "total": 47,
    "websites": [
      {
        "id": 1,
        "domain": "example.com",
        "is_ssl": true,
        "is_dev": false,
        "owner_email": "owner@example.com",
        "admin_email": "admin@example.com",
        "last_activity_at": "2025-12-07T14:23:11Z",
        "created_at": "2025-11-01T09:15:00Z"
      }
    ]
  }
  ```

---

### GET /websites/:domain

Get details for a specific website.

**Response:**

- `200 OK` - Returns website object
- `404 Not Found` - Website does not exist

---

### PUT /websites/:domain

Update website metadata (email addresses, flags, etc.).

**Request:**

- Content-Type: `application/json`
- Body: Partial website object
  ```json
  {
    "owner_email": "newowner@example.com",
    "is_dev": true
  }
  ```

**Response:**

- `200 OK` - Website updated successfully
- `404 Not Found` - Website does not exist

**Note:** Websites are auto-created on first log ingestion, so manual creation via POST is not needed.

---

### DELETE /websites/:domain

Delete a website and all associated log records (cascade).

**Response:**

- `200 OK` - Website deleted successfully
- `404 Not Found` - Website does not exist

**Warning:** This permanently deletes the website and all its log records due to foreign key cascade.

---

## CLI Tool: API Key Management

A command-line utility for managing API keys in the database.

**Commands:**

```bash
# Generate and store a new API key
node cli.js keys:create [--description "Production web servers"]

# List all API keys
node cli.js keys:list [--show-inactive]

# Deactivate a key
node cli.js keys:deactivate <key_id>

# Reactivate a key
node cli.js keys:activate <key_id>

# Delete a key permanently
node cli.js keys:delete <key_id>

# Show usage statistics for a key
node cli.js keys:stats <key_id>
```

**Output Format:**

- Table format for lists
- Show key (or last 8 chars), description, status, last_used_at, created_at
- Success/error messages for mutations

---

## PM2 Cluster Mode Integration

The application must support PM2 cluster mode for horizontal scaling.

**Requirements:**

- Multiple worker processes can run simultaneously
- All workers can accept HTTP requests
- Housekeeping tasks run ONLY on worker 0
- Check: `process.env.NODE_APP_INSTANCE === '0'`

**Cluster-Safe Operations:**

- Log ingestion: All workers (stateless, database handles concurrency)
- Housekeeping: Worker 0 only (scheduled tasks)

---

## Housekeeping Tasks

Background maintenance operations to keep the system healthy.

### Schedule

- Use cron-like scheduling (e.g., node-cron or similar)
- Run only on `NODE_APP_INSTANCE === '0'`

### Tasks

**1. Purge Old Logs**

- Schedule: Daily at 2:00 AM
- Action: Delete log_records older than retention period
- Retention Period: Configurable via `.env`, default 30 days
- SQL: `DELETE FROM log_records WHERE created_at < NOW() - INTERVAL ? DAY`

**2. Delete Inactive Websites**

- Schedule: Daily at 3:00 AM
- Action: Delete websites with no recent activity
- Threshold: Configurable via `.env`, default 45 days
- SQL: `DELETE FROM websites WHERE last_activity_at < NOW() - INTERVAL ? DAY`
- Cascade: CASCADE DELETE automatically removes associated log_records due to foreign key constraint
- **Rationale:** Default settings (45-day inactive threshold, 30-day log retention) mean logs are purged before website deletion. However, if admins configure inactive threshold < log retention (e.g., 20 days inactive, 30 days logs), the foreign key cascade ensures orphaned logs are properly cleaned up when the website is deleted.

**3. Clean Up API Key Stats**

- Schedule: Weekly (Sunday at 4:00 AM)
- Action: Update statistics, potentially archive old keys

---

## Configuration

All configuration via environment variables (`.env` file).

**Required:**

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
LOG_RETENTION_DAYS=30          # How long to keep log records
INACTIVE_WEBSITE_DAYS=45       # Delete websites with no activity
```

**Optional:**

```bash
# PM2
NODE_APP_INSTANCE=0            # Set by PM2 automatically

# Logging
LOG_LEVEL=info                 # debug, info, warn, error
```

---

## Key Constraints & Preferences

- **Performance:**
  - Agents use minimal RAM
  - Receiver handles high throughput via batching
  - Bulk inserts for efficiency
  - Indexed queries for common access patterns

- **Maintenance:**
  - Agents auto-detect new websites (wildcard input)
  - No configuration changes or restarts needed for new websites
  - CLI tool for easy API key management

- **Security:**
  - Bearer token authentication required for ALL endpoints
  - API keys stored securely in database
  - Service runs as `www-data` user where possible
  - No unauthenticated access permitted

- **Infrastructure:**
  - Everything self-hosted
  - No external cloud logging services
  - No third-party SaaS dependencies

- **Simplicity:**
  - Phase #1 focuses solely on ingestion and storage
  - No dashboards, alerts, or complex analysis yet
  - Rate limiting deferred to Phase #2
  - Keep models simple and focused

---

## Out of Scope (Phase #2)

The following features are explicitly deferred to Phase #2:

- Log analysis and pattern detection
- Failed login attempt tracking
- Bot detection and reporting
- Automated firewall updates (IP blacklisting)
- External API integrations for alerts
- Rate limiting on ingestion endpoint
- Web-based dashboard or UI
- Real-time streaming or WebSocket updates
- Multi-tenancy or user authentication
- Advanced querying or search interfaces
