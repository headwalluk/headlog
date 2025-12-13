# Quick Start Guide

Get Headlog running in 5 minutes.

## Prerequisites

- Node.js 18+
- MariaDB 10.3+ (or MySQL 5.7+)
- npm or yarn

## Installation

```bash
# Clone the repository
git clone https://github.com/headwalluk/headlog.git
cd headlog

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials
```

## Database Setup

```bash
# Log into MySQL/MariaDB as root
mysql -u root -p

# Create database and user
CREATE DATABASE headlog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'headlog_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON headlog.* TO 'headlog_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## Generate API Key

```bash
node cli.js keys:create --description "Development testing"
```

Save the generated key - you'll need it for Fluent Bit configuration.

## Start Development Server

```bash
npm start
```

The server will:

- Run automatic database migrations
- Load HTTP code and host caches
- Start on port 3000 (or PORT from .env)

## Test the API

**Health check (no auth required):**

```bash
curl http://localhost:3000/health
```

**Ingest a test log:**

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '[{
    "source_file": "/var/www/example.com/log/access.log",
    "host": "test-server",
    "log_timestamp": "2025-12-08T12:00:00.000000Z",
    "remote": "127.0.0.1",
    "method": "GET",
    "path": "/test",
    "code": "200"
  }]'
```

**List websites:**

```bash
curl http://localhost:3000/websites \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

## Next Steps

- **Production deployment:** See [Installation Guide](installation.md) for PM2 setup
- **Hierarchical aggregation:** See [Hierarchical Aggregation](hierarchical-aggregation.md) for multi-datacenter forwarding
- **Configure Fluent Bit:** See Fluent Bit section in [Installation Guide](installation.md)

## Troubleshooting

**Database connection fails:**

- Check credentials in `.env`
- Verify MariaDB is running: `systemctl status mariadb`

**Port already in use:**

- Change `PORT` in `.env`
- Check what's using the port: `lsof -i :3000`

**Migration errors:**

- Check database user has `CREATE` permission
- View migration status: `node cli.js schema:status`
