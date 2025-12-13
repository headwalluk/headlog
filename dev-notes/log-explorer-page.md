# Log Explorer Page

## Overview

The `/logs` page provides a read-only interface for exploring and filtering log records from the unified `log_records` table. This page displays both access and error logs in a single data grid with comprehensive filtering capabilities.

## Page Design

### Read-Only Data Grid

- **Single unified view** - Both access and error logs displayed together
- **No edit/delete workflows** - Logs are immutable once created
- **Double-click interaction** - Opens detailed view in a modal
- **Mobile responsive** - Hides less critical columns on small screens
- **Pagination** - Server-side pagination for performance

### Key Columns

1. **Timestamp** - When the log event occurred
2. **Type** - Badge showing 'Access' (blue) or 'Error' (red)
3. **Website** - Website name/domain
4. **Host** - Hostname that generated the log
5. **Code** - HTTP status code or error level
6. **Remote** - IP address of the client/request
7. **Message/URL** - Preview of request URL or error message

### Mobile View

Show only essential columns on small screens:
- Timestamp (abbreviated)
- Type badge
- Code badge
- Message/URL (truncated)

## Query Parameters

### Filter Parameters

- `website` - Filter by website_id (e.g., `?website=81`)
- `host` - Filter by host_id (e.g., `?host=10`)
- `type` - Filter by log_type: `access` or `error` (e.g., `?type=access`)
- `code` - Filter by code_id (e.g., `?code=404`)
- `remote` - Filter by IP address (e.g., `?remote=192.168.1.1`)

### Date Range Parameters

- `from` - Start date/time (ISO 8601 format)
  - Examples: `?from=2024-12-01` or `?from=2024-12-01T00:00:00`
- `to` - End date/time (ISO 8601 format)
  - Examples: `?to=2024-12-31` or `?to=2024-12-31T23:59:59`
- **Default**: If omitted, show last 24 hours or last 7 days

### Search & Pagination

- `search` - Full-text search across raw_data JSON (e.g., `?search=/api/users`)
- `page` - Current page number (default: 1)
- `limit` - Results per page (default: 50, max: 500)

### Example URLs

```
# Filter by website
http://localhost:3000/logs?website=81

# Filter by host
http://localhost:3000/logs?host=10

# Combine website and host filters
http://localhost:3000/logs?host=10&website=12

# Filter by log type and date range
http://localhost:3000/logs?type=error&from=2024-12-01&to=2024-12-13

# Filter by status code
http://localhost:3000/logs?code=500&type=error

# Search with pagination
http://localhost:3000/logs?search=/api/users&page=2&limit=100

# Filter by IP address
http://localhost:3000/logs?remote=192.168.1.1

# Complex multi-filter query
http://localhost:3000/logs?website=81&type=access&code=200&from=2024-12-01&remote=10.0.0.1
```

## Toolbar Design

### Filter Controls

1. **Date Range Picker**
   - Quick presets: Last 24h, Last 7 days, Last 30 days, Custom
   - Custom range opens date picker inputs

2. **Log Type Dropdown**
   - Options: All, Access, Error
   - Shows count badge for current selection

3. **Website Dropdown**
   - Searchable select with all websites
   - Shows "(All Websites)" when none selected

4. **Host Dropdown**
   - Searchable select with all hosts
   - Shows "(All Hosts)" when none selected

5. **Code Dropdown**
   - Common codes grouped: 2xx, 3xx, 4xx, 5xx
   - Shows all codes from `codes` table

6. **IP Search Box**
   - Text input for remote IP filtering
   - Supports partial matches

7. **General Search Box**
   - Full-text search across raw_data
   - Placeholder: "Search URLs, messages..."

8. **Action Buttons**
   - "Apply Filters" (primary button)
   - "Clear All" (secondary button)
   - "Export" (future feature, capability-gated)

### Toolbar Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Date Range: [Last 7 days ▼]  Type: [All ▼]  Website: [All ▼] │
│ Host: [All ▼]  Code: [All ▼]  IP: [_________]                │
│ Search: [________________________________]  [Apply] [Clear]  │
└─────────────────────────────────────────────────────────────┘
```

## Detail Modal

### Modal Trigger
- **Double-click** any row in the data grid
- **Single-click** "View" button/icon (if added)

### Modal Content Structure

The modal displays different information based on `log_type`:

#### Access Log Details
- Request timestamp
- HTTP method and URL
- Status code with description
- Response time (if available)
- Client IP (remote)
- User agent
- Referrer
- Request headers (collapsed by default)
- Response size
- Raw JSON data (collapsed, for debugging)

#### Error Log Details
- Error timestamp
- Error level/severity
- Error message
- Stack trace (if available)
- File and line number
- Client IP (remote)
- Request context (URL, method if available)
- Additional metadata
- Raw JSON data (collapsed, for debugging)

### Modal Layout

```
┌───────────────────────────────────────────────┐
│  [Access Log] Log Details              [×]    │
├───────────────────────────────────────────────┤
│                                               │
│  Timestamp: 2024-12-13 15:45:32              │
│  Website: example.com                         │
│  Host: web-server-01                         │
│                                               │
│  Request Information                          │
│  • Method: GET                               │
│  • URL: /api/users/123                       │
│  • Status: 200 OK                            │
│  • Client IP: 192.168.1.100                  │
│                                               │
│  [Show Request Headers ▼]                    │
│  [Show Raw Data ▼]                           │
│                                               │
│                                 [Close]       │
└───────────────────────────────────────────────┘
```

## Database Queries

### Main Query Structure

```sql
SELECT 
  lr.id,
  lr.log_type,
  lr.timestamp,
  lr.remote,
  lr.raw_data,
  w.domain as website_name,
  w.id as website_id,
  h.hostname,
  h.id as host_id,
  c.code,
  c.description as code_description
FROM log_records lr
INNER JOIN websites w ON lr.website_id = w.id
INNER JOIN hosts h ON lr.host_id = h.id
INNER JOIN codes c ON lr.code_id = c.id
WHERE 1=1
  AND (lr.timestamp BETWEEN ? AND ?)
  [AND lr.website_id = ?]
  [AND lr.host_id = ?]
  [AND lr.log_type = ?]
  [AND lr.code_id = ?]
  [AND lr.remote LIKE ?]
  [AND lr.raw_data LIKE ?]
ORDER BY lr.timestamp DESC
LIMIT ? OFFSET ?
```

### Count Query for Pagination

```sql
SELECT COUNT(*) as total
FROM log_records lr
WHERE 1=1
  AND (lr.timestamp BETWEEN ? AND ?)
  [... same filters as main query ...]
```

## Capabilities & Permissions

### Required Capabilities

- `logs:read` - Required to access the `/logs` page
- `logs:export` - Required for export functionality (future feature)

### Role-Based Access

- All authenticated users with `logs:read` can view logs
- Logs are filtered based on user's website access (if applicable)
- Superusers see all logs regardless of website ownership

## Performance Considerations

### Indexing Requirements

The following indexes should exist on `log_records`:
- `timestamp` (for date range queries)
- `website_id` (for website filtering)
- `host_id` (for host filtering)
- `log_type` (for type filtering)
- `code_id` (for code filtering)
- `remote` (for IP filtering)
- Composite indexes for common filter combinations

### Query Optimization

- Limit default date range to prevent full table scans
- Use server-side pagination with reasonable limits
- Cache website/host/code dropdowns
- Consider implementing query result caching for repeated queries
- Use EXPLAIN to verify index usage on complex queries

### Data Volume Handling

- Default to 50 records per page
- Maximum 500 records per page
- Show total count but warn if query is slow
- Consider date range restrictions for very large datasets
- Implement archive functionality to move old logs (future feature)

## Future Enhancements

### Real-Time Updates
- WebSocket or Server-Sent Events for live log streaming
- Auto-refresh toggle with configurable interval
- Notification badge for new logs matching current filters

### Export Functionality
- CSV export for filtered results
- JSON export for raw data
- Excel export with formatting
- Capability-gated: `logs:export`

### Advanced Features
- Save filter presets/bookmarks
- Share filtered views via URL
- Dashboard widgets showing log statistics
- Alerting based on log patterns (future milestone)

## Implementation Checklist

- [ ] Create Log model with `searchLogs()` method
- [ ] Create `/logs` view with data grid
- [ ] Implement toolbar with all filter controls
- [ ] Add date range picker with presets
- [ ] Implement detail modal with double-click trigger
- [ ] Add pagination controls
- [ ] Create GET `/logs` route with query parameter handling
- [ ] Add capability check for `logs:read`
- [ ] Test with large datasets
- [ ] Verify mobile responsiveness
- [ ] Document API endpoint (if separate API route needed)
