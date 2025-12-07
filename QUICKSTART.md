# Quick Start Guide

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Create Database and Schema

```bash
# Log into MySQL/MariaDB as root
mysql -u root -p

# Create database and user
CREATE DATABASE headlog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'headlog_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON headlog.* TO 'headlog_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Import schema
mysql -u headlog_user -p headlog < schema.sql
```

### 4. Generate Initial API Key

```bash
node cli.js keys:create --description "Development testing"
```

Save the generated key - you'll need it for testing!

### 5. Start Development Server

```bash
npm start
# or for auto-reload during development:
npm install -g nodemon
nodemon src/server.js
```

### 6. Test the API

**Health Check (no auth):**

```bash
curl http://localhost:3000/health
```

**Ingest Test Log:**

```bash
curl -X POST http://localhost:3000/logs \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '[{
    "source_file": "/var/www/example.com/log/access.log",
    "host": "test-server",
    "remote": "127.0.0.1",
    "method": "GET",
    "path": "/test",
    "code": "200"
  }]'
```

**List Websites:**

```bash
curl http://localhost:3000/websites \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

## Production Deployment

### 1. Install PM2 globally

```bash
npm install -g pm2
```

### 2. Create production ecosystem configuration

```bash
# Copy the sample ecosystem file
cp ecosystem-sample.config.js ecosystem.config.js

# Edit ecosystem.config.js to customize:
# - Number of instances (or leave as 'max' for all CPUs)
# - Memory limits
# - Log file locations
# - Any environment variables
```

**Note**: `ecosystem.config.js` is gitignored to keep production settings private.

### 3. Configure environment

Create a production `.env` file with your database credentials:

```bash
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=headlog
DB_USER=headlog_user
DB_PASSWORD=your_secure_password

PORT=3010
HOST=0.0.0.0

# Housekeeping
LOG_RETENTION_DAYS=90
INACTIVE_WEBSITE_DAYS=180

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW=1 minute

# Logging
LOG_LEVEL=warn
```

### 4. Run database migrations

```bash
# Migrations will auto-run on first startup, or run manually:
npm run migrate
```

### 5. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions for auto-start on boot
```

### 6. Monitor

```bash
pm2 status
pm2 logs headlog
pm2 monit
```

### 7. Set up reverse proxy (recommended)

**Nginx configuration example:**

```nginx
upstream headlog {
    server 127.0.0.1:3010;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name logs.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Rate limiting at nginx level (additional protection)
    limit_req_zone $binary_remote_addr zone=headlog:10m rate=10r/s;

    location / {
        limit_req zone=headlog burst=20 nodelay;

        proxy_pass http://headlog;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## CLI Commands

```bash
# Create new API key
node cli.js keys:create --description "Production servers"

# List all keys
node cli.js keys:list

# Include inactive keys
node cli.js keys:list --show-inactive

# Deactivate key
node cli.js keys:deactivate 1

# Reactivate key
node cli.js keys:activate 1

# Delete key permanently
node cli.js keys:delete 1

# Show key statistics
node cli.js keys:stats 1
```

## Troubleshooting

**Database connection fails:**

- Check credentials in `.env`
- Verify MariaDB is running: `systemctl status mariadb`
- Test connection: `mysql -u headlog_user -p headlog`

**Port already in use:**

- Change PORT in `.env`
- Check what's using port 3000: `lsof -i :3000`

**PM2 not starting:**

- Check logs: `pm2 logs headlog`
- Verify .env exists and is readable
- Check file permissions

## Next Steps

1. Configure Fluent Bit on your web servers (see `docs/implementation.md`)
2. Update Fluent Bit OUTPUT section with your server IP and API key
3. Monitor logs: `pm2 logs headlog`
4. Set up reverse proxy (nginx) with SSL for production
