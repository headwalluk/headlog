# Hierarchical Aggregation Setup

Configure multi-datacenter log forwarding with Headlog's hierarchical aggregation feature. This allows regional Headlog instances to automatically forward logs to a central aggregation server.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Web Servers    │     │  Web Servers    │     │  Web Servers    │
│  (Fluent Bit)   │     │  (Fluent Bit)   │     │  (Fluent Bit)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────┬───────────┴───────────┬───────────┘
                     │                       │
              ┌──────▼──────┐         ┌──────▼──────┐
              │  Regional   │         │  Regional   │
              │  Headlog    │         │  Headlog    │
              └──────┬──────┘         └──────┬──────┘
                     │                       │
                     └───────────┬───────────┘
                                 │
                          ┌──────▼──────┐
                          │  Central    │
                          │  Headlog    │
                          └─────────────┘
```

## Features

- **Adaptive Batch Sizing:** Automatically adjusts batch size based on upstream success/failure
- **Idempotent Uploads:** UUID-based batch deduplication prevents duplicate records
- **Automatic Retry:** Failed batches are retried with reduced batch size
- **Outage Buffering:** Un-archived records retained indefinitely during upstream outages
- **Optional Compression:** Gzip compression reduces bandwidth usage
- **Collision Detection:** UUID collision detection with automatic retry

## Setup Instructions

### Step 1: Install Central Server

First, set up your central aggregation server using the standard [Installation Guide](installation.md).

**Central Server `.env`:**

```dotenv
# Standard configuration
DB_HOST=localhost
DB_NAME=headlog_central
PORT=3010
NODE_ENV=production
LOG_LEVEL=warn

# Upstream forwarding DISABLED (this is the top-level server)
UPSTREAM_ENABLED=false
```

### Step 2: Generate API Key on Central

On the **central server**, create an API key for regional instances:

```bash
node cli.js keys:create --description "Regional datacenter forwarding"
```

Save this API key - you'll need it for regional server configuration.

### Step 3: Configure Regional Servers

Install Headlog on regional servers using the [Installation Guide](installation.md), then enable upstream forwarding.

**Regional Server `.env`:**

```dotenv
# Standard configuration
DB_HOST=localhost
DB_NAME=headlog_regional
PORT=3010
NODE_ENV=production
LOG_LEVEL=warn

# Upstream forwarding ENABLED
UPSTREAM_ENABLED=true
UPSTREAM_SERVER=https://central.yourdomain.com
UPSTREAM_API_KEY=<API_KEY_FROM_CENTRAL_SERVER>
UPSTREAM_BATCH_SIZE=1000
UPSTREAM_BATCH_INTERVAL=60
UPSTREAM_BATCH_SIZE_MIN=0.2
UPSTREAM_BATCH_SIZE_RECOVERY=0.1
UPSTREAM_COMPRESSION=true
UPSTREAM_TIMEOUT=60
INSTANCE_NAME=regional-datacenter-1
```

### Configuration Parameters

| Parameter                      | Description                    | Default  | Recommended                   |
| ------------------------------ | ------------------------------ | -------- | ----------------------------- |
| `UPSTREAM_ENABLED`             | Enable upstream forwarding     | `false`  | `true` for regional           |
| `UPSTREAM_SERVER`              | Central server URL             | -        | `https://central.example.com` |
| `UPSTREAM_API_KEY`             | API key from central           | -        | Generate on central           |
| `UPSTREAM_BATCH_SIZE`          | Target batch size              | `1000`   | 500-2000                      |
| `UPSTREAM_BATCH_INTERVAL`      | Seconds between uploads        | `60`     | 30-300                        |
| `UPSTREAM_BATCH_SIZE_MIN`      | Minimum multiplier (floor)     | `0.2`    | 0.1-0.5                       |
| `UPSTREAM_BATCH_SIZE_RECOVERY` | Recovery increment             | `0.1`    | 0.05-0.2                      |
| `UPSTREAM_COMPRESSION`         | Enable gzip compression        | `true`   | `true`                        |
| `UPSTREAM_TIMEOUT`             | HTTP request timeout (seconds) | `60`     | 30-120                        |
| `INSTANCE_NAME`                | Identifier for this instance   | hostname | `regional-dc-1`               |

### Step 4: Restart Regional Servers

```bash
pm2 restart headlog
pm2 logs headlog
```

You should see log entries like:

```
✓ Upstream sync task enabled
[UpstreamSync] Starting batch <uuid> with 1000 records
[UpstreamSync] Batch <uuid>: Archived 1000 records
[UpstreamSync] Increased batch size to 1100 records (110%)
```

### Step 5: Verify Operation

#### On Regional Server

Check that records are being archived:

```bash
mysql -u headlog_user -p headlog_regional -e "
SELECT
  COUNT(*) as total,
  COUNT(archived_at) as archived,
  COUNT(*) - COUNT(archived_at) as pending
FROM log_records;"
```

View batch tracking:

```bash
mysql -u headlog_user -p headlog_regional -e "
SELECT
  HEX(batch_uuid) as batch_uuid,
  record_count,
  status,
  started_at,
  completed_at
FROM upstream_sync_batches
ORDER BY started_at DESC
LIMIT 10;"
```

#### On Central Server

Check for received batches:

```bash
mysql -u headlog_user -p headlog_central -e "
SELECT
  HEX(batch_uuid) as batch_uuid,
  source_instance,
  record_count,
  received_at
FROM batch_deduplication
ORDER BY received_at DESC
LIMIT 10;"
```

Verify record counts:

```bash
mysql -u headlog_user -p headlog_central -e "
SELECT COUNT(*) as total_records FROM log_records;"
```

## Adaptive Batch Sizing

The system automatically adjusts batch size based on upstream performance:

### On Success

- Batch size increases by `UPSTREAM_BATCH_SIZE_RECOVERY` (default 10%)
- Gradually recovers to 100% of `UPSTREAM_BATCH_SIZE`
- Example: 100 → 110 → 121 → ... → 1000 records

### On Failure

- Batch size reduces by 20%
- Reduces down to `UPSTREAM_BATCH_SIZE_MIN` (default 20%)
- Example: 1000 → 800 → 640 → 512 → ... → 200 records

### Benefits

- Automatic backpressure during network issues
- Gradual recovery as conditions improve
- Prevents cascade failures

## Monitoring

### PM2 Logs

```bash
# View real-time logs
pm2 logs headlog

# Filter for upstream sync messages
pm2 logs headlog | grep UpstreamSync
```

### Database Queries

**Check pending records on regional:**

```sql
SELECT COUNT(*) FROM log_records WHERE archived_at IS NULL;
```

**View recent batches:**

```sql
SELECT
  status,
  COUNT(*) as count,
  SUM(record_count) as total_records
FROM upstream_sync_batches
WHERE started_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY status;
```

**Check deduplication on central:**

```sql
SELECT
  source_instance,
  COUNT(*) as batches,
  SUM(record_count) as total_records,
  MAX(received_at) as last_received
FROM batch_deduplication
GROUP BY source_instance;
```

## Troubleshooting

### Records Not Being Forwarded

1. **Check upstream configuration:**

   ```bash
   grep UPSTREAM .env
   ```

2. **Verify housekeeping task started:**

   ```bash
   pm2 logs headlog | grep "Upstream sync task"
   ```

   Should show: `✓ Upstream sync task enabled`

3. **Check for errors:**
   ```bash
   pm2 logs headlog --err --lines 100
   ```

### Batch Upload Failures

**View failed batches:**

```sql
SELECT
  HEX(batch_uuid) as batch_uuid,
  record_count,
  error_message,
  retry_count,
  started_at
FROM upstream_sync_batches
WHERE status = 'failed'
ORDER BY started_at DESC;
```

**Common issues:**

- Invalid API key: Check `UPSTREAM_API_KEY` matches key on central
- Network connectivity: Test with `curl https://central.example.com/health`
- Central server down: Check PM2 status on central
- SSL certificate issues: Verify SSL cert is valid

### High Pending Count

If `archived_at IS NULL` count keeps growing:

1. Check central server is running: `curl https://central.example.com/health`
2. View batch errors: See "Batch Upload Failures" above
3. Check network connectivity from regional to central
4. Verify API key is active: `node cli.js keys:list` on central

**Records buffer indefinitely** during outages - they won't be purged until successfully archived.

### Duplicate Records

The system prevents duplicates through:

1. **Batch UUID tracking** on regional
2. **Deduplication table** on central

If you see duplicates, check:

```sql
-- On central: look for missing deduplication entries
SELECT COUNT(*) FROM batch_deduplication;
```

Re-uploading the same batch UUID will be silently ignored (returns HTTP 200 with `deduplicated: true`).

## Performance Tuning

### High-Volume Regional Servers

For servers ingesting >10,000 records/minute:

```dotenv
UPSTREAM_BATCH_SIZE=5000          # Larger batches
UPSTREAM_BATCH_INTERVAL=30        # More frequent uploads
UPSTREAM_COMPRESSION=true         # Reduce bandwidth
```

### Low-Bandwidth Connections

For slow network links between regional and central:

```dotenv
UPSTREAM_BATCH_SIZE=500           # Smaller batches
UPSTREAM_BATCH_INTERVAL=120       # Less frequent uploads
UPSTREAM_COMPRESSION=true         # Essential for low bandwidth
```

### Multi-Tier Hierarchies

You can create deeper hierarchies:

```
Edge → Regional → National → Global
```

Each tier needs:

- `UPSTREAM_ENABLED=true` (except global)
- `UPSTREAM_SERVER` pointing to next tier
- `INSTANCE_NAME` unique identifier

## Data Retention

### Regional Server

With upstream enabled, only archived records are purged:

```sql
-- Regional purge logic (automatic via housekeeping)
DELETE FROM log_records
WHERE archived_at IS NOT NULL
AND archived_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

Un-archived records are retained indefinitely during outages.

### Central Server

Standard retention applies (no upstream forwarding):

```sql
-- Central purge logic
DELETE FROM log_records
WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

### Recommendation

- **Regional:** `LOG_RETENTION_DAYS=30` (short - just buffer for outages)
- **Central:** `LOG_RETENTION_DAYS=365` (long - primary storage)

## Security Considerations

1. **API Key Rotation:** Periodically rotate API keys on central server
2. **TLS/SSL Required:** Always use HTTPS for `UPSTREAM_SERVER`
3. **Network Isolation:** Consider VPN or private networking between regional and central
4. **API Key Storage:** Store in .env with 600 permissions, not in code
5. **Rate Limiting:** Central server should have rate limiting enabled

## Next Steps

- **[Operations Guide](operations.md)** - Monitoring and maintenance
- **[Performance Tuning](performance.md)** - Optimize for high-volume deployments
- **[API Reference](api-usage.md)** - Complete API documentation
