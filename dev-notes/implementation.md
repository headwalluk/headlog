# Implementation Guide

## Technology Stack

### Language & Runtime

- **Node.js** - JavaScript runtime (v18+ recommended)
- **JavaScript** (ES6+) - No TypeScript for simplicity
- JSDoc comments for IDE type hints where helpful

### Core Dependencies

- **fastify** - High-performance web framework with native gzip support
- **@fastify/compress** - Gzip/compression middleware (if not built-in)
- **mysql2** - MariaDB driver with Promise support and connection pooling
- **dotenv** - Environment variable management
- **node-cron** - Cron-like job scheduling for housekeeping tasks
- **commander** - CLI argument parsing for key management tool

### Database

- **MariaDB** - Relational database with JSON column support
- **mysql2** - Direct SQL queries (no ORM)
- Connection pooling for performance
- Prepared statements for security

### Design Philosophy

- **No TypeScript** - Keep deployment simple, avoid build steps
- **No Passport** - Custom Bearer token auth (simpler, fewer dependencies)
- **No ORM** - Raw SQL for transparency and performance
- **Minimal dependencies** - Reduce complexity and maintenance burden

---

## Project Structure

```
headlog/
├── src/
│   ├── server.js           # Fastify server entry point
│   ├── config/
│   │   └── database.js     # MySQL2 connection pool setup
│   ├── middleware/
│   │   └── auth.js         # Bearer token authentication hook
│   ├── routes/
│   │   ├── logs.js         # POST /logs, GET /logs
│   │   └── websites.js     # Website CRUD endpoints
│   ├── services/
│   │   ├── logService.js   # Log ingestion business logic
│   │   └── websiteService.js # Website management logic
│   ├── utils/
│   │   ├── extractDomain.js # Parse source_file for domain
│   │   └── generateApiKey.js # Secure key generation
│   └── housekeeping/
│       └── tasks.js        # Cron jobs for cleanup tasks
├── cli.js                  # API key management CLI
├── schema.sql              # Database schema definition
├── .env.example            # Environment variable template
├── package.json
└── ecosystem.config.js     # PM2 configuration

```

---

## Database Schema

See `schema.sql` for complete table definitions.

**Key tables:**

- `websites` - Domain records with metadata
- `log_records` - Log entries with relational + JSON columns
- `api_keys` - Authentication tokens

**Important indexes:**

- `websites.domain` - UNIQUE
- `log_records.timestamp` - For time-based queries
- `log_records.website_id` - Foreign key with CASCADE DELETE
- `log_records.remote` - For IP-based filtering
- `api_keys.key` - UNIQUE, for fast authentication

---

## Authentication Implementation

**Simple Bearer Token Hook:**

```javascript
// src/middleware/auth.js
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  // Query database for valid, active key
  const [rows] = await db.query(
    'SELECT id, description FROM api_keys WHERE key = ? AND is_active = 1',
    [token]
  );

  if (rows.length === 0) {
    return reply.code(401).send({ error: 'Invalid API key' });
  }

  // Attach key info to request for downstream use
  request.apiKey = rows[0];

  // Update last_used_at timestamp (async, don't await)
  db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [rows[0].id]).catch(err =>
    console.error('Failed to update last_used_at:', err)
  );
}
```

Register globally or per-route as needed.

---

## Bulk Insert Strategy

For high-performance log ingestion:

```javascript
// Build values array from batch
const values = logRecords.map(record => [
  record.website_id,
  record.log_type,
  record.timestamp,
  record.host,
  record.code,
  record.remote,
  JSON.stringify(record)
]);

// Single INSERT with multiple rows
await db.query(
  `INSERT INTO log_records 
   (website_id, log_type, timestamp, host, code, remote, raw_data, created_at) 
   VALUES ?`,
  [values.map(v => [...v, new Date()])]
);
```

This is significantly faster than individual INSERTs.

---

## Fluent Bit Configuration

File: `/etc/fluent-bit/fluent-bit.conf`

```ini
[SERVICE]
    Flush           10
    Daemon          Off
    Log_Level       info
    Parsers_File    parsers.conf

[INPUT]
    Name            tail
    Path            /var/www/*/log/access.log
    Path_Key        source_file
    Tag             apache.access
    Parser          apache
    DB              /var/lib/fluent-bit/flb_apache_access.db
    Mem_Buf_Limit   10MB
    Refresh_Interval 10

[INPUT]
    Name            tail
    Path            /var/www/*/log/error.log
    Path_Key        source_file
    Tag             apache.error
    Parser          apache_error
    DB              /var/lib/fluent-bit/flb_apache_error.db
    Mem_Buf_Limit   10MB
    Refresh_Interval 10

[FILTER]
    Name            record_modifier
    Match           *
    Record          host ${HOSTNAME}

[OUTPUT]
    Name            http
    Match           *
    Host            <CENTRAL_RECEIVER_IP>
    Port            3000
    URI             /logs
    Format          json
    Json_Date_Key   log_timestamp
    Json_Date_Format iso8601
    Compress        gzip
    Header          Authorization Bearer <YOUR_SECRET_TOKEN>
```

**Note:** Update `URI` to `/logs` (not `/ingest/logs`) per the finalized API design.

---

## PM2 Deployment

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'headlog',
      script: './src/server.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
```

**Start command:**

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Enable auto-start on boot
```

---

## Development Workflow

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env with database credentials
   ```

3. **Initialize database:**

   ```bash
   mysql -u root -p headlog < schema.sql
   ```

4. **Generate initial API key:**

   ```bash
   node cli.js keys:create --description "Development testing"
   ```

5. **Start development server:**

   ```bash
   node src/server.js
   # or with auto-reload: npm install --save-dev nodemon
   # nodemon src/server.js
   ```

6. **Test ingestion:**
   ```bash
   curl -X POST http://localhost:3000/logs \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '[{"source_file":"/var/www/test.com/log/access.log","host":"dev","remote":"127.0.0.1","code":"200"}]'
   ```

---

## Code Style Guidelines

- Use ES6+ features (async/await, arrow functions, destructuring)
- JSDoc comments for public functions
- Clear, descriptive variable names
- Keep functions small and focused
- Prefer early returns over nested conditionals
- Handle errors explicitly (try/catch for async, .catch for fire-and-forget)
- Log errors to console.error() for PM2 capture
