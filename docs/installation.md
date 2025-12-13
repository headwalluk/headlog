# Installation Guide

Complete guide for installing and configuring Headlog for production use.

## System Requirements

- **Node.js:** 18.0.0 or higher
- **Database:** MariaDB 10.3+ or MySQL 5.7+
- **Process Manager:** PM2 (recommended for production)
- **Operating System:** Linux (tested on Ubuntu 22.04, Debian 12)
- **Memory:** 512MB minimum, 1GB+ recommended for high-volume deployments
- **Disk:** Depends on log retention policy (500MB-50GB typical)

## Installation

### 1. Install Dependencies

```bash
# Clone repository
git clone https://github.com/headwalluk/headlog.git
cd headlog

# Install Node.js dependencies
npm install

# Install PM2 globally for production
npm install -g pm2
```

### 2. Database Setup

```bash
# Log into MySQL/MariaDB as root
mysql -u root -p
```

```sql
-- Create database with UTF-8 support
CREATE DATABASE headlog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create dedicated user
CREATE USER 'headlog_user'@'localhost' IDENTIFIED BY 'your_secure_password';

-- Grant required permissions
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON headlog.* TO 'headlog_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Security Note:** Use a strong password and store it securely. Consider using environment-specific passwords for production.

### 3. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Set appropriate permissions (readable only by app user)
chmod 600 .env
```

Edit `.env` with your configuration:

```dotenv
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=headlog
DB_USER=headlog_user
DB_PASSWORD=your_secure_password

# Server Configuration
PORT=3010
NODE_ENV=production

# Housekeeping Configuration
LOG_RETENTION_DAYS=90        # Purge logs older than 90 days
INACTIVE_WEBSITE_DAYS=180    # Delete websites inactive for 180 days

# Logging
LOG_LEVEL=warn               # Options: error, warn, info, debug

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=300           # 300 requests per window
RATE_LIMIT_WINDOW='1 minute'
RATE_LIMIT_CACHE=10000
RATE_LIMIT_ALLOWLIST=127.0.0.1,::1

# Security
SKIP_DOTENV_PERMISSION_CHECK=false

# Migrations
AUTO_RUN_MIGRATIONS_DISABLED=false
```

### 4. Database Migrations

Migrations run automatically on startup, or run manually:

```bash
# Check migration status
node cli.js schema:status

# Run migrations manually
node cli.js schema:migrate

# View migration history
node cli.js schema:history
```

### 5. Generate API Keys

```bash
# Create API key for production use
node cli.js keys:create --description "Production Fluent Bit agents"

# List all keys
node cli.js keys:list
```

**Save the generated API key securely** - you'll need it for Fluent Bit configuration.

## PM2 Configuration

### 1. Create Ecosystem File

```bash
# Copy sample configuration
cp ecosystem-sample.config.js ecosystem.config.js
```

Edit `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'headlog',
      script: './src/server.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
      max_memory_restart: '500M',
      wait_ready: true,
      listen_timeout: 10000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
```

**Note:** `ecosystem.config.js` is gitignored to keep production settings private.

### 2. Create Log Directory

```bash
mkdir -p logs
```

### 3. Start with PM2

```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup auto-start on system boot
pm2 startup
# Follow the instructions displayed
```

### 4. Verify Running

```bash
# Check status
pm2 status

# View logs
pm2 logs headlog

# Monitor in real-time
pm2 monit
```

## Reverse Proxy Setup (Recommended)

### Nginx Configuration

```nginx
upstream headlog {
    server 127.0.0.1:3010;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name logs.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/logs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/logs.yourdomain.com/privkey.pem;

    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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

        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name logs.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/headlog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Fluent Bit Configuration

Configure Fluent Bit on your web servers to forward Apache logs.

### Install Fluent Bit

```bash
# Ubuntu/Debian
curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh

# Start service
sudo systemctl enable fluent-bit
sudo systemctl start fluent-bit
```

### Configure Apache Log Parsing

Create `/etc/fluent-bit/parsers.conf`:

```ini
[PARSER]
    Name   apache_access
    Format regex
    Regex  ^(?<remote>[^ ]*) [^ ]* (?<user>[^ ]*) \[(?<time>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^\"]*?)(?: +(?<protocol>\S*))?)?\"  (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^\"]*)" "(?<agent>[^\"]*)")?$
    Time_Key time
    Time_Format %d/%b/%Y:%H:%M:%S %z

[PARSER]
    Name   apache_error
    Format regex
    Regex  ^\[(?<time>[^\]]*)\] \[(?<level>[^\]]*)\] (?<message>.*)$
    Time_Key time
    Time_Format %a %b %d %H:%M:%S.%L %Y
```

### Configure Fluent Bit Input and Output

Create `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush        5
    Daemon       Off
    Log_Level    info
    Parsers_File parsers.conf

# Access logs
[INPUT]
    Name              tail
    Path              /var/www/*/log/access.log
    Parser            apache_access
    Tag               apache.access
    Refresh_Interval  5
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

# Error logs
[INPUT]
    Name              tail
    Path              /var/www/*/log/error.log
    Parser            apache_error
    Tag               apache.error
    Refresh_Interval  5
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

# Output to Headlog
[OUTPUT]
    Name  http
    Match *
    Host  logs.yourdomain.com
    Port  443
    URI   /api/logs
    Format json
    Header Authorization Bearer YOUR_API_KEY_HERE
    tls   On
    tls.verify On
    Retry_Limit 3
```

Restart Fluent Bit:

```bash
sudo systemctl restart fluent-bit
sudo systemctl status fluent-bit
```

## Verification

### 1. Check Headlog Logs

```bash
pm2 logs headlog --lines 50
```

You should see:

- Database connection success
- HTTP codes cache loaded
- Host cache pre-warmed
- Housekeeping tasks enabled (worker 0)

### 2. Test API Health

```bash
curl https://logs.yourdomain.com/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### 3. Check Log Ingestion

```bash
# View websites discovered
curl https://logs.yourdomain.com/api/websites \
  -H "Authorization: Bearer YOUR_API_KEY"

# Check database directly
mysql -u headlog_user -p headlog -e "SELECT COUNT(*) FROM log_records;"
```

## Maintenance

### PM2 Commands

```bash
# Restart application
pm2 restart headlog

# Stop application
pm2 stop headlog

# View logs (last 100 lines)
pm2 logs headlog --lines 100

# Monitor resources
pm2 monit

# Update after code changes
git pull
npm install
pm2 restart headlog
```

### Database Maintenance

```bash
# Check database size
mysql -u headlog_user -p headlog -e "
SELECT
  table_name,
  ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = 'headlog'
ORDER BY (data_length + index_length) DESC;"

# View record counts
mysql -u headlog_user -p headlog -e "
SELECT
  'log_records' AS table_name, COUNT(*) AS count FROM log_records
UNION ALL
SELECT 'websites', COUNT(*) FROM websites
UNION ALL
SELECT 'http_codes', COUNT(*) FROM http_codes
UNION ALL
SELECT 'hosts', COUNT(*) FROM hosts;"
```

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs for errors
pm2 logs headlog --err --lines 50

# Check .env file permissions
ls -la .env

# Verify database connectivity
mysql -u headlog_user -p headlog -e "SELECT 1;"

# Test Node.js syntax
node -c src/server.js
```

### High Memory Usage

- Check `max_memory_restart` in ecosystem.config.js
- Reduce PM2 instances if running on small server
- Monitor with `pm2 monit`

### Database Connection Pool Exhausted

- Check for long-running queries
- Increase pool size in src/config/database.js if needed
- Monitor active connections:
  ```sql
  SHOW PROCESSLIST;
  ```

### Logs Not Being Ingested

1. Check Fluent Bit status: `sudo systemctl status fluent-bit`
2. View Fluent Bit logs: `sudo journalctl -u fluent-bit -f`
3. Verify API key is correct
4. Test endpoint manually with curl
5. Check firewall allows connections to Headlog port

## Next Steps

- **[Hierarchical Aggregation](hierarchical-aggregation.md)** - Set up multi-datacenter log forwarding
- **[Operations Guide](operations.md)** - Monitoring, backups, and performance tuning
- **[API Reference](api-usage.md)** - Complete API documentation
