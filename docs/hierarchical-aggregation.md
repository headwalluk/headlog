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
  batch_uuid VARCHAR(36) NOT NULL UNIQUE,
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
ADD COLUMN upstream_batch_uuid VARCHAR(36) NULL
  COMMENT 'UUID of the sync batch this record belongs to',
ADD INDEX idx_upstream_batch_uuid (upstream_batch_uuid);
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
UPSTREAM_BATCH_SIZE=1000                            # Records per sync batch
UPSTREAM_BATCH_INTERVAL=60                          # Seconds between sync attempts
UPSTREAM_MAX_RETRIES=5                              # Max retries for failed batches
UPSTREAM_RETRY_BACKOFF=30                           # Seconds to wait between retries

# Regional Data Retention
UPSTREAM_RETENTION_DAYS=7                           # Days to keep archived logs locally
                                                    # (0 = keep forever, >0 = purge after N days)

# Compression
UPSTREAM_COMPRESSION=true                           # Gzip compress batches before sending
```

### Example Configurations

**Regional Headlog (DC1):**
```bash
UPSTREAM_ENABLED=true
UPSTREAM_SERVER=https://log-central.headwall.net
UPSTREAM_API_KEY=regional-dc1-key
UPSTREAM_BATCH_SIZE=1000
UPSTREAM_BATCH_INTERVAL=60
UPSTREAM_RETENTION_DAYS=7
```

**Central Headlog:**
```bash
UPSTREAM_ENABLED=false
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

### PM2 Cluster Coordination

Only worker 0 should run the upstream sync task to prevent duplicate POSTs:

```javascript
// src/server.js or src/tasks/upstreamSync.js

const cluster = require('cluster');

function startUpstreamSync() {
  const config = require('./config');
  
  if (!config.upstream.enabled) {
    return; // Upstream sync disabled
  }
  
  // Only worker 0 (or primary in single-process mode)
  if (cluster.isPrimary || (cluster.isWorker && cluster.worker.id === 1)) {
    const interval = config.upstream.batchInterval * 1000;
    
    setInterval(async () => {
      try {
        await performUpstreamSync();
      } catch (error) {
        console.error('Upstream sync error:', error);
      }
    }, interval);
    
    console.log(`Upstream sync started (interval: ${config.upstream.batchInterval}s)`);
  }
}
```

## Idempotency Requirements

**Critical:** The upstream sync process must be idempotent to prevent duplicate logs when retrying failed requests.

### Challenge

If network fails mid-POST or upstream returns an error after processing, we need to ensure:
1. Records aren't duplicated on the upstream server
2. We don't lose records by marking them archived prematurely
3. Retries are safe and don't create duplicates

### Solution Options

#### Option A: Mark After Successful POST (Simple)

```javascript
async function performUpstreamSync() {
  const records = await getUnArchivedRecords(BATCH_SIZE);
  
  if (records.length === 0) return;
  
  // Extract record IDs for later
  const recordIds = records.map(r => r.id);
  
  try {
    // POST to upstream (may fail mid-flight)
    await postToUpstream(records);
    
    // Only mark as archived if POST succeeded
    await markRecordsArchived(recordIds);
    
    console.log(`Archived ${recordIds.length} records to upstream`);
  } catch (error) {
    // Don't mark as archived - will retry next interval
    console.error('Failed to post to upstream:', error.message);
    // Records remain with archived_at=NULL, will retry
  }
}
```

**Pros:**
- Simple implementation
- No duplicates if POST fails before completion

**Cons:**
- If upstream processes records but returns error (or network drops after success), records are re-sent
- Could cause duplicates if upstream doesn't detect them

#### Option B: Batch UUID Tracking (Robust)

```javascript
async function performUpstreamSync() {
  const records = await getUnArchivedRecords(BATCH_SIZE);
  
  if (records.length === 0) return;
  
  // Generate unique batch ID
  const batchUuid = crypto.randomUUID();
  const recordIds = records.map(r => r.id);
  
  // Create batch tracking record
  await createSyncBatch({
    batch_uuid: batchUuid,
    record_count: records.length,
    status: 'pending'
  });
  
  // Tag records with this batch UUID (not yet marked archived)
  await tagRecordsWithBatch(recordIds, batchUuid);
  
  try {
    // Update batch status
    await updateBatchStatus(batchUuid, 'in_progress');
    
    // POST to upstream with batch UUID in payload
    await postToUpstream({
      batch_uuid: batchUuid,  // Upstream can track this
      records: records
    });
    
    // Mark records as archived
    await markRecordsArchived(recordIds);
    
    // Mark batch as completed
    await updateBatchStatus(batchUuid, 'completed');
    
    console.log(`Batch ${batchUuid}: Archived ${recordIds.length} records`);
  } catch (error) {
    // Mark batch as failed
    await updateBatchStatus(batchUuid, 'failed', error.message);
    
    console.error(`Batch ${batchUuid} failed:`, error.message);
    
    // Records remain archived_at=NULL, will be retried in next batch
    // Clear batch UUID so they can be re-assigned
    await clearBatchUuid(recordIds);
  }
}
```

**Pros:**
- Full audit trail of sync attempts
- Can detect and skip duplicate batches on upstream (if batch_uuid already seen)
- Can retry failed batches intelligently
- Better monitoring and debugging

**Cons:**
- More complex implementation
- Additional database table and queries

#### Option C: Upstream Deduplication (Best for Production)

Combine Option B with upstream-side deduplication:

**Regional headlog sends:**
```json
{
  "batch_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "source_instance": "log-dc1.headwall.net",
  "records": [...]
}
```

**Upstream headlog checks:**
```javascript
// Before processing POST /logs
async function handleLogIngestion(request, reply) {
  const { batch_uuid, source_instance, records } = request.body;
  
  if (batch_uuid) {
    // Check if we've already processed this batch
    const existing = await checkBatchAlreadyProcessed(batch_uuid, source_instance);
    
    if (existing) {
      // Idempotent response: return success but don't re-insert
      return reply.code(200).send({
        status: 'ok',
        message: 'Batch already processed (deduplicated)',
        batch_uuid: batch_uuid,
        processed: 0,
        duplicated: records.length
      });
    }
    
    // Track this batch to prevent future duplicates
    await recordBatchReceived(batch_uuid, source_instance);
  }
  
  // Normal ingestion logic...
}
```

**Pros:**
- Safe retries - regional can resend without causing duplicates
- Upstream protects itself from duplicates
- Works even if regional loses tracking data

**Cons:**
- Requires upstream to maintain batch deduplication table
- More complex on both sides

### Recommended Approach

**Phase 1 (MVP):** Option A (mark after POST)
- Simple, works for most cases
- Accept small risk of duplicates on rare network failures

**Phase 2 (Production-Hardened):** Option C (batch tracking + upstream dedup)
- Full idempotency guarantees
- Production-ready for critical workloads

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

5. **Later (after retention period):**
   ```sql
   DELETE FROM log_records 
   WHERE archived_at < NOW() - INTERVAL 7 DAY;
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

### Phase 2: Enhanced Idempotency (v1.6.0)

1. **Batch tracking:**
   - Add `upstream_sync_batches` table
   - Implement Option C (batch UUID + deduplication)

2. **Upstream deduplication:**
   - Modify `POST /logs` to detect batch UUIDs
   - Maintain batch deduplication cache

3. **Retry logic:**
   - Exponential backoff
   - Failed batch recovery
   - Manual retry CLI command

### Phase 3: Advanced Features (v1.7.0)

1. **Health monitoring:**
   - Extend `/health` endpoint
   - Add Prometheus metrics export

2. **Regional retention:**
   - Automatic purge of archived records
   - Configurable retention policies per instance

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

- Validate batch UUIDs are properly formatted UUIDs
- Verify `source_instance` matches authenticated API key
- Limit batch sizes to prevent memory exhaustion
- Rate limit upstream sync requests (separate from web server rate limits)

## Design Decisions

### Archived Records Purging

**Decision:** Automatic purging with configurable retention period

Regional instances should automatically purge archived records after `UPSTREAM_RETENTION_DAYS` to prevent unbounded disk growth. The central instance keeps all records according to its own housekeeping policy.

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
