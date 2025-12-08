# Rate Limiting & IP Blocking

This document analyzes rate limiting strategies for Headlog, with recommendations for protecting against bot probes and abuse.

## Table of Contents

- [Current Architecture](#current-architecture)
- [Threat Analysis](#threat-analysis)
- [Rate Limiting Options](#rate-limiting-options)
- [Recommended Approach](#recommended-approach)
- [Implementation](#implementation)
- [Configuration](#configuration)

## Current Architecture

### Middleware Chain

```
Request → Fastify → Compression → onRequest Hook → Auth Middleware → Routes
```

**Key observation**: Authentication runs very early (onRequest hook), before route handlers.

### Authentication Costs

The current auth middleware performs:

1. Header validation (cheap - simple string checks)
2. Database query to fetch active API keys (moderate - indexed query)
3. **Bcrypt comparison for each key** (expensive - ~10 rounds, ~60-100ms per key)

With multiple valid keys, an attacker forcing auth checks costs us:

- Database connection
- N × bcrypt.compare() operations (N = number of active keys)
- **~60-100ms CPU per failed attempt per key**

## Threat Analysis

### Likely Threats

1. **Bot Probes/Scanners**:
   - Random bots looking for vulnerabilities
   - Send 10-100 requests testing common paths
   - Don't have valid credentials
   - **Impact**: Waste CPU on bcrypt comparisons

2. **Credential Stuffing**:
   - Attacker tries stolen API keys
   - Relatively slow (1-10 req/sec per IP)
   - **Impact**: Database queries + bcrypt comparisons

3. **DDoS** (unlikely for niche API):
   - Coordinated attack from many IPs
   - High volume (100s-1000s req/sec)
   - **Impact**: Need infrastructure-level protection (nginx, cloudflare)

### Attack Surface

Valid API keys are:

- 40 character alphanumeric strings
- Randomly generated (cryptographically secure)
- Bcrypt hashed in database
- **Attack complexity**: ~62^40 combinations (practically impossible to brute force)

**However**: Failed auth attempts still cost CPU (bcrypt comparisons).

## Rate Limiting Options

### Option 1: Application-Level Rate Limiting (✓ Recommended)

Use `@fastify/rate-limit` plugin to limit requests per IP before authentication.

**Advantages**:

- ✅ Runs before auth middleware (saves CPU)
- ✅ Simple to implement (~10 lines of code)
- ✅ Configurable limits and responses
- ✅ Memory-efficient (in-memory store)
- ✅ Works with PM2 cluster mode

**Disadvantages**:

- ⚠️ Each worker has separate counter (PM2 cluster)
- ⚠️ Rate limits reset on server restart
- ⚠️ Memory-based (doesn't persist)

**Best for**: Small-to-medium deployments, bot protection, credential stuffing prevention.

### Option 2: Redis-Based Rate Limiting

Use Redis as shared rate limit store across workers.

**Advantages**:

- ✅ Shared across all PM2 workers
- ✅ Persists between restarts
- ✅ Very fast lookups
- ✅ Can track long-term abuse patterns

**Disadvantages**:

- ❌ Requires Redis infrastructure
- ❌ Additional dependency
- ❌ Network overhead (Redis connection)
- ❌ More complex setup

**Best for**: High-traffic deployments, multiple servers, sophisticated tracking.

### Option 3: Nginx Rate Limiting

Configure rate limiting at the reverse proxy layer.

**Advantages**:

- ✅ Protects before hitting Node.js
- ✅ Very efficient (native C code)
- ✅ Can rate limit by IP zone
- ✅ Works across all backend servers

**Disadvantages**:

- ❌ Requires nginx configuration
- ❌ Less flexible than application logic
- ❌ Harder to customize error responses
- ❌ Not applicable if using PM2 directly

**Best for**: Production deployments behind nginx, infrastructure-level protection.

### Option 4: Cloudflare/CDN Rate Limiting

Use Cloudflare's rate limiting rules (or similar CDN).

**Advantages**:

- ✅ Protects at network edge
- ✅ Blocks before reaching your server
- ✅ DDoS protection included
- ✅ Geographic blocking options

**Disadvantages**:

- ❌ May require paid plan
- ❌ Less control over logic
- ❌ External dependency

**Best for**: Public-facing APIs, high-risk environments, DDoS protection.

## Recommended Approach

### Phase 1: Application-Level Rate Limiting (Now)

Implement `@fastify/rate-limit` with conservative limits:

**Why this approach**:

1. **Runs before auth**: Saves expensive bcrypt comparisons
2. **Simple setup**: ~5 minutes to implement
3. **No infrastructure changes**: Works with current setup
4. **Adequate for staging**: Protects against bot probes
5. **Easy to tune**: Can adjust limits based on real traffic patterns

**When to upgrade**:

- Traffic exceeds 1000 req/sec
- Need cross-worker coordination
- Want persistent rate limit tracking
- Multiple server instances

### Phase 2: Nginx Rate Limiting (Production)

Add nginx rate limiting when deploying to production:

```nginx
limit_req_zone $binary_remote_addr zone=headlog:10m rate=10r/s;

server {
    location / {
        limit_req zone=headlog burst=20 nodelay;
        proxy_pass http://localhost:3010;
    }
}
```

This provides **defense in depth**:

- Nginx blocks excessive requests
- Application-level limits catch stragglers
- Auth middleware validates legitimate requests

## Implementation

### Install Rate Limit Plugin

```bash
npm install @fastify/rate-limit
```

### Configure Rate Limiting

Add to `src/server.js` **before** the authentication hook:

```javascript
const rateLimit = require('@fastify/rate-limit');

// Register rate limiting (before auth hook)
await app.register(rateLimit, {
  max: 100, // Max requests per window
  timeWindow: '1 minute', // Time window
  cache: 10000, // Cache size (number of IPs to track)
  allowList: ['127.0.0.1'], // Whitelist localhost
  skipOnError: false, // Don't skip rate limit on errors
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate Limit Exceeded',
      message: `Too many requests. Limit: ${context.max} requests per ${context.after}`,
      retryAfter: context.after
    };
  }
});
```

### Rate Limit Recommendations

**Conservative (Staging)**:

```javascript
{
  max: 100,               // 100 requests per minute
  timeWindow: '1 minute'  // = ~1.6 req/sec average
}
```

**Production (Legitimate Use)**:

```javascript
{
  max: 300,               // 300 requests per minute
  timeWindow: '1 minute'  // = 5 req/sec average
}
```

**Aggressive (High Security)**:

```javascript
{
  max: 60,                // 60 requests per minute
  timeWindow: '1 minute'  // = 1 req/sec average
}
```

### Per-Route Rate Limits

You can apply different limits to specific routes:

```javascript
// Tighter limit for log ingestion
app.register(async function (fastify) {
  fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  });

  fastify.post('/logs', logsHandler);
});

// Looser limit for website queries
app.register(async function (fastify) {
  fastify.register(rateLimit, {
    max: 50,
    timeWindow: '1 minute'
  });

  fastify.get('/websites', websitesHandler);
  fastify.get('/websites/:id', websiteDetailHandler);
});
```

## Configuration

### Add to `src/config/index.js`

```javascript
module.exports = {
  // ... existing config

  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    cache: parseInt(process.env.RATE_LIMIT_CACHE, 10) || 10000,
    allowList: process.env.RATE_LIMIT_ALLOWLIST
      ? process.env.RATE_LIMIT_ALLOWLIST.split(',')
      : ['127.0.0.1']
  }
};
```

### Environment Variables

Add to `.env`:

```bash
# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
RATE_LIMIT_CACHE=10000
RATE_LIMIT_ALLOWLIST=127.0.0.1,::1
```

## Monitoring & Tuning

### Log Rate Limit Events

Add custom error handler to track blocked IPs:

```javascript
errorResponseBuilder: (request, context) => {
  app.log.warn(
    {
      ip: request.ip,
      path: request.url,
      method: request.method,
      rateLimitHit: true
    },
    'Rate limit exceeded'
  );

  return {
    error: 'Rate Limit Exceeded',
    message: `Too many requests. Limit: ${context.max} requests per ${context.after}`,
    retryAfter: context.after
  };
};
```

### Analyze Legitimate Traffic

Before deploying to production, analyze your staging traffic patterns:

```sql
-- Find legitimate request rates per IP
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.remote')) as ip,
  COUNT(*) as request_count,
  MIN(timestamp) as first_request,
  MAX(timestamp) as last_request,
  TIMESTAMPDIFF(MINUTE, MIN(timestamp), MAX(timestamp)) as duration_minutes,
  COUNT(*) / GREATEST(TIMESTAMPDIFF(MINUTE, MIN(timestamp), MAX(timestamp)), 1) as req_per_minute
FROM log_records
WHERE log_type = 'access'
  AND timestamp > DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY ip
ORDER BY req_per_minute DESC
LIMIT 20;
```

This shows real-world request rates so you can set appropriate limits.

## Security Benefits

### With Rate Limiting Before Auth

1. **CPU Protection**:
   - Bot sending 1000 req/min → Rate limited to 100 req/min
   - Saves 900 × (N keys × ~80ms) = ~72 seconds of CPU per minute per bot

2. **Database Protection**:
   - Reduces auth queries by 90%
   - Prevents connection pool exhaustion

3. **Graceful Degradation**:
   - Legitimate users get informative error (429 with retry-after)
   - Service remains available for valid clients

### Attack Scenarios

**Scenario 1: Bot Probe**

- Bot hits API 100 times in 10 seconds
- **Without rate limit**: 100 auth checks (100 × N × 80ms CPU)
- **With rate limit**: 17 auth checks, 83 rejected early (saves ~83% CPU)

**Scenario 2: Credential Stuffing**

- Attacker tries 1000 stolen keys at 10 req/sec
- **Without rate limit**: All 1000 hit auth (expensive)
- **With rate limit**: Throttled to 100 req/min, IP gets blocked

**Scenario 3: Distributed Scanner**

- Botnet with 100 IPs, each sending 50 req/min
- **Without rate limit**: 5000 req/min hit auth
- **With rate limit**: Each IP limited independently, manageable load

## Testing Rate Limits

Test your rate limiting configuration:

```bash
# Test rate limit with curl
for i in {1..120}; do
  curl -X POST http://localhost:3010/logs \
    -H "Authorization: Bearer invalid-key-1234567890123456789012345678" \
    -H "Content-Type: application/json" \
    -d '[]' &
  sleep 0.1
done

# Should see 429 responses after hitting limit
```

## Conclusion

**Recommended Implementation**:

1. ✅ Install `@fastify/rate-limit`
2. ✅ Set conservative limits (100 req/min for staging)
3. ✅ Place **before** authentication hook
4. ✅ Monitor logs for rate limit hits
5. ✅ Tune based on real traffic patterns

**Yes, there IS significant advantage** to rate limiting before authentication:

- Saves expensive bcrypt operations
- Protects database connections
- Prevents legitimate service degradation
- Simple to implement with existing tools

The combination of rate limiting + bcrypt authentication provides strong protection against bot probes and credential attacks while maintaining good performance for legitimate users.
