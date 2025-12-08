# Hierarchical Log Aggregation

**Target Version:** ~1.5.0  
**Status:** Planned / Not Implemented  
**Current Version:** 1.0.1

---

## Overview

This document outlines the design for hierarchical (tiered) log aggregation, allowing headlog instances to forward logs upstream to other headlog instances. This creates a topology where logs flow from web servers → regional headlog instances → central headlog instance(s).

## Use Case

As infrastructure spans multiple datacenters or geographic regions, pushing all logs directly to a single central headlog instance becomes inefficient and creates single points of failure. A hierarchical approach provides:

- **Geographic distribution** - Keep data local to each datacenter/region
- **Reduced bandwidth** - Compress and batch logs before cross-datacenter transmission
- **Fault tolerance** - Network outages delay sync but don't cause log loss
- **Scalability** - Each region can scale independently
- **Flexible topology** - Support 2-tier, 3-tier, or more complex hierarchies

## Architecture

Headlog supports hierarchical log aggregation where logs flow upward through a tree-like topology:

**Bottom Tier:** Web servers run Fluent Bit agents that push logs to a headlog instance (via `POST /logs`)

**Middle Tier(s):** Regional/datacenter headlog instances that:
- Accept logs from web servers (Fluent Bit)
- Accept logs from downstream headlog instances
- Buffer all logs locally in their database
- Periodically forward all logs upstream to their parent headlog instance

**Top Tier:** Central/home-base headlog instance that:
- Accepts logs from regional headlog instances
- Accepts logs from web servers (if any are co-located)
- Has no upstream configuration (end of the hierarchy)
- Retains all logs according to its housekeeping policy

### Hierarchy Examples

**Two-Tier (typical):**
```
Web Servers → Regional Headlog (DC1) → Central Headlog (Home Base)
Web Servers → Regional Headlog (DC2) ↗
Web Servers → Regional Headlog (DC3) ↗
```

**Three-Tier (complex deployments):**
```
Web Servers → Office Headlog → Regional Headlog (DC1) → Central Headlog
Web Servers → Office Headlog ↗
```

### Key Principles

1. **Each headlog accepts logs from web servers** - All instances work like standalone deployments
2. **Each headlog can accept logs from downstream headlog instances** - Use the same `POST /logs` endpoint
3. **Each headlog has exactly zero or one upstream** - Simple, linear hierarchy with no fanout/distribution
4. **Logs flow upward only** - No circular references, no bidirectional sync, no peer-to-peer distribution
5. **Instances buffer during outages** - Logs accumulate locally until upstream is reachable (automatic fault tolerance)
6. **No redundancy needed** - Buffering handles failures; complexity of multi-upstream not required
7. **Top-tier instance has complete data** - Eventually receives all logs from all web servers across the entire hierarchy

## Database Schema Changes

### Add Archival Tracking Column

```sql
ALTER TABLE log_records
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'When this record was successfully forwarded to upstream server (NULL = not archived)',
ADD INDEX idx_archived_at (archived_at);
```

**Design rationale:**
- `NULL` = not yet archived (easier to query than boolean)
- Timestamp shows when archival occurred (useful for monitoring lag)
- Index allows fast retrieval of pending records
- Non-NULL value means "safe to purge locally after retention period"

### Optional: Add Sync Batch Tracking

For more robust idempotency and retry handling:

```sql
CREATE TABLE upstream_sync_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_uuid BINARY(16) NOT NULL UNIQUE COMMENT 'UUID stored as 16-byte binary',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  record_count INT UNSIGNED NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE log_records
ADD COLUMN upstream_batch_uuid BINARY(16) NULL
  COMMENT 'UUID of the sync batch this record belongs to (16-byte binary format)',
ADD INDEX idx_upstream_batch_uuid (upstream_batch_uuid);
```

**Storage efficiency:**
- VARCHAR(36): 36 bytes + 1-2 bytes length = ~38 bytes per UUID
- BINARY(16): 16 bytes (native UUID storage, 58% smaller)
- With millions of records, this saves significant disk space and improves index performance

**Usage in code:**
```javascript
// Generate UUID
const uuid = crypto.randomUUID(); // '550e8400-e29b-41d4-a716-446655440000'

// Convert to binary for storage
const binaryUuid = Buffer.from(uuid.replace(/-/g, ''), 'hex');

// Store in database
await pool.query('INSERT INTO upstream_sync_batches (batch_uuid, ...) VALUES (?, ...)', [binaryUuid]);

// Convert back to string for display/logging
const uuidString = binaryUuid.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
```

**Benefits:**
- Track batches independently for retry/recovery
- Identify which records were in failed batches
- Prevent partial batch duplicates
- Audit trail of all upstream sync attempts

## Configuration

### Environment Variables

```bash
# Upstream Server Configuration (optional)
UPSTREAM_ENABLED=false                              # Enable upstream forwarding
UPSTREAM_SERVER=https://log-central.headwall.net    # Upstream headlog URL
UPSTREAM_API_KEY=your-api-key-here                  # API key for upstream authentication

# Sync Behavior
UPSTREAM_BATCH_SIZE=1000                            # Target records per sync batch (adaptive)
UPSTREAM_BATCH_INTERVAL=60                          # Seconds between sync attempts
UPSTREAM_BATCH_SIZE_MIN=0.2                         # Minimum batch size multiplier (20% floor)
UPSTREAM_BATCH_SIZE_RECOVERY=0.1                    # Recovery increment on success (10%)

# Compression
UPSTREAM_COMPRESSION=true                           # Gzip compress batches before sending

# Note on LOG_RETENTION_DAYS:
# When UPSTREAM_ENABLED=true: Only purge records that are archived AND older than LOG_RETENTION_DAYS
# When UPSTREAM_ENABLED=false: Purge records older than LOG_RETENTION_DAYS (current behavior)
# This ensures un-archived records are buffered indefinitely during upstream outages
```

### Example Configurations

**Regional Headlog (DC1):**
```bash
UPSTREAM_ENABLED=true
UPSTREAM_SERVER=https://log-central.headwall.net
UPSTREAM_API_KEY=regional-dc1-key
UPSTREAM_BATCH_SIZE=1000                 # Target batch size (adapts 200-1000)
UPSTREAM_BATCH_INTERVAL=60
LOG_RETENTION_DAYS=2                     # Keep archived logs for 2 days, un-archived indefinitely
```

**Central Headlog:**
```bash
UPSTREAM_ENABLED=false
LOG_RETENTION_DAYS=365  # Keep all logs for 1 year
# No upstream configuration - this is the top of the hierarchy
```

**Standalone Headlog (no hierarchy):**
```bash
UPSTREAM_ENABLED=false
# Works exactly like current v1.0.1 behavior
```

## Upstream Sync Process

### High-Level Flow

```javascript
// Periodic task (runs on worker 0 only, similar to housekeeping)

1. Check if UPSTREAM_ENABLED=true
2. Query for un-archived records: WHERE archived_at IS NULL ORDER BY timestamp LIMIT UPSTREAM_BATCH_SIZE
3. If no records found, exit
4. Generate batch UUID
5. Extract records into JSON array
6. Optionally compress payload (gzip)
7. POST to UPSTREAM_SERVER/logs with UPSTREAM_API_KEY authentication
8. If successful:
   - Mark records as archived: UPDATE log_records SET archived_at = NOW() WHERE id IN (...)
   - Log success
9. If failed:
   - Log error
   - Retry with exponential backoff
   - After max retries, alert/log for manual intervention
```

### Cron-Based Scheduling

Use the existing cron mechanism (same as housekeeping tasks) to check for upstream sync:

```javascript
// src/tasks/upstreamSync.js

const { getPool } = require('../config/database');

let lastSyncAttempt = null;

/**
 * Check if next batch upload is due
 * @returns {boolean}
 */
function isNextBatchUploadDue(config) {
  if (!config.upstream.enabled) {
    return false;
  }
  
  if (lastSyncAttempt === null) {
    return true; // First run
  }
  
  const now = Date.now();
  const intervalMs = config.upstream.batchInterval * 1000;
  const timeSinceLastSync = now - lastSyncAttempt;
  
  return timeSinceLastSync >= intervalMs;
}

/**
 * Perform upstream sync (called by cron task)
 * Only runs if interval has elapsed
 */
async function performUpstreamSyncIfDue(config) {
  if (!isNextBatchUploadDue(config)) {
    return; // Too soon, skip this cron cycle
  }
  
  lastSyncAttempt = Date.now();
  
  try {
    await performUpstreamSync(config);
  } catch (error) {
    console.error('Upstream sync error:', error);
  }
}

module.exports = {
  isNextBatchUploadDue,
  performUpstreamSyncIfDue
};
```

**Cron task registration (src/tasks/index.js or src/server.js):**

```javascript
// Similar to housekeeping, only worker 0 executes
if (cluster.isPrimary || (cluster.isWorker && cluster.worker.id === 1)) {
  cron.schedule('* * * * *', async () => {
    // Check every minute, but only sync if interval has elapsed
    await performUpstreamSyncIfDue(config);
  });
}
```

**Benefits:**
- Consistent with existing housekeeping mechanism
- Natural throttling without blocking event loop
- Easy to test (just call `isNextBatchUploadDue()`)
- Cron handles task coordination in cluster mode
- No long-running `setInterval` timers

### Adaptive Batch Sizing

Batch size dynamically adjusts based on upload success/failure to handle upstream load or network issues:

```javascript
// src/tasks/upstreamSync.js

let batchSizeMultiplier = 1.0; // Start at 100% of UPSTREAM_BATCH_SIZE

/**
 * Get current adaptive batch size
 * @returns {number}
 */
function getAdaptiveBatchSize(config) {
  return Math.round(config.upstream.batchSize * batchSizeMultiplier);
}

/**
 * Reduce batch size on failure (adaptive backpressure)
 */
function reduceBatchSize(config) {
  const minMultiplier = config.upstream.batchSizeMin || 0.2; // Default 20% floor
  batchSizeMultiplier = Math.max(minMultiplier, batchSizeMultiplier - 0.2);
  
  const newSize = getAdaptiveBatchSize(config);
  console.log(`Reduced batch size to ${newSize} records (${Math.round(batchSizeMultiplier * 100)}%)`);
}

/**
 * Increase batch size on success (gradual recovery)
 */
function increaseBatchSize(config) {
  const recoveryIncrement = config.upstream.batchSizeRecovery || 0.1; // Default 10%
  const oldMultiplier = batchSizeMultiplier;
  batchSizeMultiplier = Math.min(1.0, batchSizeMultiplier + recoveryIncrement);
  
  if (batchSizeMultiplier > oldMultiplier) {
    const newSize = getAdaptiveBatchSize(config);
    console.log(`Increased batch size to ${newSize} records (${Math.round(batchSizeMultiplier * 100)}%)`);
  }
}

/**
 * Perform upstream sync with adaptive batch sizing
 */
async function performUpstreamSync(config) {
  const batchSize = getAdaptiveBatchSize(config);
  const records = await getUnArchivedRecords(batchSize);
  
  if (records.length === 0) return;
  
  const recordIds = records.map(r => r.id);
  
  try {
    await postToUpstream(records, config);
    await markRecordsArchived(recordIds);
    
    // Success: gradually increase batch size back to target
    increaseBatchSize(config);
    
    console.log(`Archived ${recordIds.length} records to upstream`);
  } catch (error) {
    // Failure: reduce batch size for next attempt
    reduceBatchSize(config);
    
    console.error('Failed to post to upstream:', error.message);
  }
}
```

**Adaptive behavior example:**

| Attempt | Result  | Multiplier | Batch Size | Notes                     |
|---------|---------|------------|------------|---------------------------|
| 1       | Fail    | 1.0 → 0.8  | 800        | Initial failure           |
| 2       | Fail    | 0.8 → 0.6  | 600        | Reduce again              |
| 3       | Fail    | 0.6 → 0.4  | 400        | Continue reducing         |
| 4       | Fail    | 0.4 → 0.2  | 200        | Hit floor (20%)           |
| 5       | Fail    | 0.2 → 0.2  | 200        | Stay at floor             |
| 6       | Success | 0.2 → 0.3  | 300        | Start recovery            |
| 7       | Success | 0.3 → 0.4  | 400        | Gradual increase          |
| 8       | Success | 0.4 → 0.5  | 500        | Halfway back              |
| ...     | Success | ...        | ...        | ...                       |
| 14      | Success | 0.9 → 1.0  | 1000       | Full recovery to target   |

**Benefits:**
- Automatically adapts to upstream capacity and network conditions
- Prevents repeated large batch failures from blocking sync indefinitely
- Graceful degradation under load
- Gradual recovery prevents overwhelming upstream when it comes back
- No manual intervention required

## Idempotency Requirements

**Critical:** The upstream sync process must be idempotent to prevent duplicate logs when retrying failed requests.

### Challenge

If network fails mid-POST or upstream returns an error after processing, we need to ensure:
1. Records aren't duplicated on the upstream server
2. We don't lose records by marking them archived prematurely
3. Retries are safe and don't create duplicates

### Solution: Batch Tracking with Upstream Deduplication

This approach combines batch tracking on the regional instance with deduplication on the upstream instance, providing complete idempotency guarantees.

#### Regional Instance (Sender)

**1. Create batch and tag records:**

```javascript
async function performUpstreamSync(config) {
  const batchSize = getAdaptiveBatchSize(config);
  const records = await getUnArchivedRecords(batchSize);
  
  if (records.length === 0) return;
  
  // Generate unique batch ID with collision check
  let batchUuid, batchUuidBinary;
  let attempts = 0;
  const maxAttempts = 3; // Paranoid safety limit
  
  while (attempts < maxAttempts) {
    batchUuid = crypto.randomUUID();
    batchUuidBinary = Buffer.from(batchUuid.replace(/-/g, ''), 'hex');
    
    // Check if this UUID already exists (extremely unlikely, but defensive)
    const [existing] = await pool.query(
      'SELECT id FROM upstream_sync_batches WHERE batch_uuid = ?',
      [batchUuidBinary]
    );
    
    if (existing.length === 0) {
      break; // UUID is unique, proceed
    }
    
    // Collision detected (should never happen in practice)
    console.warn(`UUID collision detected on attempt ${attempts + 1}: ${batchUuid}`);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique batch UUID after multiple attempts');
  }
  
  const recordIds = records.map(r => r.id);
  
  // Create batch tracking record
  await pool.query(
    `INSERT INTO upstream_sync_batches 
     (batch_uuid, record_count, status) 
     VALUES (?, ?, 'pending')`,
    [batchUuidBinary, records.length]
  );
  
  // Tag records with this batch UUID
  await pool.query(
    `UPDATE log_records 
     SET upstream_batch_uuid = ? 
     WHERE id IN (?)`,
    [batchUuidBinary, recordIds]
  );
  
  try {
    // Update status to in_progress
    await pool.query(
      `UPDATE upstream_sync_batches 
       SET status = 'in_progress' 
       WHERE batch_uuid = ?`,
      [batchUuidBinary]
    );
    
    // POST to upstream with batch UUID
    await postToUpstream({
      batch_uuid: batchUuid,  // String format for JSON
      source_instance: config.instanceName,
      records: records
    }, config);
    
    // Success: mark records as archived
    await pool.query(
      `UPDATE log_records 
       SET archived_at = NOW() 
       WHERE id IN (?)`,
      [recordIds]
    );
    
    // Mark batch as completed
    await pool.query(
      `UPDATE upstream_sync_batches 
       SET status = 'completed', completed_at = NOW() 
       WHERE batch_uuid = ?`,
      [batchUuidBinary]
    );
    
    increaseBatchSize(config);
    console.log(`Batch ${batchUuid}: Archived ${recordIds.length} records`);
    
  } catch (error) {
    // Failure: mark batch as failed, keep records un-archived
    await pool.query(
      `UPDATE upstream_sync_batches 
       SET status = 'failed', error_message = ?, retry_count = retry_count + 1 
       WHERE batch_uuid = ?`,
      [error.message, batchUuidBinary]
    );
    
    // Clear batch UUID from records so they can be retried in new batch
    await pool.query(
      `UPDATE log_records 
       SET upstream_batch_uuid = NULL 
       WHERE id IN (?)`,
      [recordIds]
    );
    
    reduceBatchSize(config);
    console.error(`Batch ${batchUuid} failed:`, error.message);
  }
}
```

**2. Prepare and send payload:**
```json
{
  "batch_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "source_instance": "log-dc1.headwall.net",
  "records": [...]
}
```

**Note:** `batch_uuid` is transmitted as string in JSON but stored as BINARY(16) in database for efficiency.

#### Upstream Instance (Receiver)

**Deduplication table:**

```sql
CREATE TABLE batch_deduplication (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_uuid BINARY(16) NOT NULL,
  source_instance VARCHAR(255) NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  record_count INT UNSIGNED NOT NULL,
  UNIQUE KEY idx_batch_source (batch_uuid, source_instance),
  INDEX idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Deduplication logic:**
```javascript
// src/routes/logs.js - Enhanced POST /logs handler

async function handleLogIngestion(request, reply) {
  const { batch_uuid, source_instance, records } = request.body;
  
  // Validate payload
  if (!Array.isArray(records) || records.length === 0) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'Expected array of log records'
    });
  }
  
  // Check for batch deduplication (hierarchical forwarding)
  if (batch_uuid && source_instance) {
    const batchUuidBinary = Buffer.from(batch_uuid.replace(/-/g, ''), 'hex');
    
    // Check if we've already processed this batch
    const [existing] = await pool.query(
      `SELECT id, received_at, record_count 
       FROM batch_deduplication 
       WHERE batch_uuid = ? AND source_instance = ?`,
      [batchUuidBinary, source_instance]
    );
    
    if (existing.length > 0) {
      // Already processed - return success without re-inserting
      console.log(`Deduplicated batch ${batch_uuid} from ${source_instance}`);
      return reply.code(200).send({
        status: 'ok',
        message: 'Batch already processed (deduplicated)',
        batch_uuid: batch_uuid,
        source_instance: source_instance,
        received: records.length,
        processed: 0,
        duplicated: records.length,
        original_received_at: existing[0].received_at
      });
    }
    
    // Record this batch to prevent future duplicates
    await pool.query(
      `INSERT INTO batch_deduplication 
       (batch_uuid, source_instance, record_count) 
       VALUES (?, ?, ?)`,
      [batchUuidBinary, source_instance, records.length]
    );
  }
  
  // Normal ingestion logic...
  const processed = await ingestLogs(records);
  
  return reply.code(200).send({
    status: 'ok',
    received: records.length,
    processed: processed
  });
}
```

### Guarantees

This approach provides complete idempotency and uniqueness:

1. **Guaranteed unique batch IDs**: UUID v4 collision check before use (defensive programming)
2. **Safe retries**: Regional instance can resend any batch without causing duplicates
3. **Network failure tolerance**: If POST succeeds but response is lost, retry is safe
4. **Audit trail**: Full history of all batch attempts in `upstream_sync_batches`
5. **Upstream protection**: Central instance detects and rejects duplicate batches
6. **Recovery from data loss**: Works even if regional instance loses batch tracking data

**UUID collision probability:**
- UUID v4 provides 2^122 random bits (~5.3 × 10^36 possible values)
- Collision probability: ~1 in 2.7 × 10^18 for 1 billion UUIDs
- Collision check provides absolute guarantee within regional instance
- Upstream deduplication provides additional safety layer

### Failure Scenarios

| Scenario | Regional Behavior | Upstream Behavior | Result |
|----------|-------------------|-------------------|--------|
| POST fails mid-flight | Marks batch 'failed', clears batch_uuid, records remain un-archived | Never receives batch | Records retried in new batch ✓ |
| POST succeeds, response lost | Marks batch 'failed' (timeout), keeps records un-archived | Processes batch, records dedup entry | Retry detected as duplicate, no data loss ✓ |
| Upstream processes but returns error | Marks batch 'failed', records un-archived | Processes batch, records dedup entry | Retry detected as duplicate ✓ |
| Regional database fails | Batch tracking lost | Dedup table intact | Can resend, upstream rejects duplicates ✓ |
| Upstream database fails | Batch marked 'failed' | No dedup entry | Retry processes normally ✓ |

### Housekeeping

Clean up old batch tracking data periodically:

```javascript
// Regional instance: delete old completed batches
await pool.query(
  `DELETE FROM upstream_sync_batches 
   WHERE status = 'completed' 
     AND completed_at < NOW() - INTERVAL 7 DAY`
);

// Upstream instance: delete old deduplication records
await pool.query(
  `DELETE FROM batch_deduplication 
   WHERE received_at < NOW() - INTERVAL 30 DAY`
);
```

**Retention recommendations:**
- Regional `upstream_sync_batches`: Keep completed batches for 7 days, failed batches for 30 days
- Upstream `batch_deduplication`: Keep for 30 days (longer than any reasonable network outage)

## Data Flow Example

### Scenario: Regional DC1 syncs 1000 records to Central

**Regional Headlog (DC1):**

1. **Query un-archived records:**
   ```sql
   SELECT * FROM log_records 
   WHERE archived_at IS NULL 
   ORDER BY timestamp ASC 
   LIMIT 1000;
   ```

2. **Prepare payload:**
   ```json
   {
     "batch_uuid": "550e8400-e29b-41d4-a716-446655440000",
     "source_instance": "log-dc1.headwall.net",
     "records": [
       {
         "log_timestamp": "2025-12-08T10:15:23.000000Z",
         "remote": "192.0.2.50",
         "host": "web01",
         "code": "200",
         "source_file": "/var/www/example.com/log/access.log",
         "method": "GET",
         "path": "/products/widget",
         "agent": "Mozilla/5.0...",
         ...
       },
       // ... 999 more records
     ]
   }
   ```

3. **POST to upstream:**
   ```bash
   POST https://log-central.headwall.net/logs
   X-API-Key: regional-dc1-key
   Content-Encoding: gzip
   Content-Type: application/json
   
   [gzipped JSON payload]
   ```

4. **On success (200 OK):**
   ```sql
   UPDATE log_records 
   SET archived_at = NOW() 
   WHERE id IN (12345, 12346, ..., 13344);
   ```

5. **Later (housekeeping purges archived records):**
   ```sql
   -- Only purge records that are both archived AND older than retention period
   DELETE FROM log_records 
   WHERE archived_at IS NOT NULL 
     AND archived_at < NOW() - INTERVAL 2 DAY;
   ```

**Central Headlog:**

1. **Receives POST /logs**
2. **Checks for duplicate batch** (if using Option C)
3. **Processes records normally** - same as if they came from web servers
4. **Returns success:**
   ```json
   {
     "status": "ok",
     "received": 1000,
     "processed": 1000
   }
   ```

5. **Records stored** with `archived_at = NULL` (central keeps everything)

## Mixed Source Handling

**Important:** Regional headlog instances accept logs from **both** sources:

1. **Web servers** (Fluent Bit) - Direct ingestion via `POST /logs`
2. **Downstream headlog instances** - Upstream sync via `POST /logs`

The regional instance treats both identically:
- Same endpoint (`POST /logs`)
- Same authentication (API keys)
- Same storage (all go to `log_records`)
- Same upstream forwarding (both get synced to central)

**Example Regional DC1 receives from:**
- 50 web servers in DC1 (direct via Fluent Bit)
- 2 edge headlog instances in remote offices (via upstream sync)
- All logs stored locally in `log_records`
- All logs forwarded to central headlog

**This means:** You can build arbitrarily deep hierarchies:
```
Web Servers → Office Headlog → Regional Headlog → Central Headlog
```

## Monitoring & Observability

### Health Endpoint Addition

Extend `GET /health` to include upstream sync status:

```json
{
  "status": "healthy",
  "timestamp": "2025-12-08T10:30:00Z",
  "database": "connected",
  "upstream_sync": {
    "enabled": true,
    "upstream_server": "https://log-central.headwall.net",
    "last_sync_at": "2025-12-08T10:29:30Z",
    "last_sync_status": "success",
    "pending_records": 47,
    "failed_batches": 0,
    "last_error": null
  }
}
```

### Metrics to Track

- **Pending records:** Count of `archived_at IS NULL`
- **Sync lag:** Oldest un-archived record timestamp vs. now
- **Success rate:** Successful syncs / total attempts
- **Batch failures:** Count of failed batches requiring manual intervention
- **Retention purges:** Records deleted after retention period

### Alerting Triggers

- Pending records exceeds threshold (e.g., >10,000)
- Sync lag exceeds threshold (e.g., >1 hour)
- Multiple consecutive sync failures (e.g., >5)
- Upstream server unreachable for extended period (e.g., >10 minutes)

## Implementation Plan

### Phase 1: Core Functionality (v1.5.0)

1. **Database migration:**
   - Add `archived_at` column to `log_records`
   - Add index on `archived_at`

2. **Configuration:**
   - Add upstream config section to `src/config/index.js`
   - Add environment variables

3. **Upstream sync task:**
   - Create `src/tasks/upstreamSync.js`
   - Implement basic sync logic (Option A)
   - Add PM2 cluster coordination

4. **Testing:**
   - Unit tests for sync logic
   - Integration tests with two headlog instances
   - Test network failure scenarios

5. **Documentation:**
   - Update `QUICKSTART.md` with hierarchy setup
   - Update `docs/deployment-checklist.md`
   - Add example configurations

### Phase 2: Enhanced Features (v1.6.0)

1. **Failed batch recovery:**
   - CLI command to retry specific failed batches
   - Automatic retry of failed batches after cooldown period
   - Dashboard for viewing batch sync status

2. **Batch housekeeping:**
   - Automatic cleanup of old completed batches
   - Automatic cleanup of old deduplication records
   - Configurable retention periods

### Phase 3: Advanced Features (v1.7.0)

1. **Health monitoring:**
   - Extend `/health` endpoint
   - Add Prometheus metrics export

2. **Regional retention:**
   - Modify housekeeping task to respect `archived_at` status when upstream is enabled
   - Ensure un-archived records are never purged automatically

3. **Schema version validation:**
   - Include version in batch metadata
   - Central validates compatibility before processing
   - Clear error messages for version mismatches

## Security Considerations

### Authentication

- Regional instances need valid API keys for upstream servers
- Use dedicated API keys per regional instance for tracking/revocation
- Store upstream API keys securely (same `.env` permission checks)

### Authorization

Consider adding source tracking:

```sql
ALTER TABLE api_keys
ADD COLUMN can_forward_logs BOOLEAN NOT NULL DEFAULT true
  COMMENT 'Whether this API key is allowed to forward logs from other headlog instances';
```

This allows differentiation between:
- Web server API keys (can't forward, only direct logs)
- Regional headlog API keys (can forward batches)

### Data Integrity

- Validate batch UUIDs are properly formatted UUIDs (RFC 4122)
- Convert UUIDs to BINARY(16) for database storage (58% space savings)
- Verify `source_instance` matches authenticated API key
- Limit batch sizes to prevent memory exhaustion
- Rate limit upstream sync requests (separate from web server rate limits)

## Design Decisions

### Archived Records Purging

**Decision:** Automatic purging respects upstream sync status

When `UPSTREAM_ENABLED=true`:
- Only purge records where `archived_at IS NOT NULL` AND older than `LOG_RETENTION_DAYS`
- Un-archived records are kept indefinitely (automatic buffering during upstream outages)
- Example: Regional instance with `LOG_RETENTION_DAYS=2` keeps archived logs for 2 days, but buffers un-archived logs forever until upstream link recovers

When `UPSTREAM_ENABLED=false`:
- Purge records older than `LOG_RETENTION_DAYS` (current standalone behavior)
- Example: Central instance with `LOG_RETENTION_DAYS=365` keeps all logs for 1 year

This approach:
- Prevents data loss during network outages
- Allows regional instances to use aggressive retention (low disk usage)
- Central instance controls long-term retention policy
- No need for separate `UPSTREAM_RETENTION_DAYS` configuration

### Regional Database Failure

**Impact:** Un-archived records are lost (same as current standalone behavior)

This is acceptable because:
- Same risk exists today in standalone deployments
- Adding write-ahead log adds significant complexity
- Most production setups have database backups/replication
- Could be addressed in future version if needed

### Single Upstream Only

**Decision:** Each headlog instance has exactly zero or one upstream server

Multi-upstream adds significant complexity without clear benefit:
- Buffering provides automatic fault tolerance during outages
- Redundancy better handled at infrastructure level (load balancers, failover DNS)
- Duplicate detection becomes much more complex
- Most users don't need this complexity

**Not supported:**
```
     Regional DC1
    /            \
   ↓              ↓
Central A    Central B  ← Redundant upstreams
```

**Correct architecture:**
```
Regional DC1 → Central A → [manual failover if needed]
```

### Schema Version Compatibility

**Decision:** Include schema version in batch metadata; central validates compatibility

Upgrade procedure:
1. Upgrade central headlog first
2. Test with one regional instance
3. Roll out to remaining regional instances
4. Central rejects batches from incompatible versions with clear error message

Batch payload includes:
```json
{
  "batch_uuid": "...",
  "source_instance": "log-dc1.headwall.net",
  "schema_version": "1.5.0",
  "records": [...]
}
```

## Related Documents

- `docs/deployment-checklist.md` - Production deployment guide
- `docs/database-migrations.md` - Schema migration system
- `docs/api-usage.md` - API endpoint documentation

---

**Status:** This is a planning document. Implementation will begin in a future release (~v1.5.0).

**Last Updated:** 2025-12-08
