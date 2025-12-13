# Migration Guide: v1.5.x to v2.0.0

**⚠️ Breaking Changes:** Version 2.0.0 introduces breaking changes to API endpoints. All API routes now use the `/api` prefix.

## What Changed?

### API Endpoint Changes

| Old Endpoint (v1.5.x)      | New Endpoint (v2.0.0)          | Notes                     |
| -------------------------- | ------------------------------ | ------------------------- |
| `POST /logs`               | `POST /api/logs`               | Log ingestion endpoint    |
| `POST /logs/batch`         | `POST /api/logs/batch`         | Hierarchical batch upload |
| `GET /logs`                | `GET /api/logs`                | Query logs (Phase 2)      |
| `GET /websites`            | `GET /api/websites`            | List websites             |
| `GET /websites/:domain`    | `GET /api/websites/:domain`    | Get website details       |
| `PUT /websites/:domain`    | `PUT /api/websites/:domain`    | Update website            |
| `DELETE /websites/:domain` | `DELETE /api/websites/:domain` | Delete website            |
| `GET /health`              | `GET /health`                  | **Unchanged** (no prefix) |

**Rationale:** The `/api` prefix provides clear separation between API endpoints and the new web UI routes (`/dashboard/*`), following industry best practices.

---

## Migration Steps

### 1. Update Fluent Bit Configuration

**On all web servers running Fluent Bit:**

Edit your Fluent Bit configuration (typically `/etc/fluent-bit/fluent-bit.conf` or `/etc/fluent-bit/conf.d/headlog.conf`):

**Before (v1.5.x):**

```ini
[OUTPUT]
    Name  http
    Match *
    Host  logs.yourdomain.com
    Port  443
    URI   /logs
    Format json
    Header Authorization Bearer YOUR_API_KEY_HERE
    tls   On
```

**After (v2.0.0):**

```ini
[OUTPUT]
    Name  http
    Match *
    Host  logs.yourdomain.com
    Port  443
    URI   /api/logs          # <-- Changed
    Format json
    Header Authorization Bearer YOUR_API_KEY_HERE
    tls   On
```

**Restart Fluent Bit:**

```bash
sudo systemctl restart fluent-bit
```

**Verify logs are flowing:**

```bash
# Check Fluent Bit status
sudo systemctl status fluent-bit

# Check Fluent Bit logs for errors
sudo journalctl -u fluent-bit -f
```

---

### 2. Update Hierarchical Aggregation (if applicable)

**If you're using multi-tier hierarchical aggregation:**

Update the `UPSTREAM_ENDPOINT` in `.env` on all downstream instances:

**Before:**

```env
UPSTREAM_ENDPOINT=https://parent-logs.yourdomain.com/logs
```

**After:**

```env
UPSTREAM_ENDPOINT=https://parent-logs.yourdomain.com/api/logs
```

**Restart the service:**

```bash
pm2 restart headlog
```

---

### 3. Update Custom Scripts and Integrations

**If you have custom scripts using the API:**

Update all endpoint URLs to include the `/api` prefix:

**Example (bash script):**

```bash
# Before
curl -X POST https://logs.yourdomain.com/logs \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$LOG_DATA"

# After
curl -X POST https://logs.yourdomain.com/api/logs \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$LOG_DATA"
```

**Example (Node.js):**

```javascript
// Before
const response = await fetch('https://logs.yourdomain.com/logs', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(logRecords)
});

// After
const response = await fetch('https://logs.yourdomain.com/api/logs', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(logRecords)
});
```

---

### 4. Update Monitoring and Health Checks

**Health check endpoint is unchanged:**

```bash
# Still works in v2.0.0
curl https://logs.yourdomain.com/health
```

**But update any API-based monitoring:**

```bash
# Before
curl https://logs.yourdomain.com/websites \
  -H "Authorization: Bearer $API_KEY"

# After
curl https://logs.yourdomain.com/api/websites \
  -H "Authorization: Bearer $API_KEY"
```

---

### 5. Deploy v2.0.0

**Pull latest code:**

```bash
cd /opt/headlog
git fetch
git checkout v2.0.0
```

**Install new dependencies:**

```bash
npm install
```

**Run database migrations:**

```bash
# Automatic (runs on startup by default)
pm2 restart headlog

# Or manual
node cli.js schema:migrate
```

**Verify migration success:**

```bash
# Check migration status
node cli.js schema:status

# Should show:
# ✓ 2.0.0-authentication.sql - Applied
```

---

## Testing Migration

### 1. Test Health Check (No Auth)

```bash
curl https://logs.yourdomain.com/health
```

**Expected response:**

```json
{
  "status": "ok",
  "timestamp": "2025-12-13T...",
  "uptime": 123.456
}
```

### 2. Test Log Ingestion

```bash
curl -X POST https://logs.yourdomain.com/api/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{
    "source_file": "/var/www/test.com/log/access.log",
    "host": "test-server",
    "log_timestamp": "2025-12-13T12:00:00.000000Z",
    "remote": "192.0.2.1",
    "method": "GET",
    "path": "/test",
    "query": "",
    "protocol": "HTTP/1.1",
    "code": "200",
    "size": "1234",
    "referer": "-",
    "user_agent": "curl/7.68.0"
  }]'
```

**Expected response:**

```json
{
  "status": "ok",
  "received": 1,
  "processed": 1
}
```

### 3. Test Website Query

```bash
curl https://logs.yourdomain.com/api/websites \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Expected response:**

```json
{
  "total": 10,
  "websites": [...]
}
```

---

## Rollback Plan

**If you encounter issues and need to rollback:**

### 1. Revert to v1.5.1

```bash
cd /opt/headlog
git checkout v1.5.1
npm install
pm2 restart headlog
```

### 2. Revert Fluent Bit Configuration

Change `URI /api/logs` back to `URI /logs` in Fluent Bit config and restart.

### 3. Revert Hierarchical Aggregation

Change `UPSTREAM_ENDPOINT` back to the old URL (without `/api`).

**Note:** Database migrations are forward-compatible. The v2.0.0 schema migrations add new tables but don't modify existing log ingestion tables, so rolling back the code is safe.

---

## New Features in v2.0.0

Once migration is complete, you'll have access to:

- **Web UI:** Access at `https://logs.yourdomain.com/` (login page)
- **User Management:** Create admin users via CLI: `node cli.js users:create-admin`
- **Role-Based Access Control:** Assign roles and capabilities to users
- **Log Viewer:** Spreadsheet-like interface at `/dashboard/logs`
- **Enhanced Management:** Websites, hosts, users, and roles all manageable via web UI

See [README.md](../README.md) for full feature documentation.

---

## Support

**Issues or questions?**

- Check [GitHub Issues](https://github.com/headwalluk/headlog/issues)
- Review [docs/installation.md](installation.md) for troubleshooting

**Emergency contact:** If you have critical production issues during migration, revert to v1.5.1 and file an issue.

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-13  
**Applies To:** v1.5.x → v2.0.0 migration
