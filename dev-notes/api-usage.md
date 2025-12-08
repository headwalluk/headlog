# API Usage Guide

This guide shows how to interact with the Headlog API using various tools and methods.

---

## Table of Contents

- [Creating an API Key](#creating-an-api-key)
- [API Endpoints](#api-endpoints)
- [Submitting Logs with HTTPie](#submitting-logs-with-httpie)
- [Submitting Logs with curl](#submitting-logs-with-curl)
- [Fluent Bit Configuration](#fluent-bit-configuration)
- [Response Formats](#response-formats)

---

## Creating an API Key

Before you can submit logs, you need an API key for authentication.

### Using the CLI

```bash
# Create a new API key
node cli.js keys:create --description "Production web server 1"

# Output:
# ✓ API Key created successfully!
#
#   ID:          1
#   Key:         abc123def456ghi789jkl012mno345pqr678stu90
#   Description: Production web server 1
#   Status:      Active
#
# ⚠️  Save this key securely - it cannot be retrieved again!
```

### Alternative: npm script

```bash
npm run cli keys:create -- --description "My API Key"
```

### List existing keys

```bash
node cli.js keys:list

# Output:
#  Found 2 API key(s):
#
#  ID  | Key (last 8)  | Status   | Description                | Last Used           | Created
#  ------------------------------------------------------------------------------------------------------------
#  1   | ...r678stu90  | Active   | Production web server 1    | 2025-12-07 10:30:15 | 2025-12-07
#  2   | ...xyz789abc  | Active   | Staging server             | Never               | 2025-12-07
```

---

## API Endpoints

### Base URL

```
http://your-server:3010
```

### Available Endpoints

| Method | Endpoint            | Auth Required | Description                   |
| ------ | ------------------- | ------------- | ----------------------------- |
| GET    | `/health`           | No            | Health check                  |
| POST   | `/logs`             | Yes           | Ingest log records (bulk)     |
| GET    | `/logs`             | Yes           | Query logs (Phase #2)         |
| GET    | `/websites`         | Yes           | List all websites             |
| GET    | `/websites/:domain` | Yes           | Get specific website          |
| PUT    | `/websites/:domain` | Yes           | Update website metadata       |
| DELETE | `/websites/:domain` | Yes           | Delete website (cascade logs) |

---

## Submitting Logs with HTTPie

[HTTPie](https://httpie.io/) is a user-friendly command-line HTTP client with JSON support.

### Install HTTPie

```bash
# Debian/Ubuntu
sudo apt install httpie

# macOS
brew install httpie

# Or via pip
pip install httpie
```

### Health Check (no auth required)

```bash
http GET http://localhost:3010/health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-12-07T15:30:45.123Z",
  "uptime": 3600.5
}
```

### Submit Single Log Record

```bash
http POST http://localhost:3010/logs \
  Authorization:"Bearer YOUR_API_KEY_HERE" \
  <<< '[
    {
      "timestamp": "2025-12-07T15:30:00.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.45",
      "method": "GET",
      "path": "/",
      "code": "200",
      "size": 4523,
      "referer": "-",
      "agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  ]'
```

**Response:**

```json
{
  "status": "ok",
  "received": 1,
  "processed": 1
}
```

### Submit Batch Logs

```bash
http POST http://localhost:3010/logs \
  Authorization:"Bearer YOUR_API_KEY_HERE" \
  <<< '[
    {
      "timestamp": "2025-12-07T15:30:00.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.45",
      "method": "GET",
      "path": "/page1",
      "code": "200",
      "size": 4523,
      "referer": "-",
      "agent": "Mozilla/5.0"
    },
    {
      "timestamp": "2025-12-07T15:30:01.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.46",
      "method": "GET",
      "path": "/page2",
      "code": "200",
      "size": 3421,
      "referer": "https://example.com/page1",
      "agent": "Mozilla/5.0"
    }
  ]'
```

### Submit Error Log

```bash
http POST http://localhost:3010/logs \
  Authorization:"Bearer YOUR_API_KEY_HERE" \
  <<< '[
    {
      "timestamp": "2025-12-07T15:35:00.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/error.log",
      "remote": "203.0.113.45",
      "level": "error",
      "message": "PHP Fatal error: Uncaught Exception in /var/www/example.com/index.php:42",
      "code": "500"
    }
  ]'
```

### List Websites

```bash
http GET http://localhost:3010/websites \
  Authorization:"Bearer YOUR_API_KEY_HERE"
```

**Response:**

```json
{
  "websites": [
    {
      "id": 1,
      "domain": "example.com",
      "is_ssl": 1,
      "is_dev": 0,
      "owner_email": null,
      "admin_email": null,
      "last_activity_at": "2025-12-07T15:30:01.000Z",
      "created_at": "2025-12-07T10:00:00.000Z",
      "updated_at": "2025-12-07T15:30:01.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

---

## Submitting Logs with curl

curl is available on almost every system and perfect for scripts.

### Health Check

```bash
curl http://localhost:3010/health
```

### Submit Single Log Record

```bash
curl -X POST http://localhost:3010/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '[
    {
      "timestamp": "2025-12-07T15:30:00.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.45",
      "method": "GET",
      "path": "/",
      "code": "200",
      "size": 4523,
      "referer": "-",
      "agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  ]'
```

### Submit Batch Logs

```bash
curl -X POST http://localhost:3010/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '[
    {
      "timestamp": "2025-12-07T15:30:00.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.45",
      "method": "GET",
      "path": "/page1",
      "code": "200",
      "size": 4523,
      "referer": "-",
      "agent": "Mozilla/5.0"
    },
    {
      "timestamp": "2025-12-07T15:30:01.000Z",
      "host": "example.com",
      "source_file": "/var/www/example.com/log/access.log",
      "remote": "203.0.113.46",
      "method": "GET",
      "path": "/page2",
      "code": "200",
      "size": 3421,
      "referer": "https://example.com/page1",
      "agent": "Mozilla/5.0"
    }
  ]'
```

### Submit with Compression (gzip)

```bash
# Create JSON file
cat > logs.json << 'EOF'
[
  {
    "timestamp": "2025-12-07T15:30:00.000Z",
    "host": "example.com",
    "source_file": "/var/www/example.com/log/access.log",
    "remote": "203.0.113.45",
    "method": "GET",
    "path": "/",
    "code": "200",
    "size": 4523,
    "referer": "-",
    "agent": "Mozilla/5.0"
  }
]
EOF

# Compress and submit
curl -X POST http://localhost:3010/logs \
  -H "Content-Type: application/json" \
  -H "Content-Encoding: gzip" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  --data-binary @<(gzip -c logs.json)
```

### Pretty Print JSON Response

```bash
curl -s http://localhost:3010/health | python3 -m json.tool

# Or with jq (if installed)
curl -s http://localhost:3010/health | jq
```

### Scripted Submission from File

```bash
#!/bin/bash
API_KEY="YOUR_API_KEY_HERE"
API_URL="http://localhost:3010/logs"

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d @logs.json

# Where logs.json contains an array of log records
```

---

## Fluent Bit Configuration

For production use, configure Fluent Bit on your web servers to automatically forward logs.

### Example Configuration

Create or edit `/etc/fluent-bit/fluent-bit.conf`:

```ini
[SERVICE]
    Flush        5
    Daemon       Off
    Log_Level    info

# Apache Access Log
[INPUT]
    Name              tail
    Path              /var/www/*/log/access.log
    Parser            apache2
    Tag               apache.access
    Refresh_Interval  5

# Apache Error Log
[INPUT]
    Name              tail
    Path              /var/www/*/log/error.log
    Parser            apache_error
    Tag               apache.error
    Refresh_Interval  5

# Output to Headlog API
[OUTPUT]
    Name              http
    Match             apache.*
    Host              your-headlog-server.com
    Port              3010
    URI               /logs
    Format            json
    Header            Authorization Bearer YOUR_API_KEY_HERE
    Compress          gzip
    Retry_Limit       3
```

### Parser Configuration

Add to `/etc/fluent-bit/parsers.conf`:

```ini
[PARSER]
    Name   apache2
    Format regex
    Regex  ^(?<remote>[^ ]*) [^ ]* (?<user>[^ ]*) \[(?<timestamp>[^\]]*)\] "(?<method>\S+)(?: +(?<path>[^\"]*?)(?: +\S*)?)?" (?<code>[^ ]*) (?<size>[^ ]*)(?: "(?<referer>[^\"]*)" "(?<agent>[^\"]*)")?$
    Time_Key timestamp
    Time_Format %d/%b/%Y:%H:%M:%S %z

[PARSER]
    Name   apache_error
    Format regex
    Regex  ^\[(?<timestamp>[^\]]*)\] \[(?<level>[^\]]*)\] \[pid (?<pid>[^\]]*)\] \[client (?<remote>[^\]]*)\] (?<message>.*)$
    Time_Key timestamp
    Time_Format %a %b %d %H:%M:%S.%L %Y
```

### Restart Fluent Bit

```bash
sudo systemctl restart fluent-bit
sudo systemctl status fluent-bit
```

---

## Response Formats

### Success Response

```json
{
  "status": "ok",
  "received": 10,
  "processed": 10
}
```

### Error Responses

#### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

#### 400 Bad Request

```json
{
  "error": "Bad Request",
  "message": "Expected array of log records"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Internal Server Error",
  "message": "Failed to process log records"
}
```

---

## Tips and Best Practices

### Batch Submissions

- Submit logs in batches (10-100 records) for better performance
- Fluent Bit handles batching automatically
- Server supports up to 10MB request body by default

### Compression

- Use gzip compression for large batches
- Reduces bandwidth by ~70-90%
- Fluent Bit enables compression with `Compress gzip`

### Error Handling

- Check HTTP status codes in responses
- Implement retry logic with exponential backoff
- Log failed submissions for manual review

### Security

- Always use HTTPS in production (configure reverse proxy)
- Store API keys securely (environment variables, not in code)
- Rotate API keys periodically
- Use different keys for different servers/environments

### Testing

```bash
# Test with invalid key
curl -X POST http://localhost:3010/logs \
  -H "Authorization: Bearer invalid_key" \
  -d '[]'

# Expected: 401 Unauthorized

# Test with empty array
curl -X POST http://localhost:3010/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '[]'

# Expected: 400 Bad Request
```

---

## Troubleshooting

### Connection Refused

- Check server is running: `curl http://localhost:3010/health`
- Verify firewall rules allow traffic on port 3010
- Check server logs: `npm run dev`

### 401 Unauthorized

- Verify API key is correct (no extra spaces)
- Check key is active: `node cli.js keys:list`
- Ensure Authorization header format: `Bearer YOUR_KEY`

### Empty Responses

- Check Content-Type header is `application/json`
- Verify JSON is valid: `echo '[...]' | python3 -m json.tool`
- Check server logs for errors

### Logs Not Appearing

- Verify `source_file` path matches expected pattern
- Check website was auto-created: `GET /websites`
- Review `last_activity_at` timestamp
- Check database: `SELECT * FROM log_records LIMIT 10;`

---

## Next Steps

- Configure Fluent Bit on your web servers
- Set up monitoring and alerting (Phase #2)
- Implement log analysis and pattern detection
- Add dashboards for visualization

For more information, see:

- [Implementation Guide](implementation.md)
- [Requirements Documentation](requirements.md)
- [Database Migrations](database-migrations.md)
