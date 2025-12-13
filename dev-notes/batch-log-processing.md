# Batch Log Processing & Security Analysis

## Overview

Post-ingestion batch processing system for detecting security threats and bot activity in log data. The system analyzes log records against configurable rules, produces structured JSON output, and invokes external tools for downstream processing (firewall updates, IP reputation tracking, customer reports).

**Core Philosophy:**

- Headlog handles rule management, pattern matching, and deduplication
- External tools handle business logic (API posting, alerts, reporting)
- Clean separation of concerns with secure tool invocation

## Core Requirements

### 1. Event Classification

**Goal:** Flexible, user-defined event type taxonomy

**Design:**

- Event types stored in `event_types` table (not hardcoded)
- Users define their own classification scheme
- No default/seed data - each deployment customizes to their needs
- Suggested types documented for reference (see Recommended Event Types section)

**Rationale:**

- Different hosting providers need different granularity levels
- Some may track 2-3 broad categories, others need 10+ specific types
- Examples: `malicious-bot`, `vulnerability-probe`, `protocol-abuse`, `failed-login-abuse`, etc.
- Each event type can route to different external tools

### 2. IP Address Exclusion

**Goal:** Exclude specific IP addresses from security analysis

**Use Cases:**

- Localhost addresses (127.0.0.1, ::1)
- Web server public IPs (prevent false positives from server-to-server traffic)
- Monitoring systems (uptime checks, health probes)
- Trusted administrative IPs

**Design:**

- IP addresses stored in `ip_addresses` table
- Linked to hosts via `host_id` foreign key
- Generic "localhost" host for 127.0.0.1 and ::1
- Each physical host can have multiple IPs (IPv4, IPv6, private IPs)
- Exclusion check happens before rule matching

**Example:**

```
Host: hhw6.headwall-hosting.com
IPs: 139.28.16.202, 139.28.16.203, 139.28.16.204, 139.28.16.205, 139.28.16.206, 10.0.0.16, fd86:ea04:1111::16

Host: localhost
IPs: 127.0.0.1, ::1
```

### 3. Rule Sources

**Two complementary rule sources:**

#### A. User-Defined Rules (Database)

```sql
CREATE TABLE security_rules (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  log_type ENUM('access', 'error') NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  trigger_pattern TEXT NOT NULL,
  output_pattern TEXT,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_log_type_enabled (log_type, enabled)
);
```

**Example:**

```sql
INSERT INTO security_rules (rule_name, log_type, event_type, trigger_pattern, description)
VALUES (
  'backdoor-shells',
  'access',
  'vulnerability-probe',
  '\\b(vuln|backdoor|shell|shells|alfashell)\\.php',
  'Backdoor shell upload attempts'
);
```

#### B. Fail2ban Filter Import (Filesystem)

**Auto-import from fail2ban filter definitions:**

```bash
/etc/fail2ban/filter.d/apache-badurls.conf
/etc/fail2ban/filter.d/apache-shellshock.conf
/etc/fail2ban/filter.d/wordpress-hard.conf
```

**Mapping:**

- Read `failregex` patterns from fail2ban conf files
- Map filter name to event_type (configurable mapping)
- Import as read-only rules (marked with `source='fail2ban'`)
- Re-import on demand or schedule

**Benefits:**

- Reuse existing security definitions
- Cross-reference with real-time fail2ban blocks
- Consistency between real-time and batch processing

### 3. Analysis Output Format

**Structured JSON output for external tool consumption:**

```json
{
  "analysis": {
    "batch_id": "20251213-090000-abc123",
    "started": "2025-12-13T09:00:00Z",
    "finished": "2025-12-13T09:01:23Z",
    "records_scanned": 12450,
    "records_matched": 37,
    "rules_applied": 15
  },
  "violations": [
    {
      "violation_id": "viol_001",
      "timestamp": "2025-12-08T20:43:01.000Z",
      "website": "example.org",
      "hostname": "hhw1.headwall-hosting.com",
      "remote_ip": "192.168.1.100",
      "log_type": "access",
      "event_type": "vulnerability-probe",  -- joined from event_types table
      "event_severity": "high",
      "matched_rules": ["backdoor-shells"],  -- may contain multiple if rules matched
      "matched_pattern": "shell.php",  -- from first/primary matched rule
      "raw_log_excerpt": "GET /wp-content/uploads/shell.php HTTP/1.1"
    },
    {
      "violation_id": "viol_002",
      "timestamp": "2025-12-08T20:44:07.000Z",
      "website": "foobar.com",
      "hostname": "hhw1.headwall-hosting.com",
      "remote_ip": "10.0.0.50",
      "log_type": "access",
      "event_type": "malicious-bot",  -- joined from event_types table
      "event_severity": "medium",
      "matched_rules": ["bad-bots-scrapers", "aggressive-crawlers"],  -- multiple rules matched
      "matched_pattern": "Bytespider",
      "raw_log_excerpt": "User-Agent: Mozilla/5.0 (compatible; Bytespider)"
    }
  ]
}
```

### 4. External Tool Integration

**Security-First Design:**

- Tool paths defined in **config file** (NOT database - prevents RCE)
- Tools are external executables (bash scripts, Python, etc.)
- Headlog invokes tools and passes structured data
- No dynamic code evaluation

**Configuration File:** `config/analysis-tools.json`

```json
{
  "tools": {
    "batch_processors": [
      {
        "name": "ip-reputation-bulk",
        "command": "/home/user/scripts/bulk-ip-reputation.sh",
        "description": "Bulk update IP reputation database",
        "pass_full_analysis": true
      }
    ],
    "violation_processors": [
      {
        "name": "firewall-blocker",
        "command": "/home/user/scripts/update-firewall.sh",
        "event_types": ["vulnerability-probe", "malicious-bot"],
        "description": "Update network firewall rules"
      },
      {
        "name": "customer-alerter",
        "command": "/home/user/scripts/notify-customer.sh",
        "event_types": ["vulnerability-probe"],
        "description": "Send security alert to website owner"
      },
      {
        "name": "abuse-reporter",
        "command": "/usr/local/bin/report-abuse.py",
        "event_types": ["malicious-bot", "protocol-abuse"],
        "description": "Report to abuse contact databases"
      }
    ]
  }
}
```

**Invocation Pattern:**

**A. Batch Tools** (receive full analysis JSON):

```bash
cat analysis_output.json | /home/user/scripts/bulk-ip-reputation.sh
```

**B. Per-Violation Tools** (receive individual violation JSON via STDIN):

```bash
# For each violation matching tool's event_types:
echo '{"violation_id":"viol_001","timestamp":"..."}' | /home/user/scripts/update-firewall.sh
```

**Tool Output Handling:**

- Tools write to stdout/stderr (logged by headlog)
- Exit code 0 = success
- Non-zero exit code = failure (logged, but processing continues)
- Optional: Tools can write status to file for async tracking

### 5. Processing Workflow

```
1. Query unprocessed log records (using watermark)
   ↓
2. Load excluded IPs from host_ip_addresses table
   ↓
3. Load enabled rules (database + imported fail2ban), ordered by severity DESC
   ↓
4. For each log record:
   a. Extract remote IP from raw_data
   b. If IP in exclusion list → skip record
   c. Apply all matching rules
   d. If multiple rules match → select highest severity event type
   e. Create ONE event with matched_rules array
   ↓
5. Insert events into security_events table (UNIQUE on log_record_id)
   ↓
6. Update processing watermark
   ↓
7. Generate JSON output
   ↓
8. Invoke batch_processors (pass full JSON)
   ↓
9. Invoke violation_processors (pass individual violations)
   ↓
10. Log results and metrics
```

### 6. Deduplication Strategy

**Problem:** Don't want to report same violation multiple times

**Solution:** Track processed log records with watermark

- `processing_watermark` table tracks last processed log_record.id
- Query `WHERE id > last_watermark`
- Once processed, watermark advances
- Log record never re-analyzed (unless watermark manually reset)

**Note:** This differs from hierarchical sync - we don't need per-rule tracking here because each log record is analyzed exactly once against all rules.

## Security Considerations

1. **No Database-Stored Executables**
   - Tool paths in config file only
   - Config file requires filesystem access to modify
   - Prevents SQL injection → RCE

2. **Sanitized Input**
   - All data passed via STDIN (no shell argument injection)
   - JSON escaped properly
   - No eval() or exec() of untrusted data

3. **Least Privilege**
   - External tools run as same user as headlog process
   - Consider separate service account for tool execution
   - Tools can't write to headlog database directly

4. **Audit Trail**
   - All tool invocations logged with timestamps
   - Tool output captured in logs
   - Failed executions tracked

## Functional Requirements

1. **Rule Management**
   - User-defined rules stored in database (CRUD via CLI)
   - Auto-import fail2ban filter regexes from filesystem
   - Support for both access_log and error_log formats
   - Rules map to event_types (malicious-bot, vulnerability-probe, etc.)
   - Enable/disable rules without deletion

2. **Pattern Matching Engine**
   - Regex-based matching against log data
   - Extract specific fields (IP, user agent, path, etc.) using capture groups
   - Support for negative patterns (NOT matching)
   - Efficient batch processing with compiled regex caching

3. **Batch Processing**
   - Process records in configurable batches (default: 10,000 records)
   - Watermark-based tracking (last processed log_record.id)
   - Each record analyzed exactly once against all enabled rules
   - Gracefully handle large datasets (millions of records)
   - Cron-based execution (default: every 1 minute)

4. **Deduplication & Event Selection**
   - One log record generates at most ONE event
   - Multiple rules may match, but only highest severity event is created
   - All matching rule names stored in event's `matched_rules` JSON field
   - Track using UNIQUE(log_record_id)
   - Watermark ensures log records never re-analyzed
   - IPs in `host_ip_addresses` excluded before rule matching

5. **Result Storage**
   - Store detected violations in security_events table
   - Link back to original log_record
   - Include extracted fields (IP, path, user-agent, etc.)
   - Enable querying by website, hostname, event_type, rule_name, time range

6. **External Tool Execution**
   - Invoke batch processors (receive full analysis JSON)
   - Invoke per-violation processors (receive individual violation JSON)
   - Filter tools by event_type (e.g., only run firewall tool for high-severity events)
   - Log all tool invocations with output and exit codes
   - Timeouts and error handling for misbehaving tools

7. **CLI Management**
   - `event-types:list` - Show all event types
   - `event-types:add <name> [--severity X] [--description Y]` - Create new event type
   - `event-types:delete <name>` - Delete unused event type
   - `hosts:list-ips <hostname>` - Show excluded IPs for a host
   - `hosts:add-ip <hostname> <ip> [--description X]` - Add IP to exclusion list
   - `hosts:remove-ip <hostname> <ip>` - Remove IP from exclusion list
   - `security:analyze` - Run batch analysis (manual or cron)
   - `rules:list` - Show all rules (database + fail2ban)
   - `rules:add` - Create new user-defined rule (prompts for event type)
   - `rules:import-fail2ban` - Import fail2ban filters
   - `events:query` - Query detected violations with filters
   - `watermark:reset` - Reset processing watermark (re-analyze all logs)

8. **Performance Targets**
   - Analyze 10,000 records in <60 seconds
   - Minimal memory footprint (process in streaming fashion)
   - Efficient indexing for pattern matching and querying

## Schema Design

### Core Tables

#### 1. event_types - Classification Taxonomy

```sql
CREATE TABLE event_types (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name)
);
```

**Note:** Table is not seeded - users define their own event types. See "Recommended Event Types" section for suggested starter set.

#### 2. host_ip_addresses - IP Exclusion List

```sql
CREATE TABLE host_ip_addresses (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  host_id INT UNSIGNED NOT NULL,
  ip_address VARCHAR(45) NOT NULL,  -- supports IPv4 and IPv6
  ip_version ENUM('4', '6') NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE,
  UNIQUE KEY uk_host_ip (host_id, ip_address),
  INDEX idx_ip_address (ip_address)
);
```

**Example Data:**

```sql
-- Localhost
INSERT INTO hosts (hostname, description) VALUES ('localhost', 'Local loopback addresses');
SET @localhost_id = LAST_INSERT_ID();

INSERT INTO host_ip_addresses (host_id, ip_address, ip_version, description) VALUES
(@localhost_id, '127.0.0.1', '4', 'IPv4 loopback'),
(@localhost_id, '::1', '6', 'IPv6 loopback');

-- Web server
INSERT INTO host_ip_addresses (host_id, ip_address, ip_version, description)
SELECT id, '139.28.16.202', '4', 'Public IPv4' FROM hosts WHERE hostname = 'hhw6.headwall-hosting.com';
```

**Usage:** Before applying rules to a log record, extract the remote IP and check if it exists in `host_ip_addresses`. If found, skip analysis for that record.

#### 3. security_rules - User-Defined Rules

```sql
CREATE TABLE security_rules (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  source ENUM('user-defined', 'fail2ban-import') DEFAULT 'user-defined',
  fail2ban_jail_name VARCHAR(100) NULL,  -- for fail2ban imports
  log_type ENUM('access', 'error') NOT NULL,
  event_type_id INT UNSIGNED NOT NULL,  -- foreign key to event_types
  trigger_pattern TEXT NOT NULL,  -- regex to match in raw_data
  output_pattern TEXT NULL,  -- regex to extract fields (IP, path, etc.)
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (event_type_id) REFERENCES event_types(id) ON DELETE RESTRICT,
  INDEX idx_log_type_enabled (log_type, enabled),
  INDEX idx_event_type (event_type_id),
  INDEX idx_source (source)
);
```

**Note:** Rules are applied in order of severity (high → low). If multiple rules match one log record, the highest severity event wins.

**Example User-Defined Rule:**

```sql
-- First, create the event type (one-time setup)
INSERT INTO event_types (name, description, severity)
VALUES ('vulnerability-probe', 'Attempts to access sensitive files or exploit vulnerabilities', 'high');

-- Then create the rule
INSERT INTO security_rules (
  rule_name, log_type, event_type_id, trigger_pattern, output_pattern, description
) VALUES (
  'backdoor-shells',
  'access',
  (SELECT id FROM event_types WHERE name = 'vulnerability-probe'),
  '\\b(vuln|backdoor|shell|shells|alfashell)\\.php',
  '"remote_ip":\\s*"([^"]+)"',
  'Backdoor shell upload attempts'
);
```

**Example Fail2ban Import:**

```sql
INSERT INTO security_rules (
  rule_name, source, fail2ban_jail_name, log_type, event_type_id,
  trigger_pattern, description
) VALUES (
  'apache-shellshock',
  'fail2ban-import',
  'apache-shellshock',
  'access',
  (SELECT id FROM event_types WHERE name = 'vulnerability-probe'),
  '\\(\\) \\{',  -- shellshock pattern from fail2ban filter
  'Shellshock exploit attempts (imported from fail2ban)'
);
```

#### 4. processing_watermark - Track Processing Progress

```sql
CREATE TABLE processing_watermark (
  id INT PRIMARY KEY AUTO_INCREMENT,
  processor_name VARCHAR(100) NOT NULL UNIQUE,
  last_processed_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_run_at TIMESTAMP NULL,
  records_processed INT UNSIGNED DEFAULT 0,
  violations_found INT UNSIGNED DEFAULT 0,

  INDEX idx_processor (processor_name)
);
```

#### 5. security_events - Detected Violations

```sql
CREATE TABLE security_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  log_record_id BIGINT UNSIGNED NOT NULL,
  event_type_id INT UNSIGNED NOT NULL,
  matched_rules JSON NOT NULL,  -- array of rule names that matched
  extracted_data JSON NULL,  -- IP, path, user-agent, etc.
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (log_record_id) REFERENCES log_records(id) ON DELETE CASCADE,
  FOREIGN KEY (event_type_id) REFERENCES event_types(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_log_record (log_record_id),  -- ONE event per log record
  INDEX idx_event_type (event_type_id),
  INDEX idx_detected_at (detected_at)
);
```

**Design Notes:**

- **Watermark Strategy**: Process records once using `id > last_processed_id`
- **One Event Per Log Record**: `UNIQUE(log_record_id)` ensures each log record generates at most ONE event
- **Multiple Rule Matches**: If multiple rules match, highest severity event type wins
- **Matched Rules Tracking**: All matching rule names stored in `matched_rules` JSON array
- **No Re-Processing**: Once watermark advances, records are never re-analyzed (unless watermark manually reset)

**Rule Selection Logic:**

1. Apply all enabled rules to log record
2. If no rules match → no event created
3. If one rule matches → create event with that rule's event type
4. If multiple rules match → group by event_type_id, select highest severity
5. Store all matched rule names in `matched_rules` array

### Recommended Approach: Watermark + Events Table

**Why This Works:**

1. **Efficiency**: Watermark allows quick queries (`WHERE id > watermark`)
2. **Tracking**: Events table stores all detected violations for querying/reporting
3. **Deduplication**: UNIQUE constraint prevents duplicate violations
4. **Simplicity**: No need to track per-rule processing state

**Processing Flow:**

```sql
-- 1. Get watermark
SELECT last_processed_id FROM processing_watermark WHERE processor_name = 'security-analyzer';

-- 2. Get next batch
SELECT * FROM log_records WHERE id > ? ORDER BY id ASC LIMIT 10000;

-- 3. Apply all enabled rules to batch

-- 4. Insert violations (INSERT IGNORE for idempotency)
INSERT IGNORE INTO security_events (log_record_id, rule_name, event_type, extracted_data)
VALUES (?, ?, ?, ?);

-- 5. Update watermark
UPDATE processing_watermark
SET last_processed_id = ?,
    last_run_at = NOW(),
    records_processed = records_processed + ?,
    violations_found = violations_found + ?
WHERE processor_name = 'security-analyzer';
```

## Rules Configuration Format

User-defined rules use database storage (security_rules table). External tool configuration uses separate config file.

### Fail2ban Import Format

**Source:** `/etc/fail2ban/filter.d/apache-shellshock.conf`

```ini
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) .* \\(\\) \\{"
ignoreregex =
```

**Import Process:**

1. Parse `failregex` line from conf file
2. Extract pattern: `\\(\\) \\{` (shellshock signature)
3. Map filter name to event_type (configurable mapping)
4. Create security_rule with `source='fail2ban-import'`
5. Store original jail name for cross-reference

**CLI Command:**

```bash
node cli.js rules:import-fail2ban --filter apache-shellshock --event-type vulnerability-probe
```

## External Tools Configuration

**File:** `config/analysis-tools.json`

```json
{
  "batch_tools": [
    {
      "name": "bulk-ip-reputation",
      "command": "/home/user/scripts/bulk-ip-reputation.sh",
      "timeout": 120,
      "description": "Update IP reputation database with all detected threats"
    }
  ],
  "violation_tools": [
    {
      "name": "firewall-blocker",
      "command": "/home/user/scripts/update-firewall.sh",
      "event_types": ["vulnerability-probe", "malicious-bot"],  -- matches event_types.name
      "timeout": 30,
      "description": "Add IPs to network firewall blocklist"
    },
    {
      "name": "customer-alert",
      "command": "/home/user/scripts/notify-customer.sh",
      "event_types": ["vulnerability-probe"],  -- matches event_types.name
      "timeout": 60,
      "description": "Send security alert email to website owner"
    },
    {
      "name": "abuse-reporter",
      "command": "/usr/local/bin/report-abuse.py",
      "event_types": ["malicious-bot", "protocol-abuse"],  -- matches event_types.name
      "timeout": 90,
      "description": "Report to abuse contact databases (AbuseIPDB, etc.)"
    }
  ]
}
```

**Tool Invocation:**

```javascript
// Batch tool execution
const analysis = {
  analysis: { batch_id, started, finished, records_scanned, records_matched },
  violations: [...]
};

execSync(`echo '${JSON.stringify(analysis)}' | ${tool.command}`, {
  timeout: tool.timeout * 1000,
  encoding: 'utf-8'
});

// Per-violation tool execution
for (const violation of violations) {
  if (tool.event_types.includes(violation.event_type)) {
    execSync(`echo '${JSON.stringify(violation)}' | ${tool.command}`, {
      timeout: tool.timeout * 1000,
      encoding: 'utf-8'
    });
  }
}
```

## Use Cases

### UC1: Daily Botnet Sweep

**Actor**: System (cron)  
**Goal**: Identify botnet activity across all websites  
**Flow**:

1. Cron triggers security analyzer every minute
2. Query unprocessed log records (watermark-based)
3. Apply enabled rules for malicious-bot event type
4. Insert violations into security_events
5. Update watermark
6. Generate JSON output with violations
7. Invoke firewall-blocker tool (passes IPs via STDIN)
8. Invoke abuse-reporter tool (reports to AbuseIPDB)

### UC2: Vulnerability Probe Detection

**Actor**: System (cron)  
**Goal**: Detect exploitation attempts and alert customers  
**Flow**:

1. Query unprocessed log records
2. Apply vulnerability-probe rules (shell.php, wp-config.php.bak, etc.)
3. Extract IPs, paths, and timestamps
4. Insert violations into security_events
5. Generate JSON output
6. Invoke firewall-blocker (block attacking IPs)
7. Invoke customer-alert (email website owners)

### UC3: Fail2ban Rule Synchronization

**Actor**: Administrator (manual CLI)  
**Goal**: Import existing fail2ban rules into headlog  
**Flow**:

1. Admin runs: `node cli.js rules:import-fail2ban --filter apache-shellshock`
2. System reads `/etc/fail2ban/filter.d/apache-shellshock.conf`
3. Extracts `failregex` patterns
4. Prompts for event_type mapping
5. Inserts rule into security_rules with `source='fail2ban-import'`
6. Future analysis runs now use this rule
7. Violations can be cross-referenced with fail2ban jail logs

## Implementation Phases

### Phase 1: Core Detection Engine (v1.6.0)

**Goal:** Minimal viable detection system with user-defined rules

**Deliverables:**

- [ ] Create database schema migration (1.6.0-security-analysis.sql)
  - event_types table (empty, user-defined)
  - host_ip_addresses table (for IP exclusion)
  - security_rules table (with event_type_id FK)
  - processing_watermark table
  - security_events table (UNIQUE on log_record_id, matched_rules JSON)
- [ ] Implement src/models/Host.js - Host model for existing hosts table
- [ ] Implement src/models/IPAddress.js - IP address management
- [ ] Implement src/models/EventType.js - Event type management
- [ ] Implement src/models/SecurityRule.js - Rule management
- [ ] Implement src/services/securityAnalysisService.js
  - loadExcludedIPs() - Load IPs from host_ip_addresses
  - loadRules() - Load from database with JOINed event types, ordered by severity
  - processLogBatch() - Apply rules to records
  - selectHighestSeverityEvent() - When multiple rules match
  - extractData() - Use output_pattern to extract fields
  - insertEvents() - INSERT IGNORE into security_events (one per log_record)
  - updateWatermark() - Advance processing position
- [ ] Create src/tasks/securityAnalysis.js (cron every 1 minute)
- [ ] CLI commands:
  - `event-types:list` - Show all event types
  - `event-types:add <name> [--severity X] [--description Y]` - Create event type
  - `event-types:delete <name>` - Delete unused event type
  - `hosts:list-ips <hostname>` - Show excluded IPs for host
  - `hosts:add-ip <hostname> <ip> [--description X]` - Add IP to exclusion list
  - `hosts:remove-ip <hostname> <ip>` - Remove IP from exclusion list
  - `security:analyze [--dry-run] [--limit N]` - Manual analysis
  - `rules:add` - Create user-defined rule (prompts for event type)
  - `rules:list` - Show all rules
  - `rules:enable/disable <rule-name>` - Toggle rule
  - `events:query [--event-type X] [--since YYYY-MM-DD]` - Query violations
  - `watermark:reset` - Reset to re-analyze all logs
- [ ] Unit tests with sample log data
- [ ] Performance benchmarking (10K records target: <60s)

**Success Criteria:**

- Can process 1.9M production records
- Detects violations correctly using regex patterns
- No duplicate violations (UNIQUE constraint working)
- Watermark advances correctly
- Processing completes within 1-minute cron interval

### Phase 2: External Tool Integration (v1.7.0)

**Goal:** Invoke external scripts with JSON output

**Deliverables:**

- [ ] Create config/analysis-tools.json schema
- [ ] Implement src/services/toolExecutionService.js
  - validateToolConfig() - Check tool paths exist and are executable
  - executeBatchTool() - Pass full analysis JSON via STDIN
  - executeViolationTool() - Pass per-violation JSON via STDIN
  - handleToolOutput() - Log stdout/stderr
  - handleToolErrors() - Timeout and error handling
- [ ] Modify security analysis task to invoke tools after detection
- [ ] Add tool execution metrics to logging
- [ ] CLI commands:
  - `tools:list` - Show configured tools
  - `tools:test <tool-name>` - Test tool with sample data
  - `tools:logs [--tool X] [--since YYYY-MM-DD]` - View tool execution logs
- [ ] Example tool scripts:
  - examples/tools/firewall-blocker.sh
  - examples/tools/ip-reputation.py
  - examples/tools/customer-alert.sh
- [ ] Documentation for writing custom tools

**Success Criteria:**

- Tools receive correct JSON format via STDIN
- Tool timeouts work correctly
- Tool failures don't break analysis process
- All tool invocations logged with timestamps

### Phase 3: Fail2ban Integration (v1.8.0)

**Goal:** Auto-import fail2ban filters as rules

**Deliverables:**

- [ ] Implement fail2ban filter parser
  - parseFail2banFilter() - Read .conf file
  - extractFailregex() - Parse failregex lines
  - mapFilterToEventType() - Configurable filter→event_type mapping
- [ ] CLI commands:
  - `rules:import-fail2ban --filter <name>` - Import single filter (prompts for event type)
  - `rules:import-fail2ban --filter <name> --event-type <name>` - Import with specific event type
  - `rules:import-fail2ban --all` - Import all filters (prompts for event type per filter)
  - `rules:sync-fail2ban` - Re-import to update patterns
- [ ] Configuration for filter→event_type mappings
- [ ] Support for fail2ban ignoreregex (negative patterns)
- [ ] Cross-reference with fail2ban jail names
- [ ] Documentation on fail2ban integration

**Success Criteria:**

- Can parse standard fail2ban filter.d/\*.conf files
- Imported rules work correctly in analysis
- Can distinguish user-defined vs fail2ban-imported rules
- Can re-sync fail2ban rules without duplicates

### Phase 4: Advanced Features (v1.9.0+)

**Goal:** Polish and production-hardening

**Potential Enhancements:**

- [ ] Web UI for rule management and event querying
- [ ] Advanced analytics dashboard (violations over time, top IPs, etc.)
- [ ] Machine learning for anomaly detection
- [ ] Geolocation enrichment for IPs
- [ ] Integration with threat intelligence feeds
- [ ] Slack/Discord notifications for critical events
- [ ] Rule testing framework with unit tests
- [ ] Performance optimizations (parallel processing, caching)
- [ ] Export violations to SIEM systems

## Success Metrics

**Performance:**

- Process 10,000 records in <60 seconds
- Complete full 1.9M record analysis in <4 hours
- Tool execution latency: <30s per batch
- Memory usage: <500MB during processing

**Accuracy:**

- Zero duplicate violations (UNIQUE constraint)
- No false negatives (all matching records detected)
- Acceptable false positive rate (<1%)

**Reliability:**

- 99.9% uptime for cron task
- Graceful handling of tool failures
- No data loss during failures
- Watermark advances correctly

**Usability:**

- Clear CLI documentation
- Example rules and tools provided
- Easy rule addition/modification
- Queryable violation history

## Next Steps

1. **Finalize Event Type Categories**
   - Decide on 2-4 final categories
   - Document characteristics and use cases
   - Update schema with ENUM or VARCHAR

2. **Review Schema Design**
   - Confirm watermark + events table approach
   - Verify indexes for query performance
   - Plan for foreign key constraints

3. **Create Migration Script**
   - Write schema/1.6.0-security-analysis.sql
   - Test on development database (1.9M records)
   - Verify indexes work correctly

4. **Build Core Processor**
   - Start with src/services/securityAnalysisService.js
   - Implement rule loading and regex matching
   - Test with sample rules on subset of data

5. **Tool Integration Design**
   - Finalize config/analysis-tools.json format
   - Document tool contract (STDIN format, exit codes)
   - Create example tools for testing

## Recommended Event Types

While event types are completely user-defined, here are suggested starter sets for different needs:

### Minimal (2 types)

```sql
INSERT INTO event_types (name, description, severity) VALUES
('malicious-bot', 'Known bad bots, scrapers, aggressive crawlers', 'medium'),
('vulnerability-probe', 'Attempts to access sensitive files or exploit vulnerabilities', 'high');
```

### Balanced (3 types) - Recommended for most deployments

```sql
INSERT INTO event_types (name, description, severity) VALUES
('malicious-bot', 'Known bad bots, scrapers, aggressive crawlers', 'medium'),
('vulnerability-probe', 'Attempts to access sensitive files or exploit vulnerabilities', 'high'),
('protocol-abuse', 'Malformed requests, encoding attacks, HTTP protocol violations', 'medium');
```

### Comprehensive (5+ types)

```sql
INSERT INTO event_types (name, description, severity) VALUES
('malicious-bot', 'Known bad bots, scrapers, aggressive crawlers', 'medium'),
('vulnerability-probe', 'File/path probes, exploit attempts', 'high'),
('protocol-abuse', 'Malformed requests, encoding attacks', 'medium'),
('resource-abuse', 'Excessive 404s, bandwidth abuse', 'low'),
('authentication-attack', 'Brute force login attempts, credential stuffing', 'high'),
('data-exfiltration', 'Suspicious data access patterns', 'critical');
```

**Usage:** Copy the appropriate SQL into your headlog instance during initial setup. Add/modify as needed for your specific requirements.

## Questions for Discussion

1. **Fail2ban Event Type Mapping**: How to map fail2ban filters to event types during import?
   - Interactive prompt for each filter?
   - Config file with filter name → event type mappings?
   - Heuristic based on filter name patterns?

2. **Tool Execution**: Should tools run synchronously or async?
   - Sync: Simple, blocks until complete
   - Async: More complex, better for slow tools
   - Hybrid: Sync for fast tools, async for slow ones?

3. **Rule Storage**: Database vs. filesystem for user-defined rules?
   - Database: Better for multi-instance setups, programmatic access
   - Filesystem: Easier to edit, version control friendly
   - Hybrid: Database primary, filesystem for exports/imports?

4. **Batch Size**: What's the optimal batch size?
   - 10,000 records (baseline)
   - Adaptive based on processing time?
   - User-configurable?

---

**Document Status:** Design phase - awaiting user input on event categories and fail2ban integration details

**Last Updated:** 2025-12-13

**Related Documents:**

- [docs/hierarchical-aggregation.md](../docs/hierarchical-aggregation.md) - Upstream log forwarding
- [dev-notes/implementation.md](implementation.md) - System architecture
- [dev-notes/requirements.md](requirements.md) - Feature requirements
- **Maintainability**: Add new rule without code changes, just JSON edit

## Next Steps

1. Review and refine requirements
2. Finalize schema design
3. Create prototype processor
4. Test with sample data (1000 records)
5. Benchmark performance
6. Iterate on design based on results
