# Production Deployment Checklist

Before deploying Headlog to collect live log data, verify the following:

## ✅ Pre-Deployment Checklist

### Security

- [ ] **Strong database password** set in `.env`
- [ ] **Database user** has minimal permissions (SELECT, INSERT, UPDATE, DELETE only - no DROP, CREATE, ALTER)
- [ ] **`.env` file** has restricted permissions (`chmod 600 .env`)
- [ ] **Rate limiting enabled** (`RATE_LIMIT_ENABLED=true` in `.env`)
- [ ] **Reverse proxy configured** with SSL/TLS (nginx recommended)
- [ ] **Firewall rules** configured (only nginx should access port 3010)
- [ ] **API keys** generated and stored securely

### Configuration

- [ ] **NODE_ENV=production** set in `.env`
- [ ] **LOG_LEVEL=warn** (or error) to reduce log noise
- [ ] **LOG_RETENTION_DAYS** set appropriately (default: 90 days)
- [ ] **INACTIVE_WEBSITE_DAYS** set appropriately (default: 180 days)
- [ ] **Rate limit thresholds** tuned for your expected traffic
- [ ] **PM2 ecosystem file** created from sample and customized
- [ ] **PM2 instances** configured (`'max'` for all CPUs, or specific number)

### Database

- [ ] **Database created** with utf8mb4 character set
- [ ] **Database user created** with appropriate permissions
- [ ] **Connection tested** (`mysql -u headlog_user -p headlog`)
- [ ] **Migrations run successfully** (auto-runs on first startup)
- [ ] **Backup strategy** in place for database

### Application

- [ ] **Dependencies installed** (`npm install --production`)
- [ ] **Tests passing** (`npm test`)
- [ ] **PM2 installed globally** (`npm install -g pm2`)
- [ ] **Application starts successfully** (`pm2 start ecosystem.config.js`)
- [ ] **PM2 auto-startup configured** (`pm2 startup` and `pm2 save`)
- [ ] **Logs directory exists** and is writable (`mkdir -p logs`)

### Monitoring

- [ ] **PM2 status checked** (`pm2 status`)
- [ ] **Application logs reviewed** (`pm2 logs headlog`)
- [ ] **Health endpoint responding** (`curl https://logs.yourdomain.com/health`)
- [ ] **Error handling tested** (try invalid API key, rate limit, etc.)

### Fluent Bit Configuration

- [ ] **API key created** for each web server
- [ ] **Fluent Bit installed** on web servers
- [ ] **Fluent Bit configuration** updated with Headlog server URL and API key
- [ ] **Test log submission** successful from one web server
- [ ] **Fluent Bit service enabled** and started

## 🔧 Post-Deployment Verification

### Test API Endpoints

**1. Health Check (no auth required):**

```bash
curl https://logs.yourdomain.com/health
```

Expected: `{"status":"ok","timestamp":"...","uptime":...}`

**2. Test Authentication:**

```bash
# Should fail with 401
curl https://logs.yourdomain.com/websites
```

**3. Test with Valid API Key:**

```bash
curl https://logs.yourdomain.com/websites \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected: `[]` (empty array if no logs ingested yet)

**4. Test Rate Limiting:**

```bash
# Run 150 requests rapidly (should see 429 after 100)
for i in {1..150}; do
  curl -s -w "%{http_code}\n" \
    https://logs.yourdomain.com/logs \
    -H "Authorization: Bearer invalid" \
    -d '[]' | tail -1
done | sort | uniq -c
```

Expected: ~100 × 401 responses, then 429 responses

**5. Test Log Ingestion:**

```bash
curl -X POST https://logs.yourdomain.com/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{
    "source_file": "/var/www/example.com/log/access.log",
    "host": "test-server",
    "remote": "192.168.1.100",
    "method": "GET",
    "path": "/test",
    "code": "200",
    "log_timestamp": "2025-12-07T12:00:00.000000Z"
  }]'
```

Expected: `{"status":"ok","received":1,"processed":1}`

**6. Verify Data in Database:**

```sql
-- Check websites were created
SELECT * FROM websites ORDER BY created_at DESC LIMIT 5;

-- Check logs were ingested
SELECT id, host, timestamp, code,
       JSON_EXTRACT(raw_data, '$.path') as path
FROM log_records
ORDER BY created_at DESC
LIMIT 10;

-- Check API key usage
SELECT id, description, is_active, last_used_at
FROM api_keys
ORDER BY last_used_at DESC;
```

## 🚨 Common Issues

### Application Won't Start

**Check PM2 logs:**

```bash
pm2 logs headlog --lines 50
```

**Common causes:**

- Missing `.env` file
- Incorrect database credentials
- Port already in use
- Node.js version < 18

### Can't Connect from Fluent Bit

**Test from web server:**

```bash
# From your web server, test connectivity
curl https://logs.yourdomain.com/health
```

**Common causes:**

- Firewall blocking connections
- SSL certificate issues
- Incorrect URL in Fluent Bit config
- DNS not resolving

### Rate Limiting Too Aggressive

**Symptoms:**

- Legitimate requests getting 429 responses
- Fluent Bit logs showing rate limit errors

**Solutions:**

1. Check current traffic patterns:

```sql
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.remote')) as ip,
  COUNT(*) as request_count,
  COUNT(*) / 60.0 as req_per_second
FROM log_records
WHERE timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY ip
ORDER BY request_count DESC;
```

2. Increase rate limits in `.env`:

```bash
RATE_LIMIT_MAX=500
RATE_LIMIT_WINDOW=1 minute
```

3. Restart PM2:

```bash
pm2 restart headlog
```

### Database Growing Too Fast

**Check database size:**

```sql
SELECT
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS "Size (MB)",
  table_rows
FROM information_schema.TABLES
WHERE table_schema = 'headlog'
ORDER BY (data_length + index_length) DESC;
```

**Solutions:**

1. Reduce retention period in `.env`:

```bash
LOG_RETENTION_DAYS=30
```

2. Manually trigger cleanup:

```bash
# PM2 will run housekeeping automatically, but you can force it:
pm2 restart headlog
```

3. Consider archiving old data:

```sql
-- Export logs older than 90 days
SELECT * INTO OUTFILE '/tmp/logs-archive-2025-12.csv'
FROM log_records
WHERE timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Then delete
DELETE FROM log_records
WHERE timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

## 📊 Monitoring Recommendations

### PM2 Monitoring

```bash
# Status overview
pm2 status

# Watch real-time logs
pm2 logs headlog --lines 100

# Resource monitoring
pm2 monit
```

### Database Monitoring

**Daily checks:**

```sql
-- Records ingested today
SELECT COUNT(*) as todays_records
FROM log_records
WHERE DATE(created_at) = CURDATE();

-- Websites being monitored
SELECT COUNT(*) as active_websites
FROM websites
WHERE last_activity_at > DATE_SUB(NOW(), INTERVAL 7 DAY);

-- API key usage
SELECT description, last_used_at,
       TIMESTAMPDIFF(MINUTE, last_used_at, NOW()) as minutes_since_use
FROM api_keys
WHERE is_active = 1
ORDER BY last_used_at DESC;
```

### Application Health

**Set up a cron job to monitor health:**

```bash
# Add to crontab (crontab -e)
*/5 * * * * curl -s https://logs.yourdomain.com/health || echo "Headlog health check failed" | mail -s "Alert: Headlog Down" admin@yourdomain.com
```

## 📝 Ongoing Maintenance

### Weekly

- Review PM2 logs for errors
- Check database growth trends
- Verify Fluent Bit is sending data from all servers

### Monthly

- Review and rotate API keys if needed
- Analyze query patterns for optimization opportunities
- Review rate limiting effectiveness

### Quarterly

- Update Node.js and npm packages (`npm update`)
- Review and update retention policies
- Performance tuning based on actual usage

## 🔒 Security Best Practices

1. **Keep API keys secure**: Never commit to git, store in password manager
2. **Monitor for abuse**: Check for unusual request patterns
3. **Regular updates**: Keep dependencies updated (`npm audit`)
4. **SSL/TLS only**: Never expose plain HTTP in production
5. **Principle of least privilege**: Database user should only have necessary permissions
6. **Backup regularly**: Automate database backups
7. **Monitor logs**: Watch for authentication failures and rate limit hits

## 🎯 Ready to Go Live?

Once all checklist items are complete and post-deployment tests pass, you're ready to:

1. Point Fluent Bit from all web servers to your Headlog instance
2. Monitor the first few hours for any issues
3. Set up automated backups
4. Document any custom configuration for your team

**Congratulations! Your log aggregation system is now live! 🚀**
