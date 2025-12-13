# Web UI Requirements

## Overview

Browser-based administration interface for headlog. The UI provides intuitive management of users, roles, websites, hosts, security rules, and log analysis. Completely disabled via `UI_ENABLED=false` for production environments that don't need web access.

**Core Philosophy:**

- Security first: disabled by default, opt-in via feature flag
- Progressive enhancement: start with core admin features, add analytics later
- Mobile-responsive: works on desktop, tablet, mobile
- Modern UX: fast, intuitive, minimal clicks
- No public assets when disabled (zero attack surface)

## Feature Flag Behavior

```bash
UI_ENABLED=false  # Default: No HTML/CSS/JS served, dist/ empty
UI_ENABLED=true   # Serves web UI assets, login page accessible
```

**When `UI_ENABLED=false`:**

- No routes serve HTML pages
- No static assets (CSS, JS, images) served
- `dist/` directory should be empty or absent
- API-only mode (if `MODEL_API_ENABLED=true`)

**When `UI_ENABLED=true`:**

- Login page accessible at `/login`
- Dashboard accessible at `/` (requires authentication)
- Static assets served from `dist/` (production) or `public/` (development)
- All UI routes require valid session (except `/login` and `/health`)

## Technology Stack

### Chosen Approach: Server-Side Rendering with EJS

**Stack:**

- **Framework:** Fastify (high-performance Node.js framework)
- **Template Engine:** EJS via @fastify/view
- **Layout System:** EJS includes/partials (no external layout library needed)
- **CSS Framework:** Bootstrap 5 (rapid development, responsive by default)
- **JavaScript:** Vanilla JS for simple interactions, optional HTMX for enhanced UX
- **Build Process:** None required (development = production)

**Why EJS + Fastify:**

- EJS fully supported via @fastify/view plugin
- Clean syntax with embedded JavaScript logic
- Built-in include system for layouts: `<%- include('partials/header') %>`
- Pre-compiled templates (excellent performance)
- Role-based content via simple conditionals: `<% if (user.hasCapability()) { %>`
- Clean URLs built-in (routes = URLs, no `.html` extensions)
- Full editor support (syntax highlighting, linting)
- No build step required
- Fastify's speed: ~30,000 req/sec vs Express ~15,000 req/sec

**Directory Structure:**

```
src/
  views/
    partials/
      head.ejs              # HTML head (meta, CSS links)
      header.ejs            # Top navigation/branding
      sidebar.ejs           # Sidebar navigation (role-based menu)
      footer.ejs            # Footer content
    login.ejs               # Login page (full page, no layout)
    dashboard.ejs           # Main dashboard (includes partials)
      logs/
        viewer.ejs          # Full-width log record viewer
      users/
        index.ejs           # User list
        edit.ejs            # Edit user form
      roles/
        index.ejs           # Role list
        edit.ejs            # Edit role form
      websites/
        index.ejs           # Website list
        edit.ejs            # Edit website
      hosts/
        index.ejs           # Host list
        ips.ejs             # Manage host IPs
      security/
        event-types.ejs     # Event type management
        rules.ejs           # Security rules
        events.ejs          # Detected events
public/
  css/
    common.css              # Global styles
    dashboard.css           # Dashboard-specific styles
    logs-viewer.css         # Log viewer spreadsheet styles
  js/
    common.js               # Global JavaScript
    logs-viewer.js          # Log viewer interactions (filters, sorting)
  images/
```

**Layout Pattern (Fastify + EJS):**

```ejs
<!DOCTYPE html>
<html>
<%- include('partials/head', { title: 'Dashboard' }) %>
<body>
  <%- include('partials/header', { user }) %>
  <div class="container-fluid">
    <div class="row">
      <%- include('partials/sidebar', { user }) %>
      <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
        <!-- Page content here -->
      </main>
    </div>
  </div>
  <%- include('partials/footer') %>
</body>
</html>
```

**Future Enhancement (Phase 2):**

- **HTMX:** Add for SPA-like interactivity without build step
- **Alpine.js:** Lightweight reactivity for complex UI components
- **Chart.js:** For analytics dashboards

**Not Using (and why):**

- **React/Vue:** Overkill for Phase 1 admin UI, adds build complexity
- **Pug:** Less familiar syntax than EJS, steeper learning curve
- **express-ejs-layouts:** Not needed - Fastify + EJS includes are sufficient

## Phase 1: Core Administration (v2.0.0)

**Goal:** Essential CRUD interfaces for managing headlog resources

### 1. Login & Authentication

**Route:** `/login`

**Features:**

- Login form (username/email + password)
- Remember me checkbox (extends session)
- Error messages (invalid credentials, account disabled)
- Logout button in nav (clears session)

**Design:**

- Centered login box
- Minimal branding
- No registration link (admins create users)

### 2. Dashboard / Home

**Route:** `/` (requires authentication)

**Features:**

- Quick stats cards:
  - Total log records (last 24h / all time)
  - Active websites count
  - Active hosts count
  - Security events detected (last 24h)
- Recent activity feed (last 10 actions from audit log)
- Quick links to common tasks:
  - View logs
  - Manage security rules
  - Add new website
- System status indicators:
  - Database connection
  - Upstream sync status (if configured)
  - Disk space / retention warnings

**Design:**

- Grid layout with cards
- Color-coded status indicators
- Responsive on mobile

### 3. User Management

**Route:** `/users`

**Features:**

- User list table:
  - Columns: Username, Email, Roles, Status, Last Login, Actions
  - Sort by column
  - Search/filter by username, email, role
  - Pagination (50 per page)
- Actions per user:
  - Edit (opens modal or detail page)
  - Disable/Enable (toggle active status)
  - Delete (confirmation required, only if `users:delete` capability)
  - Assign roles (opens role picker modal)
- Create new user button:
  - Form: username, email, password, confirm password, roles
  - Generate random password option
  - Send credentials via email option (future)

**Capabilities Required:**

- View list: `users:read`
- Create/edit: `users:write`
- Delete: `users:delete`
- Assign roles: `roles:assign`

### 4. Role Management

**Route:** `/roles`

**Features:**

- Role list table:
  - Columns: Role Name, Description, User Count, System Role, Actions
  - System roles marked (can't be deleted)
- Actions per role:
  - Edit (change name, description)
  - Manage capabilities (modal with capability checklist)
  - Delete (only non-system roles, confirmation required)
- Create new role button:
  - Form: name, description
  - Capability checklist (grouped by category)

**Route:** `/roles/:id/capabilities`

**Features:**

- Capability list grouped by category:
  - Logs (logs:read, logs:write, logs:delete)
  - Users (users:read, users:write, users:delete)
  - Roles (roles:read, roles:write, roles:assign)
  - Websites (websites:read, websites:write, websites:delete)
  - Hosts (hosts:read, hosts:write)
  - Security (security-rules:read, security-rules:write, security-events:read)
  - API Keys (api-keys:read, api-keys:write)
  - Settings (settings:read, settings:write)
- Checkboxes to grant/revoke capabilities
- "Dangerous" capabilities highlighted (red badge)
- Save button (batch update)

**Capabilities Required:**

- View roles: `roles:read`
- Manage roles: `roles:write`

### 5. Website Management

**Route:** `/websites`

**Features:**

- Website list table:
  - Columns: Domain, API Key Status, Log Count, Last Log, Actions
  - Search by domain
  - Filter by active/inactive
  - Sort by log count, last log timestamp
  - Pagination
- Actions per website:
  - View details (opens detail page with recent logs)
  - Edit (change domain, description)
  - Regenerate API key (confirmation required)
  - Disable (soft delete, stops accepting logs)
  - Delete (hard delete, confirmation required)
- Create new website button:
  - Form: domain, description
  - Auto-generates API key
  - Shows API key once (copy to clipboard button)

**Route:** `/websites/:id`

**Features:**

- Website details:
  - Domain, description, created date
  - API key last used timestamp
  - Total log count, last 24h log count
- Recent logs table (last 100):
  - Columns: Timestamp, Host, HTTP Code, Path, IP
  - Link to full log detail
- Log ingestion instructions (curl example)

**Capabilities Required:**

- View websites: `websites:read`
- Create/edit: `websites:write`
- Delete: `websites:delete`

### 6. Host Management

**Route:** `/hosts`

**Features:**

- Host list table:
  - Columns: Hostname, IP Count, Log Count, Last Seen, Actions
  - Search by hostname
  - Sort by log count
  - Pagination
- Actions per host:
  - Edit (change hostname, description)
  - Manage IPs (opens modal or detail page)
  - View logs (filter logs by host)

**Route:** `/hosts/:id/ips`

**Features:**

- Host IP list:
  - Hostname and description at top
  - IP address table:
    - Columns: IP Address, Version (4/6), Description, Added Date, Actions
  - Add IP button:
    - Form: IP address, description
    - Auto-detects IPv4 vs IPv6
    - Validates IP format
  - Remove IP button (per IP):
    - Confirmation required
    - Shows warning if IP appears in recent logs

**Purpose:** Manage IP exclusion list for security analysis

**Capabilities Required:**

- View hosts: `hosts:read`
- Manage hosts/IPs: `hosts:write`

### 7. Log Record Viewer (Spreadsheet Interface)

**Route:** `/dashboard/logs`

**Layout:** Full-width page (no sidebar, or collapsible sidebar)

**Design Philosophy:**

- Spreadsheet-like interface (similar to Google Sheets, Excel)
- Dense information display (many rows visible)
- Fast filtering and sorting
- Keyboard navigation support
- Responsive table with horizontal scroll if needed

**Role-Based Access:**

**Admin/Analyst Users:**

- Can see ALL log records from all websites
- Website filter shows all websites
- No restrictions

**Customer Role Users:**

- Can ONLY see log records for websites linked to their user account
- Website filter shows only their websites
- Attempts to access other websites' logs → 403 Forbidden
- Database query automatically filters: `WHERE website_id IN (user's websites)`

**Toolbar (Fixed at Top):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [🔍 Search]  [📅 Date Range ▾]  [🌐 Website ▾]  [🖥️ Host ▾]            │
│ [HTTP Code ▾]  [Contains Path...]  [IP Address...]                     │
│ [Apply Filters]  [Clear]  [Export CSV]  [Export JSON]  [⚙️ Columns]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Toolbar Components:**

1. **Date Range Picker**
   - Presets: Last 1h, Last 24h, Last 7d, Last 30d, Custom Range
   - Custom: date/time pickers for start and end
   - Default: Last 24h

2. **Website Selector** (dropdown, multi-select)
   - Shows all websites (if admin) or user's websites (if customer)
   - Searchable dropdown
   - "All" option (admin only)
   - Shows count: "5 selected" or "All websites"

3. **Host Selector** (dropdown, multi-select)
   - All hosts in system
   - Searchable
   - "All" option

4. **HTTP Code Filter** (dropdown, multi-select)
   - Common codes as checkboxes:
     - 2xx Success (200, 201, 204)
     - 3xx Redirects (301, 302, 304)
     - 4xx Client Errors (400, 401, 403, 404, 429)
     - 5xx Server Errors (500, 502, 503, 504)
   - "Custom" text input for specific codes

5. **Path Contains** (text input)
   - Case-insensitive substring search
   - Examples: `/wp-admin`, `.php`, `/api/`

6. **IP Address** (text input)
   - Exact match or partial match
   - Examples: `192.168.1.100`, `192.168.`

7. **Apply Filters Button**
   - Submits form, reloads table with filters
   - Shows loading spinner during query

8. **Clear Filters Button**
   - Resets all filters to defaults
   - Reloads table

9. **Export Buttons**
   - CSV: Downloads `logs-YYYY-MM-DD-HHMMSS.csv`
   - JSON: Downloads `logs-YYYY-MM-DD-HHMMSS.json`
   - Respects current filters and sorting
   - Limit: 10,000 records per export (show warning if exceeded)
   - Progress indicator for large exports

10. **Column Selector** (⚙️ icon, opens modal)
    - Checkboxes to show/hide columns
    - Save preferences per user
    - Default visible columns: Timestamp, Website, Host, HTTP Code, Path, IP

**Data Table (Spreadsheet Style):**

```
┌────────────────────┬──────────────┬─────────────┬──────┬─────────────┬──────────────┬────────┬─────────┐
│ Timestamp ▴        │ Website      │ Host        │ Code │ Method      │ Path         │ IP     │ Actions │
├────────────────────┼──────────────┼─────────────┼──────┼─────────────┼──────────────┼────────┼─────────┤
│ 2025-12-13 14:23:01│ example.com  │ hhw1.head...│ 200  │ GET         │ /index.html  │ 1.2... │ [👁️] [🔗]│
│ 2025-12-13 14:23:00│ foobar.com   │ hhw1.head...│ 404  │ GET         │ /admin.php   │ 5.6... │ [👁️] [🔗]│
│ 2025-12-13 14:22:59│ example.com  │ hhw2.head...│ 500  │ POST        │ /api/users   │ 1.2... │ [👁️] [🔗]│
│ ...                │ ...          │ ...         │ ...  │ ...         │ ...          │ ...    │ ...     │
└────────────────────┴──────────────┴─────────────┴──────┴─────────────┴──────────────┴────────┴─────────┘

                         [◀︎ Previous]  Page 1 of 234  [Next ▶︎]           Showing 1-100 of 23,456 records
```

**Table Features:**

1. **Columns** (all sortable):
   - Timestamp (default sort: DESC)
   - Website (domain)
   - Host (hostname, truncated if long)
   - HTTP Code (color-coded: green 2xx, yellow 3xx, orange 4xx, red 5xx)
   - Method (GET, POST, PUT, DELETE, etc.)
   - Path (truncated with ellipsis if long, show full on hover)
   - IP Address (truncated if IPv6)
   - User Agent (optional column, hidden by default)
   - Referrer (optional column, hidden by default)
   - Response Size (optional column, hidden by default)
   - Response Time (optional column, hidden by default)
   - Actions (always visible, not sortable)

2. **Sorting:**
   - Click column header to sort
   - Click again to reverse sort
   - Visual indicator: ▴ (ascending) or ▾ (descending)
   - Default: Timestamp DESC (newest first)
   - Persist sort in URL query params: `?sort=timestamp&order=desc`

3. **Row Styling:**
   - Alternating row colors (light gray / white)
   - Hover state (light blue background)
   - HTTP error rows (4xx, 5xx) have subtle red/orange tint
   - Fixed header (stays visible when scrolling)
   - Monospace font for Path, IP columns

4. **Actions per Row:**
   - **👁️ View Details:** Opens modal with full log record
     - Shows all fields from `log_records` table
     - Pretty-printed JSON for `raw_data`
     - Copy buttons for IP, Path, User Agent
     - Link to website detail page
     - Link to host detail page
   - **🔗 Related Logs:** Links to filtered view
     - "Same IP" - filters by this IP
     - "Same Path" - filters by this path
     - "Same Website" - filters by this website

5. **Pagination:**
   - 100 records per page (configurable: 50, 100, 200, 500)
   - "Previous" and "Next" buttons
   - Page number display: "Page X of Y"
   - Jump to page input (small text box)
   - Total count: "Showing 1-100 of 23,456 records"
   - URL includes page: `?page=2`

6. **Performance Optimizations:**
   - Database query uses LIMIT/OFFSET for pagination
   - Indexes on commonly filtered columns (timestamp, website_id, http_code)
   - Query timeout: 30 seconds (show error if exceeded)
   - Loading spinner during queries
   - Debounce filter inputs (300ms delay before applying)

**Keyboard Shortcuts:**

- `F` - Focus search/filter bar
- `E` - Export CSV
- `N` - Next page
- `P` - Previous page
- `Esc` - Close modal
- `Ctrl+K` or `Cmd+K` - Quick filter (focus search)

**Responsive Behavior:**

**Desktop (> 1024px):**

- All columns visible
- Sidebar visible (if not full-width mode)
- Filters in single row

**Tablet (768px - 1024px):**

- Hide optional columns (User Agent, Referrer, Size, Time)
- Collapse sidebar or hide it
- Filters stack into two rows

**Mobile (< 768px):**

- Table becomes card-based list:
  ```
  ┌──────────────────────────────┐
  │ 2025-12-13 14:23:01          │
  │ example.com · hhw1.headwa... │
  │ 200 GET /index.html          │
  │ IP: 1.2.3.4                  │
  │ [View Details] [Related]     │
  └──────────────────────────────┘
  ```
- Filters in accordion/drawer
- Pagination simplified (Prev/Next only)

**Export Feature (Enhanced):**

**CSV Format:**

```csv
timestamp,website,host,http_code,method,path,ip_address,user_agent,referrer,response_size,response_time
2025-12-13 14:23:01,example.com,hhw1.headwall-hosting.com,200,GET,/index.html,1.2.3.4,"Mozilla/5.0...",https://google.com,12345,0.123
```

**JSON Format:**

```json
[
  {
    "id": 123,
    "timestamp": "2025-12-13T14:23:01Z",
    "website": "example.com",
    "host": "hhw1.headwall-hosting.com",
    "http_code": 200,
    "method": "GET",
    "path": "/index.html",
    "ip_address": "1.2.3.4",
    "raw_data": { ... }
  }
]
```

**Export Limits:**

- Max 10,000 records per export
- If results exceed limit, show warning: "Only exporting first 10,000 of 23,456 records. Refine filters to export more specific data."
- Background job for large exports (future enhancement)

**Database Query (Role-Based):**

```javascript
// Admin/Analyst - see all logs
const query = `
  SELECT lr.*, w.domain as website, h.hostname as host
  FROM log_records lr
  JOIN websites w ON lr.website_id = w.id
  JOIN hosts h ON lr.host_id = h.id
  WHERE lr.timestamp BETWEEN ? AND ?
    AND (? IS NULL OR lr.website_id IN (?))
    AND (? IS NULL OR lr.http_code IN (?))
    AND (? IS NULL OR lr.path LIKE ?)
  ORDER BY lr.timestamp DESC
  LIMIT ? OFFSET ?
`;

// Customer - only their websites
const userWebsites = await getUserWebsites(req.user.id);
const query = `
  SELECT lr.*, w.domain as website, h.hostname as host
  FROM log_records lr
  JOIN websites w ON lr.website_id = w.id
  JOIN hosts h ON lr.host_id = h.id
  JOIN user_websites uw ON w.id = uw.website_id
  WHERE uw.user_id = ?
    AND lr.timestamp BETWEEN ? AND ?
    AND (? IS NULL OR lr.http_code IN (?))
  ORDER BY lr.timestamp DESC
  LIMIT ? OFFSET ?
`;
```

**Implementation Notes:**

- Use prepared statements (prevent SQL injection)
- Index on (timestamp, website_id, http_code) for fast queries
- Consider partitioning log_records table by date for very large datasets
- Cache website/host lists for filter dropdowns (refresh every 5 minutes)

**Capabilities Required:**

- View logs: `logs:read`
- Export logs: `logs:read` (same capability)
- View all websites (admin): `logs:read` + admin role
- View own websites (customer): `logs:read` + customer role

### 8. Security Analysis

**Route:** `/security/event-types`

**Features:**

- Event type list table:
  - Columns: Name, Severity, Description, Rule Count, Event Count, Actions
  - Color-coded severity badges
- Actions per event type:
  - Edit (change description, severity)
  - Delete (only if no rules/events reference it)
- Create new event type button:
  - Form: name, severity, description

**Route:** `/security/rules`

**Features:**

- Security rule list table:
  - Columns: Rule Name, Event Type, Log Type, Source, Enabled, Matches (last 24h), Actions
  - Filter by: event type, log type (access/error), source (user/fail2ban), enabled
  - Search by rule name
- Actions per rule:
  - Edit (opens form with regex pattern editor)
  - Enable/Disable (toggle)
  - Delete (confirmation required)
  - Test (opens modal to test pattern against sample logs)
- Create new rule button:
  - Form:
    - Rule name
    - Event type (dropdown)
    - Log type (access/error)
    - Trigger pattern (textarea, regex)
    - Output pattern (textarea, regex for extraction)
    - Description
  - Pattern validator (test against sample data)
  - Import from fail2ban button (opens fail2ban import wizard)

**Route:** `/security/rules/:id/test`

**Features:**

- Test rule against recent logs:
  - Shows 100 recent logs
  - Highlights matches
  - Shows extracted data
  - Dry-run mode (doesn't create events)

**Route:** `/security/events`

**Features:**

- Security event list table:
  - Columns: Timestamp, Event Type, Severity, Website, Host, IP, Matched Rules, Actions
  - Filter by: event type, severity, date range, website, host
  - Sort by timestamp (desc by default)
  - Pagination
  - Export button
- Actions per event:
  - View details (opens modal with full data)
  - View log record (link to original log)
  - Mark as reviewed (future: workflow status)

**Capabilities Required:**

- View event types: `security-rules:read`
- Manage event types: `security-rules:write`
- View rules: `security-rules:read`
- Manage rules: `security-rules:write`
- View events: `security-events:read`

### 9. API Key Management

**Route:** `/api-keys`

**Features:**

- API key list table:
  - Columns: Description, Status, Permissions, Last Used, Expires, Actions
  - Filter by: status (active/expired/revoked), user (if admin)
  - Sort by last used, expiration
- Actions per key:
  - View details (shows permissions, usage stats)
  - Revoke (soft delete, mark as revoked)
  - Delete (hard delete, confirmation required)
- Create new API key button:
  - Form:
    - Description
    - Permissions (checklist or custom JSON)
    - Expiration date (optional)
  - Shows generated key once (copy to clipboard)
  - Warning: "Save this key securely, it won't be shown again"

**Note:** Non-admin users can only see/manage their own API keys

**Capabilities Required:**

- View keys: `api-keys:read` (own keys) or `api-keys:read` + admin role (all keys)
- Create/revoke keys: `api-keys:write`

### 10. Audit Log Viewer

**Route:** `/audit`

**Features:**

- Audit log list table:
  - Columns: Timestamp, User, Action, Resource, IP, Details, Actions
  - Filter by: user, action type, resource type, date range
  - Sort by timestamp (desc by default)
  - Pagination (100 per page)
  - Export button
- Actions per entry:
  - View details (opens modal with full before/after JSON)
  - View user profile (link to user detail)

**Details Modal:**

- Shows full audit entry:
  - Timestamp
  - User (username + email)
  - Action (e.g., "user.delete")
  - Resource (e.g., "user #123")
  - IP address, user agent
  - Before/after values (pretty-printed JSON)

**Capabilities Required:**

- View audit log: `settings:read` (admin only)

### 11. Settings

**Route:** `/settings`

**Features:**

- System settings form:
  - Log retention days (updates `.env` or config)
  - Inactive website threshold days
  - Upstream sync configuration (if hierarchical mode)
  - Session timeout (hours)
  - Rate limiting settings
- Feature flag status (read-only):
  - UI_ENABLED: ✓ (obviously true if viewing this page)
  - MODEL_API_ENABLED: ✓ or ✗
- Save button (updates config, may require restart)

**Note:** Some settings may require CLI or `.env` edit for security (e.g., database credentials)

**Capabilities Required:**

- View settings: `settings:read`
- Modify settings: `settings:write` (dangerous)

## Phase 2: Analytics & Advanced Features (v2.3.0+)

**Goal:** Rich visualizations, customer-facing reports, automation

### 1. Statistics Dashboard

**Route:** `/stats`

**Features:**

- Charts and visualizations:
  - Log ingestion rate (line chart, last 7 days)
  - Top 10 websites by log volume (bar chart)
  - HTTP status code distribution (pie chart)
  - Security events over time (line chart)
  - Top attacking IPs (table with counts)
  - Upstream sync health (if hierarchical)
- Time range selector (24h, 7d, 30d, 90d, custom)
- Refresh button (live updates)

**Technology:** Chart.js or D3.js

**Capabilities Required:**

- View statistics: `stats:read`

### 2. Per-Website Dashboard

**Route:** `/websites/:id/dashboard`

**Features:**

- Website-specific analytics:
  - Bandwidth usage chart (MB over time)
  - Request count chart (requests over time)
  - Top 10 paths (table with counts)
  - HTTP status distribution (pie chart)
  - Security events for this website (table)
  - Geographic distribution of visitors (map, if IP geolocation enabled)
- Export dashboard as PDF button
- Email weekly report checkbox (schedule email to customer)

**Customer-Facing Option:**

- Generate shareable dashboard link (read-only, time-limited token)
- Customer can view their website's stats without logging in

**Capabilities Required:**

- View website dashboard: `websites:read`
- Generate shareable links: `websites:write`

### 3. Security Analysis Dashboard

**Route:** `/security/dashboard`

**Features:**

- Security-focused visualizations:
  - Events by severity over time (stacked area chart)
  - Top 10 attacking IPs (table with event counts)
  - Event type distribution (pie chart)
  - Detection rate (% of logs triggering events)
  - Rule effectiveness (matches per rule, bar chart)
- Threat intelligence integration:
  - Lookup attacking IPs in AbuseIPDB (external API)
  - Display threat score and country
  - Link to external IP reputation databases
- Quick actions:
  - Bulk block IPs (add to firewall)
  - Export event list for SOC team
  - Generate incident report

**Capabilities Required:**

- View security dashboard: `security-events:read`

### 4. Automated Reports

**Route:** `/reports`

**Features:**

- Report templates:
  - Weekly security summary
  - Monthly website activity
  - Compliance report (log retention, access audits)
- Schedule reports:
  - Frequency (daily, weekly, monthly)
  - Recipients (email addresses)
  - Format (PDF, CSV, JSON)
  - Delivery method (email, webhook, S3 upload)
- Report history:
  - List of generated reports
  - Download previous reports

**Capabilities Required:**

- View/manage reports: `settings:write` (admin only)

### 5. Advanced Log Search

**Route:** `/logs/search`

**Features:**

- Full-text search in log data (requires database full-text index or ElasticSearch)
- Query builder UI:
  - Drag-and-drop filter conditions
  - Boolean operators (AND, OR, NOT)
  - Nested conditions
- Saved searches:
  - Save commonly-used queries
  - Share searches with other users
  - Schedule search and email results

**Capabilities Required:**

- Advanced search: `logs:read`

### 6. Workflow Automation

**Route:** `/automation`

**Features:**

- Workflow builder (visual UI):
  - Trigger: New security event, log threshold exceeded, etc.
  - Actions: Send email, call webhook, run external tool
  - Conditions: Filter by event type, severity, IP, etc.
- Workflow history:
  - List of executions
  - Success/failure status
  - Logs and errors

**Example Workflows:**

- High-severity event → Email SOC team + Block IP in firewall
- Daily log count exceeds 1M → Email admin warning
- New website added → Send welcome email with API key

**Capabilities Required:**

- Manage automation: `settings:write` (admin only)

## Design Guidelines

### Visual Design

- **Color Scheme:**
  - Primary: Blue (#0066cc)
  - Success: Green (#28a745)
  - Warning: Orange (#fd7e14)
  - Danger: Red (#dc3545)
  - Neutral: Gray (#6c757d)

- **Typography:**
  - Headings: System UI font stack (San Francisco, Segoe UI, Roboto)
  - Body: System UI font stack
  - Code/Logs: Monospace (Courier, Consolas, Monaco)

- **Layout:**
  - Sidebar navigation (collapsible on mobile)
  - Top navbar (user menu, logout, notifications)
  - Main content area (responsive grid)
  - Modals for quick actions (non-intrusive)

### Navigation Structure

```
├── Dashboard (home)
├── Logs
│   ├── View Logs
│   └── Advanced Search (Phase 2)
├── Websites
│   ├── List Websites
│   └── Add Website
├── Hosts
│   └── List Hosts
├── Security
│   ├── Event Types
│   ├── Security Rules
│   ├── Security Events
│   └── Dashboard (Phase 2)
├── Admin (requires admin role)
│   ├── Users
│   ├── Roles
│   ├── API Keys
│   ├── Audit Log
│   ├── Settings
│   └── Reports (Phase 2)
└── User Menu (top-right)
    ├── Profile
    ├── My API Keys
    └── Logout
```

### Responsive Breakpoints

- **Mobile:** < 768px (stacked layout, hamburger menu)
- **Tablet:** 768px - 1024px (sidebar collapsible)
- **Desktop:** > 1024px (full sidebar visible)

### Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation support (tab order, shortcuts)
- Screen reader friendly (semantic HTML)
- High contrast mode support
- Minimum font size: 14px

## Development Approach

### Directory Structure

```
public/               # Development assets (UI_ENABLED=true, dev mode)
├── css/
│   ├── main.css
│   └── components/
├── js/
│   ├── main.js
│   └── modules/
├── images/
└── index.html       # or templates/ if SSR

dist/                # Production build (UI_ENABLED=true, production)
├── css/
├── js/
└── images/

src/
├── routes/
│   └── ui.js        # UI routes (serve HTML)
├── views/           # EJS/Pug templates (if SSR)
│   ├── layouts/
│   ├── partials/
│   └── pages/
└── middleware/
    └── uiEnabled.js  # Check UI_ENABLED flag
```

### Build Process (if SPA)

```bash
# Development
npm run dev        # Start Express + Vite dev server

# Production build
npm run build      # Build frontend to dist/
npm start          # Serve from dist/

# Disable UI for production
UI_ENABLED=false npm start  # dist/ ignored, no UI routes
```

### Testing Strategy

- **Unit Tests:** Components, utilities (Jest)
- **Integration Tests:** API + UI flows (Cypress)
- **Accessibility Tests:** Lighthouse, axe-core
- **Visual Regression:** Percy or Chromatic (optional)

## Implementation Phases Summary

### Phase 1: Core Admin UI (v2.0.0)

- [ ] Login/logout
- [ ] Dashboard with quick stats
- [ ] User management (CRUD)
- [ ] Role management (CRUD)
- [ ] Website management (CRUD)
- [ ] Host management (CRUD, IP exclusion)
- [ ] Log viewer (search, filter, export)
- [ ] Security rule management (CRUD)
- [ ] Security event viewer
- [ ] API key management
- [ ] Audit log viewer
- [ ] Settings page
- [ ] Responsive design (mobile-friendly)

**Success Criteria:**

- Can perform all admin tasks via UI (no CLI needed except bootstrap)
- Intuitive navigation and workflows
- Fast page loads (<2 seconds)
- Works on mobile devices

### Phase 2: Analytics & Automation (v2.3.0+)

- [ ] Statistics dashboard (charts, visualizations)
- [ ] Per-website dashboards
- [ ] Security analysis dashboard
- [ ] Automated reports (scheduled, emailed)
- [ ] Advanced log search (full-text, query builder)
- [ ] Workflow automation builder
- [ ] Customer-facing dashboards (shareable links)
- [ ] PDF export for reports

**Success Criteria:**

- Rich visualizations for data analysis
- Automated reporting works reliably
- Workflows reduce manual tasks
- Customer-facing features ready for white-label

## Open Questions

1. **SSR vs SPA**: Which approach for Phase 1?
   - Recommendation: SSR for simplicity, migrate to SPA for Phase 2

2. **CSS Framework**: Bootstrap vs Tailwind vs custom?
   - Recommendation: Bootstrap 5 (rapid development, good docs)

3. **Real-Time Updates**: WebSockets for live stats?
   - Recommendation: Polling for Phase 1 (simple), WebSockets for Phase 2

4. **Mobile App**: Native app for iOS/Android?
   - Recommendation: PWA (Progressive Web App) sufficient for Phase 1

5. **Theming**: Support dark mode?
   - Recommendation: Phase 2 enhancement

6. **Internationalization**: Multi-language support?
   - Recommendation: English-only Phase 1, i18n in Phase 2 if needed

---

**Document Status:** Requirements phase - ready for review

**Last Updated:** 2025-12-13

**Related Documents:**

- [dev-notes/authentication-authorization.md](authentication-authorization.md) - Auth system requirements
- [dev-notes/batch-log-processing.md](batch-log-processing.md) - Security analysis feature
- [docs/installation.md](../docs/installation.md) - Deployment guide
