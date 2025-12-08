# Querying Log Records

This document covers strategies for querying and analyzing log records in Headlog, with a focus on security analysis and pattern matching.

## Table of Contents

- [Data Structure](#data-structure)
- [Query Approaches](#query-approaches)
- [Recommended Strategy](#recommended-strategy)
- [Security Analysis Examples](#security-analysis-examples)
- [Performance Considerations](#performance-considerations)
- [Future Enhancements](#future-enhancements)

## Data Structure

### Access Logs (`log_type='access'`)

Access logs contain structured Apache access log data in the `raw_data` JSON column:

```json
{
  "log_timestamp": "2025-12-07T18:41:57.000000Z",
  "remote": "86.20.152.215",
  "user": "-",
  "method": "POST",
  "path": "/wp-admin/admin-ajax.php",
  "protocol": "HTTP/1.1",
  "code": "200",
  "size": "3169",
  "referer": "https://leyland.headwall.tech/wp-admin/",
  "agent": "Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0",
  "source_file": "/var/www/leyland.headwall.tech/log/access.log",
  "host": "leyland"
}
```

**Key field for security analysis**: `path`

### Error Logs (`log_type='error'`)

Error logs contain Apache error log data:

```json
{
  "log_timestamp": "2025-12-07T18:44:23.976190Z",
  "time": "Dec 07 18:44:23.975606 2025",
  "level": "proxy_fcgi:error",
  "pid": "105029:tid 105029",
  "client": "86.20.152.215:0",
  "message": "AH01071: Got error 'PHP message: Always allow', referer: https://...",
  "source_file": "/var/www/leyland.headwall.tech/log/error.log",
  "host": "leyland"
}
```

**Key field for security analysis**: `message`

## Query Approaches

We evaluated three approaches for querying JSON data:

### Option 1: Direct JSON Queries (✓ Recommended)

Query the `raw_data` JSON column directly using MariaDB's JSON functions.

**Advantages**:

- ✅ Zero schema changes required
- ✅ Preserves complete log context
- ✅ Flexible - can query any JSON field
- ✅ Works immediately with existing data
- ✅ MariaDB 11.8 has mature JSON support

**Disadvantages**:

- ⚠️ More verbose SQL syntax
- ⚠️ Slower than indexed columns (for large datasets)

**When to use**: Current recommendation for datasets under 1M records. Re-evaluate if performance becomes an issue.

### Option 2: Add Dedicated Columns

Add separate `path` and `message` columns with indexes.

**Advantages**:

- ✅ Fastest query performance with indexes
- ✅ Simpler SQL syntax
- ✅ Native REGEXP support on indexed columns

**Disadvantages**:

- ❌ Requires schema migration
- ❌ Data duplication (stored in both JSON and column)
- ❌ Need to backfill existing records
- ❌ Migration complexity

**When to use**: If dataset grows beyond 1-5M records and performance degrades.

### Option 3: Generated/Virtual Columns

Use MariaDB's generated columns to extract JSON fields automatically.

**Advantages**:

- ✅ No data duplication
- ✅ Can be indexed (if stored, not virtual)
- ✅ Automatically maintained

**Disadvantages**:

- ❌ More complex schema
- ❌ STORED generated columns use disk space
- ❌ VIRTUAL generated columns can't be indexed
- ❌ Still requires migration

**When to use**: Middle ground between Options 1 and 2, if you need better performance but want to avoid full duplication.

## Recommended Strategy

**Start with Option 1 (Direct JSON Queries)**

Given our current dataset size (hundreds of records) and MariaDB's strong JSON support, we recommend querying JSON directly without schema changes.

**Reasoning**:

1. **Simplicity**: No migrations, no backfills, works with existing data
2. **Flexibility**: Can query any field in raw_data, not just path/message
3. **Performance**: Adequate for small-to-medium datasets (< 1M records)
4. **Future-proof**: Can migrate to dedicated columns if performance becomes an issue

**Re-evaluation triggers**:

- Dataset exceeds 1M records
- Security queries take > 2-3 seconds
- Running automated scans that need faster response times

## Security Analysis Examples

### Find Suspicious PHP Files (Access Logs)

Look for common exploit files in request paths:

```sql
-- Find requests to common exploit files
SELECT
  id,
  website_id,
  timestamp,
  host,
  code,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.agent')) as user_agent
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) REGEXP '(install\\.php|shell\\.php|wp-config\\.bak|config\\.bak|phpinfo\\.php)'
ORDER BY timestamp DESC;
```

### Find Backup File Access Attempts

```sql
-- Find attempts to access backup files
SELECT
  id,
  timestamp,
  host,
  code,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) REGEXP '\\.(bak|backup|old|zip|tar\\.gz|sql)$'
ORDER BY timestamp DESC
LIMIT 50;
```

### Find SQL Injection Attempts

```sql
-- Look for SQL injection patterns in paths
SELECT
  id,
  timestamp,
  host,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) REGEXP '(union.*select|concat.*0x|benchmark\\(|sleep\\()'
ORDER BY timestamp DESC
LIMIT 50;
```

### Find XSS Attempts

```sql
-- Look for common XSS patterns
SELECT
  id,
  timestamp,
  host,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) REGEXP '(<script|javascript:|onerror=|onload=)'
ORDER BY timestamp DESC
LIMIT 50;
```

### Find Directory Traversal Attempts

```sql
-- Look for directory traversal patterns
SELECT
  id,
  timestamp,
  host,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) REGEXP '\\.\\./|\\.\\.\\\\|/etc/passwd|/etc/shadow'
ORDER BY timestamp DESC
LIMIT 50;
```

### Analyze Error Messages

```sql
-- Search error logs for specific patterns
SELECT
  id,
  timestamp,
  host,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.level')) as error_level,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.message')) as message
FROM log_records
WHERE log_type = 'error'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.message')) REGEXP '(fatal|segfault|denied|permission)'
ORDER BY timestamp DESC
LIMIT 50;
```

### Track Failed Login Attempts

```sql
-- Find failed WordPress login attempts
SELECT
  id,
  timestamp,
  host,
  remote,
  code,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.agent')) as user_agent
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) = '/wp-login.php'
  AND code IN ('401', '403')
ORDER BY timestamp DESC;
```

### Identify Scanning Activity

```sql
-- Find rapid requests from single IP (potential scanner)
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.remote')) as ip_address,
  COUNT(*) as request_count,
  MIN(timestamp) as first_request,
  MAX(timestamp) as last_request,
  TIMESTAMPDIFF(SECOND, MIN(timestamp), MAX(timestamp)) as duration_seconds
FROM log_records
WHERE log_type = 'access'
  AND timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY ip_address
HAVING request_count > 100
ORDER BY request_count DESC;
```

### Find Suspicious User Agents

```sql
-- Find requests with suspicious or scanner user agents
SELECT
  id,
  timestamp,
  host,
  remote,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path,
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.agent')) as user_agent
FROM log_records
WHERE log_type = 'access'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.agent')) REGEXP '(bot|scanner|crawler|nikto|nmap|sqlmap|havij)'
ORDER BY timestamp DESC
LIMIT 50;
```

## Performance Considerations

### JSON Query Performance

MariaDB's JSON functions are reasonably performant for small-to-medium datasets:

- **< 100K records**: Queries typically complete in < 500ms
- **100K - 1M records**: Queries may take 1-3 seconds
- **> 1M records**: Consider adding indexed columns

### Optimization Tips

1. **Use WHERE filters first**:

   ```sql
   -- Good: Filter by indexed columns first
   WHERE log_type = 'access'
     AND timestamp > DATE_SUB(NOW(), INTERVAL 1 DAY)
     AND JSON_UNQUOTE(...)
   ```

2. **Extract once, use multiple times**:

   ```sql
   -- Use subquery to extract JSON once
   SELECT * FROM (
     SELECT
       id,
       JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')) as path
     FROM log_records
     WHERE log_type = 'access'
   ) AS extracted
   WHERE path REGEXP 'pattern';
   ```

3. **Limit result sets**:

   ```sql
   -- Always use LIMIT for exploration
   ORDER BY timestamp DESC
   LIMIT 100;
   ```

4. **Use existing indexes**:
   - `log_type` - always filter by this first
   - `timestamp` - use for date range filtering
   - `host` - filter by website
   - `code` - filter by HTTP status
   - `remote` - filter by IP address

## Future Enhancements

### When to Add Dedicated Columns

Consider migrating to dedicated columns when:

1. **Performance degrades**: Queries take > 3 seconds regularly
2. **Dataset grows large**: Exceeds 1M log records
3. **Automated scanning**: Building automated security scanners that need fast response times
4. **Frequent queries**: The same JSON fields are queried constantly

### Potential Schema Changes (Future)

If performance becomes an issue, consider:

```sql
-- Add generated columns (stored for indexing)
ALTER TABLE log_records
ADD COLUMN path VARCHAR(2048)
  AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.path')))
  STORED,
ADD COLUMN message TEXT
  AS (JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.message')))
  STORED;

-- Add indexes
CREATE INDEX idx_path ON log_records(path);
CREATE INDEX idx_message_fulltext ON log_records(message) USING FULLTEXT;
```

### Alternative: Aggregation Tables

For security monitoring, consider creating aggregate tables:

```sql
-- Table for suspicious requests (populated by scheduled job)
CREATE TABLE security_alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  log_record_id BIGINT UNSIGNED NOT NULL,
  alert_type ENUM('exploit_file', 'sql_injection', 'xss', 'directory_traversal', 'scanner'),
  severity ENUM('low', 'medium', 'high', 'critical'),
  matched_pattern VARCHAR(255),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (log_record_id) REFERENCES log_records(id) ON DELETE CASCADE,
  INDEX idx_alert_type (alert_type),
  INDEX idx_severity (severity),
  INDEX idx_detected_at (detected_at)
);
```

This approach:

- ✅ Keeps raw logs pristine
- ✅ Provides fast security dashboard queries
- ✅ Allows pattern updates without schema changes
- ✅ Can be rebuilt/backfilled as detection rules improve

## Conclusion

**Current Recommendation**: Use direct JSON queries (Option 1)

This approach provides the best balance of:

- Simplicity (no schema changes)
- Flexibility (query any field)
- Performance (adequate for current scale)
- Future compatibility (can migrate later if needed)

Start with the security query examples above and monitor performance. If queries become slow (> 2-3 seconds), revisit this document and consider implementing dedicated columns or aggregate tables.
