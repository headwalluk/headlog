# Headlog

[![Version](https://img.shields.io/badge/version-1.5.1-blue.svg)](https://github.com/headwalluk/headlog/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

**Centralized Apache Log Aggregation System**

A lightweight, high-performance Node.js service for collecting and storing Apache logs from multiple web servers into a central MariaDB database. Built for self-hosted infrastructure with zero cloud dependencies.

---

## What is Headlog?

Headlog replaces brittle shell scripts with a robust JSON-based log pipeline. Fluent Bit agents tail Apache logs on your web servers, parse them to JSON, and push batched records to this central API server via HTTPS. The system automatically discovers new websites, handles compression, and scales horizontally with PM2 cluster mode.

Perfect for organizations managing multiple web servers who want centralized log storage without SaaS lock-in.

---

## 🚧 Current Development

**⚠️ Work In Progress:** Version 2.0.0 is under active development, adding:

- Web-based administration UI
- User authentication and role-based access control
- Security analysis with batch log processing
- Enhanced management interfaces

**📋 Track Progress:** See [dev-notes/project-tracker.md](dev-notes/project-tracker.md) for detailed milestones and task checklists.

---

## Key Features

### Core Functionality

- **Automatic Website Discovery** - New domains detected and tracked automatically
- **High-Performance Ingestion** - Bulk inserts, connection pooling, minimal overhead
- **Hybrid Storage** - Relational data for querying + JSON for raw log preservation
- **Simple Authentication** - API key-based Bearer tokens (no external dependencies)
- **PM2 Cluster Ready** - Horizontal scaling across CPU cores with race-safe operations

### Storage Optimization

- **HTTP Code Deduplication** - 62 IANA codes cached on startup (SMALLINT IDs)
- **Host Deduplication** - Hostname lookup table with in-memory caching
- **Efficient Timestamps** - TIMESTAMP data type (4 bytes vs 8 bytes)
- **Binary UUIDs** - BINARY(16) storage for 58% space savings
- **Result:** 56-264 bytes saved per record (560MB-2.64GB per 10M records)

### Advanced Features

- **Hierarchical Aggregation** - Multi-datacenter log forwarding with tree-like topology
- **Adaptive Batch Sizing** - Automatic adjustment based on upstream performance
- **Idempotent Uploads** - UUID-based deduplication prevents duplicate records
- **Outage Buffering** - Un-archived records retained during upstream failures
- **Automated Housekeeping** - Configurable retention and cleanup policies

## Quick Start

```bash
# Clone and install
git clone https://github.com/headwalluk/headlog.git
cd headlog
npm install

# Configure
cp .env.example .env
# Edit .env with your database credentials

# Setup database
mysql -u root -p < setup_database.sql

# Generate API key
node cli.js keys:create --description "Production"

# Start server
npm start
```

**Full setup guide:** [docs/quickstart.md](docs/quickstart.md)

## Architecture

### Single Instance Deployment

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Web Server 1   │      │  Web Server 2   │      │  Web Server N   │
│  (Fluent Bit)   │      │  (Fluent Bit)   │      │  (Fluent Bit)   │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │ HTTPS + Gzip
                                  ▼
                       ┌──────────────────────┐
                       │   Headlog Server     │
                       │   (PM2 Cluster)      │
                       └──────────┬───────────┘
                                  │
                       ┌──────────▼───────────┐
                       │   MariaDB Database   │
                       └──────────────────────┘
```

### Hierarchical Multi-Datacenter Deployment

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Web Servers    │     │  Web Servers    │     │  Web Servers    │
│  (Fluent Bit)   │     │  (Fluent Bit)   │     │  (Fluent Bit)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
  ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
  │  Regional   │         │  Regional   │         │  Regional   │
  │  Headlog    │         │  Headlog    │         │  Headlog    │
  └──────┬──────┘         └──────┬──────┘         └──────┬──────┘
         │                       │                       │
         └───────────┬───────────┴───────────┬───────────┘
                     │                       │
              ┌──────▼──────┐         ┌──────▼──────┐
              │  National   │         │  National   │
              │  Headlog    │         │  Headlog    │
              └──────┬──────┘         └──────┬──────┘
                     │                       │
                     └───────────┬───────────┘
                                 │
                          ┌──────▼──────┐
                          │   Global    │
                          │   Headlog   │
                          └─────────────┘
```

## Documentation

Complete documentation available in the [`docs/`](docs/) directory:

- **[Quick Start Guide](docs/quickstart.md)** - Get running in 5 minutes
- **[Installation Guide](docs/installation.md)** - Detailed setup for production
- **[Hierarchical Aggregation](docs/hierarchical-aggregation.md)** - Multi-datacenter forwarding

**Additional documentation (coming soon):**

- API Reference - REST API endpoints and usage examples
- CLI Reference - Command-line interface documentation
- Operations Guide - Monitoring, maintenance, and troubleshooting

**Development notes:** See [`dev-notes/`](dev-notes/) for design decisions and implementation details. **Active work tracked in [project-tracker.md](dev-notes/project-tracker.md).**

## System Requirements

- **Node.js:** 18.0.0 or higher
- **Database:** MariaDB 10.3+ or MySQL 5.7+
- **Process Manager:** PM2 (recommended for production)
- **Memory:** 512MB minimum, 1GB+ for high-volume
- **Operating System:** Linux (Ubuntu 22.04, Debian 12 tested)

## CLI Tools

```bash
# API Key Management
node cli.js keys:create --description "Production servers"
node cli.js keys:list
node cli.js keys:deactivate <id>
node cli.js keys:delete <id>

# Database Migrations
node cli.js schema:status
node cli.js schema:migrate
node cli.js schema:history
```

## API Endpoints

### Public (No Authentication)

- `GET /health` - Health check

### Authenticated (Bearer Token)

- `POST /api/logs` - Ingest log records (bulk)
- `GET /api/logs` - Query logs (Phase 2)
- `GET /api/websites` - List discovered websites

See [dev-notes/api-usage.md](dev-notes/api-usage.md) for technical API details.

## Performance

Tested on a 2-core VPS with 2GB RAM:

- **Ingestion Rate:** 10,000+ records/second
- **Storage Efficiency:** 56-264 bytes saved per record
- **Query Performance:** Indexed queries <50ms for millions of records
- **PM2 Cluster:** Linear scaling across CPU cores
- **Memory Usage:** ~150MB per worker process

## Storage Optimizations

| Optimization | Space Saved             | Details                          |
| ------------ | ----------------------- | -------------------------------- |
| HTTP Codes   | 2 bytes/record          | VARCHAR(3) → SMALLINT lookup     |
| Host Names   | 50-250 bytes/record     | VARCHAR(255) → SMALLINT lookup   |
| Timestamps   | 4 bytes/record          | DATETIME → TIMESTAMP             |
| Batch UUIDs  | ~21 bytes/uuid          | VARCHAR(36) → BINARY(16)         |
| **Total**    | **56-264 bytes/record** | **560MB-2.64GB per 10M records** |

## Technology Stack

- **Runtime:** Node.js 18+
- **Web Framework:** Fastify (high performance)
- **Database:** MariaDB with connection pooling
- **Process Manager:** PM2 (cluster mode)
- **Log Shipper:** Fluent Bit (on web servers)
- **Dependencies:** Minimal - no ORMs, raw SQL for transparency

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## Contributing

Development documentation and design notes available in [`dev-notes/`](dev-notes/).

## Support

- **Issues:** [GitHub Issues](https://github.com/headwalluk/headlog/issues)
- **Documentation:** [docs/README.md](docs/README.md)
- **Development:** [dev-notes/](dev-notes/)

## Version History

- **v1.5.1** (2025-12-08) - Fix timestamp extraction bug
- **v1.5.0** (2025-12-08) - Hierarchical aggregation core implementation
- **v1.3.0** (2025-12-08) - Storage optimizations complete
- **v1.2.1** (2025-12-08) - Drop legacy host column
- **v1.2.0** (2025-12-08) - Host deduplication with race-safe operations
- **v1.1.1** (2025-12-08) - Drop legacy HTTP code column
- **v1.1.0** (2025-12-08) - HTTP codes optimization with IANA registry
- **v1.0.1** (2025-12-07) - Initial production release

Full changelog: [CHANGELOG.md](CHANGELOG.md)
