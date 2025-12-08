# Storage Optimization for log_records Table

## Current Schema Issues

The `log_records` table has several storage inefficiencies that will become significant at scale:

```sql
CREATE TABLE log_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  website_id INT UNSIGNED NOT NULL,
  log_type ENUM('access', 'error') NOT NULL,
  timestamp DATETIME NOT NULL,              -- 8 bytes (no timezone)
  host VARCHAR(255) NOT NULL,               -- Up to 255 bytes per record
  code VARCHAR(10) DEFAULT NULL,            -- Up to 10 bytes
  remote VARCHAR(45) DEFAULT NULL,          -- IPv6 max length
  raw_data JSON NOT NULL,                   -- Full JSON blob
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ...
);
```

## Optimization Opportunities

### 1. **Deduplicate `host` column** ⭐ BIGGEST WIN

**Problem:**
- `host` stored as VARCHAR(255) on every single log record
- Typical log: millions of records from same ~20-50 hosts
- Storage: 50+ bytes per record × millions = gigabytes of duplicate strings

**Solution:**
Create a `hosts` lookup table:

```sql
CREATE TABLE hosts (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hostname VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hostname (hostname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In log_records, change:
host VARCHAR(255) NOT NULL
-- To:
host_id SMALLINT UNSIGNED NOT NULL,
FOREIGN KEY (host_id) REFERENCES hosts(id)
```

**Savings:**
- Before: 50-255 bytes per record
- After: 2 bytes per record
- **~50-250 bytes saved per record**
- For 10M records: **500MB - 2.5GB saved**

### 2. **Deduplicate `code` column** ⭐ MEDIUM WIN

**Problem:**
- HTTP status codes stored as VARCHAR(10): "200", "404", "500", etc.
- Only ~60 valid HTTP codes exist
- VARCHAR(10) uses 3-11 bytes per record

**Solution:**
Create a `http_codes` lookup table:

```sql
CREATE TABLE http_codes (
  id TINYINT UNSIGNED PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  description VARCHAR(100) DEFAULT NULL,
  INDEX idx_code (code)
) ENGINE=InnoDB;

-- Pre-populate with standard codes
-- ID 0 reserved for N/A (error records without HTTP status)
INSERT INTO http_codes (id, code, description) VALUES
  (0, 'N/A', 'Not applicable (error log)'),
  (200, '200', 'OK'),
  (201, '201', 'Created'),
  (204, '204', 'No Content'),
  (301, '301', 'Moved Permanently'),
  (302, '302', 'Found'),
  (304, '304', 'Not Modified'),
  (400, '400', 'Bad Request'),
  (401, '401', 'Unauthorized'),
  (403, '403', 'Forbidden'),
  (404, '404', 'Not Found'),
  (500, '500', 'Internal Server Error'),
  (502, '502', 'Bad Gateway'),
  (503, '503', 'Service Unavailable');
  -- Add more as needed

-- In log_records, change:
code VARCHAR(10) DEFAULT NULL
-- To:
code_id TINYINT UNSIGNED NOT NULL DEFAULT 0,
FOREIGN KEY (code_id) REFERENCES http_codes(id)
```

**Note:** Foreign key is enforced (NOT NULL). Error records without HTTP status use `code_id=0` (N/A).

**Savings:**
- Before: 3-11 bytes per record
- After: 1 byte per record (TINYINT)
- **~2-10 bytes saved per record**
- For 10M records: **20-100MB saved**

### 3. **Use TIMESTAMP instead of DATETIME** ⭐ SMALL WIN

**Problem:**
- `timestamp DATETIME` = 8 bytes (no timezone awareness)
- `TIMESTAMP` = 4 bytes (UTC-based, timezone-aware)
- Both store to second precision

**Solution:**
```sql
-- Change:
timestamp DATETIME NOT NULL
-- To:
timestamp TIMESTAMP NOT NULL
```

**Savings:**
- **4 bytes per record**
- For 10M records: **40MB saved**
- Bonus: Timezone-aware (converts to UTC automatically)

**Trade-off:**
- TIMESTAMP range: 1970-01-19 to 2038-01-19
- For logs older than 1970 or after 2038, keep DATETIME
- **Recommendation:** TIMESTAMP is fine for active logs

### 4. **Optimize remote (IP address) storage** ⭐ SMALL-MEDIUM WIN

**Problem:**
- `remote VARCHAR(45)` stores IP addresses as strings
- IPv4: "192.168.1.1" = 15 bytes max (but VARCHAR stores length + data)
- IPv6: "2001:0db8:..." = 45 bytes max

**Solution Option A - IP storage optimization:**
```sql
-- Use VARBINARY for more efficient storage
remote VARBINARY(16) DEFAULT NULL COMMENT 'IPv4 (4 bytes) or IPv6 (16 bytes) binary'
```

Store IPs in binary format:
- IPv4: 4 bytes
- IPv6: 16 bytes

**Solution Option B - Deduplicate like hosts:**
```sql
CREATE TABLE remote_ips (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARBINARY(16) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ip (ip)
) ENGINE=InnoDB;

-- In log_records:
remote_id INT UNSIGNED DEFAULT NULL,
FOREIGN KEY (remote_id) REFERENCES remote_ips(id)
```

**Savings (Option A - binary storage):**
- IPv4: 15 bytes → 4 bytes = **11 bytes saved**
- IPv6: 45 bytes → 16 bytes = **29 bytes saved**
- For 10M records: **110-290MB saved**

**Savings (Option B - deduplication):**
- Similar to hosts optimization
- After: 4 bytes per record (INT UNSIGNED)
- **~11-41 bytes saved per record**
- For 10M records: **110-410MB saved**

### 5. **Consider JSON compression** 🤔 COMPLEX

**Problem:**
- `raw_data JSON` stores complete log records
- JSON is text-based and verbose
- MariaDB doesn't compress JSON by default

**Solution Options:**

**Option A - Table compression (ROW_FORMAT=COMPRESSED):**
```sql
ALTER TABLE log_records ROW_FORMAT=COMPRESSED;
```
- MariaDB compresses entire table
- Transparent compression/decompression
- CPU overhead on read/write

**Option B - Application-level compression:**
Store compressed BLOB instead of JSON:
```sql
raw_data BLOB NOT NULL COMMENT 'Gzip-compressed JSON'
```

**Savings:**
- JSON typically compresses 60-80%
- Depends on redundancy in log data
- Trade-off: CPU usage vs storage

**Recommendation:**
- Start with ROW_FORMAT=COMPRESSED (easiest, transparent)
- Consider application compression only if desperate

## Summary of Wins

| Optimization | Bytes Saved/Record | 10M Records | Difficulty | Priority |
|--------------|-------------------|-------------|------------|----------|
| Deduplicate `host` | 48-253 bytes | 480MB-2.5GB | Low | ⭐⭐⭐ HIGH |
| Deduplicate `code` | 2-10 bytes | 20-100MB | Low | ⭐⭐ MEDIUM |
| TIMESTAMP vs DATETIME | 4 bytes | 40MB | Very Low | ⭐ LOW |
| IP binary storage | 11-41 bytes | 110-410MB | Medium | ⭐⭐ MEDIUM |
| JSON compression | 60-80% of JSON | Variable | Medium-High | ⭐ CONSIDER |

**Total savings (hosts + codes + timestamp + IPs):**
- **~65-308 bytes per record**
- **For 10M records: 650MB - 3GB saved**
- **For 100M records: 6.5GB - 30GB saved**

## Recommended Implementation Plan

### Phase 1: Low-Hanging Fruit (v1.1.0)
1. Create `hosts` table and deduplicate
2. Create `http_codes` table and deduplicate
3. Change `timestamp` from DATETIME to TIMESTAMP

**Effort:** 2-3 hours
**Savings:** ~50-260 bytes/record (500MB-2.6GB per 10M records)

### Phase 2: IP Optimization (v1.2.0)
4. Decide: binary storage or deduplication
5. Implement chosen approach

**Effort:** 2-4 hours
**Savings:** Additional ~11-41 bytes/record

### Phase 3: Compression (Future, if needed)
6. Test ROW_FORMAT=COMPRESSED on non-production
7. Measure performance impact
8. Deploy if beneficial

**Effort:** 4-8 hours (testing critical)
**Savings:** Variable, depends on JSON redundancy

## Migration Strategy

**For existing production data:**

1. Create new lookup tables (`hosts`, `http_codes`)
2. Populate from existing `log_records`:
   ```sql
   INSERT INTO hosts (hostname) 
   SELECT DISTINCT host FROM log_records;
   ```
3. Add new foreign key columns (host_id, code_id)
4. Update log_records to populate IDs:
   ```sql
   UPDATE log_records lr
   JOIN hosts h ON lr.host = h.hostname
   SET lr.host_id = h.id;
   ```
5. Drop old VARCHAR columns
6. Update application code to use IDs

**For new deployment:**
- Include optimized schema from day 1
- No migration needed

## Code Changes Required

### 1. Service layer (logService.js)

Current:
```javascript
processedRecords.push([
  websiteId,
  logType,
  timestamp,
  record.host,      // VARCHAR
  record.code || null,  // VARCHAR
  record.remote || null,
  JSON.stringify(record)
]);
```

Optimized:
```javascript
// Find or create host
const hostId = await findOrCreateHost(record.host);

// Find or create HTTP code (use 0 for N/A if no code present)
const codeId = record.code 
  ? await findOrCreateHttpCode(record.code) 
  : 0; // N/A code for error records

processedRecords.push([
  websiteId,
  logType,
  timestamp,
  hostId,           // SMALLINT
  codeId,           // TINYINT (NOT NULL, defaults to 0)
  record.remote || null,
  JSON.stringify(record)
]);
```

### 2. New helper functions needed

```javascript
// hostService.js
const hostCache = new Map(); // In-memory cache to avoid DB roundtrips

async function findOrCreateHost(hostname) {
  if (hostCache.has(hostname)) {
    return hostCache.get(hostname);
  }
  
  const pool = getPool();
  const [rows] = await pool.query(
    'INSERT INTO hosts (hostname) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
    [hostname]
  );
  
  const hostId = rows.insertId;
  hostCache.set(hostname, hostId);
  return hostId;
}

// httpCodeService.js
const codeCache = new Map(); // Pre-populate on startup

async function findOrCreateHttpCode(code) {
  if (codeCache.has(code)) {
    return codeCache.get(code);
  }
  
  const pool = getPool();
  
  // For http_codes, we use the numeric status as the ID
  // e.g., code '404' uses id=404
  const codeNum = parseInt(code, 10);
  
  if (isNaN(codeNum) || codeNum < 0 || codeNum > 255) {
    // Invalid code, return 0 (N/A)
    return 0;
  }
  
  const [rows] = await pool.query(
    'INSERT INTO http_codes (id, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
    [codeNum, code]
  );
  
  const codeId = rows.insertId || codeNum;
  codeCache.set(code, codeId);
  return codeId;
}

// Pre-populate cache on application startup
async function initializeCodeCache() {
  const pool = getPool();
  const [codes] = await pool.query('SELECT id, code FROM http_codes');
  
  for (const row of codes) {
    codeCache.set(row.code, row.id);
  }
  
  console.log(`Loaded ${codes.length} HTTP codes into cache`);
}
```

## Compatibility with Hierarchical Aggregation

The optimized schema is **fully compatible** with the hierarchical aggregation feature:

- Upstream sync uses `raw_data` JSON (unchanged)
- Foreign keys are regional-specific (IDs don't clash)
- Central instance will have its own `hosts`/`http_codes` tables
- No impact on `archived_at` or batch tracking

**Order of implementation:**
1. Storage optimization (v1.1.0-1.2.0)
2. Hierarchical aggregation (v1.5.0)

Storage optimization will make hierarchical aggregation even more valuable (less data to sync/store).

## Risk Assessment

**Low Risk:**
- Deduplication is standard database normalization
- Lookup tables are small and fast
- Foreign keys provide referential integrity
- Can be tested thoroughly before production

**Medium Risk:**
- In-memory caching needs proper invalidation strategy
- Bulk inserts become slightly more complex (lookups first)
- Query JOINs add minor overhead (negligible with proper indexes)

**Mitigation:**
- Comprehensive unit tests
- Load testing with realistic data volumes
- Gradual rollout (test → staging → production)
- Keep migration rollback scripts ready

## Performance Considerations

**Writes:**
- Additional lookups for host_id/code_id
- Mitigated by in-memory caching (1st lookup only)
- Batch operations remain fast

**Reads:**
- JOINs required to get hostname/code strings
- Offset by smaller table size (faster scans)
- Indexes on lookup tables keep JOINs fast
- Most queries benefit from reduced table size

**Net result:** Slightly slower writes, **significantly faster reads** at scale due to smaller table size.

## Decision Time

**Recommendation:** Implement Phase 1 (hosts + codes + timestamp) **before** hierarchical aggregation.

**Rationale:**
- Easiest wins with biggest impact
- Changes schema (easier now than later)
- Makes hierarchical sync more efficient
- Low risk, high reward

**Your call:** Go for it now, or implement hierarchical aggregation first?
