# API-Based Log Querying Design

This document outlines the design for querying log records via REST API endpoints, building on the analysis in `querying-logs.md`.

## Table of Contents

- [Design Goals](#design-goals)
- [API Endpoint Design](#api-endpoint-design)
- [Query Approaches](#query-approaches)
- [Predefined Query Library](#predefined-query-library)
- [Implementation Plan](#implementation-plan)
- [Security Considerations](#security-considerations)
- [Example Usage](#example-usage)

## Design Goals

1. **Flexible ad-hoc querying** for exploration and custom analysis
2. **Predefined security patterns** for common botnet/attack detection
3. **Performance optimization** via field selection and pagination
4. **Rate limiting** to prevent query abuse
5. **API key authentication** for all query access
6. **Comprehensive filtering** by time, domain, log type, status codes, etc.

## API Endpoint Design

### Primary Query Endpoint

```
GET /logs?[parameters]
```

All parameters are optional. Without parameters, returns recent logs with pagination.

### Query Parameters

#### Common Filters (All Query Types)

| Parameter   | Type             | Description                 | Example                |
| ----------- | ---------------- | --------------------------- | ---------------------- |
| `log_type`  | `access\|error`  | Filter by log type          | `access`               |
| `from`      | ISO 8601         | Start timestamp             | `2025-12-01T00:00:00Z` |
| `to`        | ISO 8601         | End timestamp               | `2025-12-07T23:59:59Z` |
| `domain`    | string           | Filter by website domain    | `example.org`          |
| `host`      | string           | Filter by server hostname   | `server01`             |
| `code`      | string           | HTTP status code(s)         | `404,500,503`          |
| `remote`    | string           | Client IP address           | `192.168.1.100`        |
| `page`      | integer          | Page number (1-based)       | `1`                    |
| `page_size` | integer or `all` | Results per page (max 1000) | `100`                  |
| `sort`      | `asc\|desc`      | Sort by timestamp           | `desc`                 |

#### Approach 1: Field-Based Queries (Flexible)

For ad-hoc analysis with direct field access:

| Parameter | Type   | Description     | Example                                                  |
| --------- | ------ | --------------- | -------------------------------------------------------- |
| `field`   | string | JSON field path | `data.path` or `data.agent`                              |
| `match`   | string | Match type      | `exact`, `contains`, `regex`, `starts_with`, `ends_with` |
| `value`   | string | Value to match  | `wp-admin` or URL-encoded regex                          |

**Examples:**

```bash
# Find all requests to wp-admin paths
GET /logs?log_type=access&field=data.path&match=contains&value=wp-admin&page_size=100

# Find user agents matching botnet pattern (URL-encoded regex)
GET /logs?log_type=access&field=data.agent&match=regex&value=%5E%28curl%7Cwget%29&page_size=50

# Find specific IP activity
GET /logs?remote=86.20.152.215&from=2025-12-07T00:00:00Z&page_size=all
```

#### Approach 2: Predefined Query Templates (Recommended for Security)

For common security analysis patterns:

| Parameter | Type   | Description           | Example                                            |
| --------- | ------ | --------------------- | -------------------------------------------------- |
| `query`   | string | Predefined query name | `wp-vuln-probe`, `sql-injection`, `scanner-agents` |

**Examples:**

```bash
# WordPress vulnerability probing
GET /logs?query=wp-vuln-probe&from=2025-12-01&to=2025-12-07&domain=example.org&page_size=all

# SQL injection attempts
GET /logs?query=sql-injection&from=2025-12-07T00:00:00Z&page_size=100

# Directory traversal attempts
GET /logs?query=directory-traversal&domain=example.org&page=1&page_size=50
```

### Response Format

```json
{
  "status": "ok",
  "query": {
    "type": "predefined",
    "name": "wp-vuln-probe",
    "filters": {
      "log_type": "access",
      "from": "2025-12-01T00:00:00Z",
      "to": "2025-12-07T23:59:59Z",
      "domain": "example.org"
    }
  },
  "pagination": {
    "page": 1,
    "page_size": 100,
    "total_records": 47,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "results": [
    {
      "id": 12345,
      "website_id": 2,
      "domain": "example.org",
      "log_type": "access",
      "timestamp": "2025-12-07T14:32:19Z",
      "host": "server01",
      "code": "404",
      "remote": "192.0.2.100",
      "data": {
        "method": "GET",
        "path": "/wp-content/plugins/vulnerable-plugin/shell.php",
        "protocol": "HTTP/1.1",
        "agent": "Mozilla/5.0 (compatible; scanner/1.0)",
        "referer": "-"
      }
    }
  ]
}
```

### Error Response Format

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_QUERY",
    "message": "Predefined query 'unknown-query' not found",
    "available_queries": ["wp-vuln-probe", "sql-injection", "..."]
  }
}
```

## Query Approaches

### Approach 1: Field-Based Queries

**Use case**: Ad-hoc exploration, custom analysis, one-off investigations

**Advantages**:

- ✅ Maximum flexibility - query any JSON field
- ✅ No code changes needed for new patterns
- ✅ Direct access to raw data structure

**Disadvantages**:

- ⚠️ More complex URL construction
- ⚠️ Requires understanding of data structure
- ⚠️ Potential for inefficient queries
- ⚠️ URL encoding challenges with complex regex

**Implementation approach**:

```javascript
// Build WHERE clause based on field parameter
function buildFieldQuery(params) {
  const field = params.field; // e.g., 'data.path' or 'data.agent'
  const match = params.match; // 'exact', 'contains', 'regex', etc.
  const value = params.value; // the pattern to match

  // Convert 'data.path' to JSON_EXTRACT syntax
  const jsonPath = field.replace('data.', '$.'); // '$.path'
  const extracted = `JSON_UNQUOTE(JSON_EXTRACT(raw_data, '${jsonPath}'))`;

  switch (match) {
    case 'exact':
      return `${extracted} = ?`;
    case 'contains':
      return `${extracted} LIKE ?`; // value wrapped with %
    case 'regex':
      return `${extracted} REGEXP ?`;
    case 'starts_with':
      return `${extracted} LIKE ?`; // value + %
    case 'ends_with':
      return `${extracted} LIKE ?`; // % + value
    default:
      throw new Error('Invalid match type');
  }
}
```

**Security considerations**:

- ⚠️ Validate `field` parameter against whitelist (prevent JSON injection)
- ⚠️ Sanitize regex patterns to prevent ReDoS attacks
- ⚠️ Rate limit more aggressively (regex queries are expensive)
- ⚠️ Consider query timeout limits

### Approach 2: Predefined Query Templates (Recommended)

**Use case**: Security monitoring, scheduled scans, dashboards, repeatable analysis

**Advantages**:

- ✅ Simple, clean API - just specify query name
- ✅ Optimized patterns tested for performance
- ✅ No URL encoding challenges
- ✅ Easier to document and share
- ✅ Can version/improve patterns over time
- ✅ Safe - no user-supplied regex

**Disadvantages**:

- ⚠️ Less flexible - limited to predefined patterns
- ⚠️ Requires code changes to add new patterns

**Implementation approach**:

```javascript
// Query library with pre-tested patterns
const QUERY_LIBRARY = {
  'wp-vuln-probe': {
    name: 'WordPress Vulnerability Probe',
    description: 'Detect attempts to access known WordPress vulnerability paths',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex:
        '(wp-content/plugins/.*\\.(php|bak)|wp-config\\.bak|readme\\.html|license\\.txt|install\\.php|wp-admin/install\\.php)'
    }
  },

  'sql-injection': {
    name: 'SQL Injection Attempts',
    description: 'Detect common SQL injection patterns in URLs',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex: '(union.*select|concat.*0x|benchmark\\(|sleep\\(|or.*1.*=.*1|waitfor.*delay)'
    }
  },

  'scanner-agents': {
    name: 'Scanner User Agents',
    description: 'Identify requests from known scanning tools',
    log_type: 'access',
    pattern: {
      field: '$.agent',
      regex:
        '(nikto|nmap|sqlmap|havij|acunetix|burp|nessus|metasploit|python-requests|curl|wget|scanner|bot)'
    }
  },

  'directory-traversal': {
    name: 'Directory Traversal Attempts',
    description: 'Detect attempts to access files outside web root',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex: '(\\.\\./|\\.\\.\\\\/etc/passwd|/etc/shadow|/proc/self|%2e%2e%2f)'
    }
  },

  'xss-attempts': {
    name: 'Cross-Site Scripting (XSS) Attempts',
    description: 'Detect XSS injection patterns',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex: '(<script|javascript:|onerror=|onload=|eval\\(|alert\\(|document\\.cookie)'
    }
  },

  'backup-files': {
    name: 'Backup File Access',
    description: 'Attempts to access backup or temporary files',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex: '\\.(bak|backup|old|tmp|temp|save|copy|zip|tar\\.gz|sql|db)$'
    }
  },

  'php-shells': {
    name: 'PHP Shell Access',
    description: 'Attempts to access common web shell files',
    log_type: 'access',
    pattern: {
      field: '$.path',
      regex: '(shell\\.php|c99\\.php|r57\\.php|wso\\.php|b374k\\.php|phpinfo\\.php)'
    }
  },

  'failed-logins': {
    name: 'Failed Login Attempts',
    description: 'Failed WordPress login attempts',
    log_type: 'access',
    pattern: {
      field: '$.path',
      value: '/wp-login.php'
    },
    additionalFilters: {
      code: ['401', '403']
    }
  },

  '4xx-errors': {
    name: '4xx Client Errors',
    description: 'All client error responses',
    log_type: 'access',
    pattern: {
      field: '$.code',
      regex: '^4[0-9]{2}$'
    }
  },

  '5xx-errors': {
    name: '5xx Server Errors',
    description: 'All server error responses',
    log_type: 'access',
    pattern: {
      field: '$.code',
      regex: '^5[0-9]{2}$'
    }
  },

  'high-frequency-ips': {
    name: 'High Frequency IP Addresses',
    description: 'IPs making unusually high request rates (potential scanners)',
    log_type: 'access',
    // Special handling: GROUP BY query, not pattern matching
    special: 'aggregate',
    threshold: 100 // requests per hour
  },

  'php-errors': {
    name: 'PHP Error Messages',
    description: 'PHP errors, warnings, and fatal errors',
    log_type: 'error',
    pattern: {
      field: '$.message',
      regex: '(PHP (Fatal error|Warning|Notice)|Uncaught|Fatal error)'
    }
  }
};
```

**Query execution flow**:

```javascript
async function executePredefinedQuery(queryName, filters) {
  const query = QUERY_LIBRARY[queryName];

  if (!query) {
    throw new Error(`Query '${queryName}' not found`);
  }

  // Special handling for aggregate queries
  if (query.special === 'aggregate') {
    return executeAggregateQuery(query, filters);
  }

  // Build SQL with pattern + common filters
  const sql = buildQuerySQL(query, filters);

  return executeQuery(sql);
}
```

## Predefined Query Library

### Security-Focused Queries (High Priority)

These should be implemented first as they provide immediate value for botnet detection:

1. **`wp-vuln-probe`** - WordPress vulnerability scanning
2. **`scanner-agents`** - Known scanning tools
3. **`sql-injection`** - SQL injection attempts
4. **`directory-traversal`** - Path traversal attempts
5. **`xss-attempts`** - Cross-site scripting
6. **`php-shells`** - Web shell access attempts
7. **`backup-files`** - Backup file enumeration
8. **`high-frequency-ips`** - Rate-based scanner detection

### Operational Queries (Medium Priority)

9. **`failed-logins`** - Authentication failures
10. **`4xx-errors`** - All client errors
11. **`5xx-errors`** - All server errors
12. **`php-errors`** - PHP-specific errors

### Management Endpoint

```
GET /logs/queries
```

Returns list of all available predefined queries:

```json
{
  "status": "ok",
  "queries": [
    {
      "name": "wp-vuln-probe",
      "title": "WordPress Vulnerability Probe",
      "description": "Detect attempts to access known WordPress vulnerability paths",
      "log_type": "access",
      "category": "security"
    },
    {
      "name": "sql-injection",
      "title": "SQL Injection Attempts",
      "description": "Detect common SQL injection patterns in URLs",
      "log_type": "access",
      "category": "security"
    }
  ]
}
```

## Implementation Plan

### Phase 1: Core Query Infrastructure (v0.4.0)

**Goal**: Basic predefined query support with essential security patterns

**Tasks**:

1. **Create query library module** (`src/queries/library.js`)
   - Define QUERY_LIBRARY object
   - Implement initial 8 security-focused queries
   - Add query validation function

2. **Enhance queryLogs() service** (`src/services/logService.js`)
   - Add `executePredefinedQuery()` function
   - Implement SQL builder for pattern matching
   - Add pagination logic
   - Handle date/time filtering
   - Support domain/host filtering

3. **Update /logs route** (`src/routes/logs.js`)
   - Parse `query` parameter for predefined queries
   - Parse common filter parameters (from, to, domain, etc.)
   - Parse pagination parameters (page, page_size)
   - Return structured response with metadata

4. **Add /logs/queries route** (`src/routes/logs.js`)
   - Return list of available queries
   - Include query metadata (name, description, category)

5. **Testing**
   - Unit tests for query library
   - Integration tests for query execution
   - Test pagination logic
   - Verify SQL injection prevention

6. **Documentation**
   - Update `docs/api-usage.md` with query examples
   - Document all predefined queries
   - Add example curl commands

### Phase 2: Advanced Features (v0.5.0)

**Goal**: Add field-based queries and aggregate queries

**Tasks**:

1. **Field-based query support**
   - Add field/match/value parameter parsing
   - Implement field whitelist validation
   - Add regex safety checks (timeout, complexity)
   - More aggressive rate limiting for field queries

2. **Aggregate queries**
   - Implement `high-frequency-ips` special query
   - Add support for GROUP BY queries
   - Return aggregated results format

3. **Query result caching**
   - Cache common query patterns
   - Invalidate on new log ingestion
   - Configurable cache TTL

4. **Export functionality**
   - Add `format` parameter (json, csv, ndjson)
   - Support streaming large result sets
   - Generate downloadable reports

### Phase 3: Advanced Analysis (v0.6.0)

**Goal**: Pattern learning and alerting

**Tasks**:

1. **Query scheduling**
   - Run predefined queries on schedule
   - Store results in `security_alerts` table
   - Email/webhook notifications

2. **Pattern versioning**
   - Track query pattern changes
   - Compare results across pattern versions
   - A/B test new detection patterns

3. **IP reputation integration**
   - Check IPs against blocklists
   - Enrich results with ASN/geolocation
   - Automatic blocking recommendations

## Security Considerations

### Input Validation

1. **Predefined queries**: Safe - no user input in SQL
2. **Field queries**:
   - Whitelist allowed fields (`data.path`, `data.agent`, `data.method`, `data.message`)
   - Reject fields outside whitelist
   - Validate match types against enum

3. **Regex patterns** (field queries only):
   - Set maximum pattern length (e.g., 500 chars)
   - Use query timeout (e.g., 5 seconds)
   - Detect potentially expensive patterns (excessive backtracking)
   - Consider disabling backreferences

### Rate Limiting

Different query types should have different rate limits:

```javascript
// Predefined queries: More generous (optimized, safe)
predefined: {
  max: 100,
  timeWindow: '1 minute'
}

// Field queries: More restrictive (potentially expensive)
fieldBased: {
  max: 20,
  timeWindow: '1 minute'
}
```

### Query Timeouts

```javascript
// Set maximum execution time
pool.query({
  sql: querySQL,
  timeout: 5000 // 5 seconds
});
```

### Audit Logging

Log all query executions:

```javascript
{
  timestamp: '2025-12-07T...',
  api_key_id: 123,
  query_type: 'predefined',
  query_name: 'wp-vuln-probe',
  filters: { domain: 'example.org', from: '2025-12-01' },
  execution_time_ms: 234,
  result_count: 47
}
```

## Example Usage

### Security Monitoring Dashboard

```bash
#!/bin/bash
# Daily security report

API_KEY="your-api-key"
BASE_URL="https://log.headwall.net"
FROM="2025-12-07T00:00:00Z"
TO="2025-12-07T23:59:59Z"

echo "=== Security Report for $(date -d "$FROM" +%Y-%m-%d) ==="

# WordPress vulnerability probes
echo -e "\n--- WordPress Vulnerability Probes ---"
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?query=wp-vuln-probe&from=$FROM&to=$TO&page_size=10"

# SQL injection attempts
echo -e "\n--- SQL Injection Attempts ---"
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?query=sql-injection&from=$FROM&to=$TO&page_size=10"

# Scanner user agents
echo -e "\n--- Scanner Activity ---"
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?query=scanner-agents&from=$FROM&to=$TO&page_size=10"

# High frequency IPs
echo -e "\n--- High Frequency IPs ---"
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?query=high-frequency-ips&from=$FROM&to=$TO"
```

### Ad-hoc Investigation (Field Query)

```bash
# Investigate specific path pattern
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?log_type=access&field=data.path&match=regex&value=%5E%2Fadmin" \
  | jq '.results[] | {timestamp, remote, path: .data.path}'
```

### Domain-Specific Analysis

```bash
# All 404s on example.org today
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?domain=example.org&code=404&from=$FROM&to=$TO&page_size=all" \
  | jq '.results | length'
```

### IP Investigation

```bash
# All activity from suspicious IP
curl -H "X-API-Key: $API_KEY" \
  "$BASE_URL/logs?remote=192.0.2.100&from=$FROM&to=$TO&sort=asc" \
  | jq '.results[] | {timestamp, path: .data.path, code}'
```

## Performance Benchmarks

### Expected Query Performance

Based on dataset size and query type:

| Records | Query Type  | Expected Time | Notes                        |
| ------- | ----------- | ------------- | ---------------------------- |
| 10K     | Predefined  | < 100ms       | With proper indexes          |
| 100K    | Predefined  | < 500ms       | Full table scan with regex   |
| 1M      | Predefined  | 1-3s          | Consider optimization        |
| 10K     | Field-based | < 200ms       | Depends on field and pattern |
| 100K    | Field-based | 1-2s          | May need optimization        |
| 1M      | Field-based | 5-10s         | Requires dedicated columns   |

### Optimization Triggers

Consider schema optimization (dedicated columns) when:

- Predefined queries consistently exceed 3 seconds
- Dataset exceeds 1M records
- Running automated scans multiple times per hour
- Dashboard needs sub-second response times

## Next Steps

1. **Review and refine** predefined query patterns
2. **Prioritize Phase 1** implementation (basic predefined queries)
3. **Test query performance** with realistic dataset
4. **Gather feedback** on query results and adjust patterns
5. **Monitor query execution times** and optimize as needed

---

**Related Documents**:

- `docs/querying-logs.md` - Database-level query analysis
- `docs/api-usage.md` - General API documentation
- `docs/rate-limiting.md` - Rate limiting strategy
