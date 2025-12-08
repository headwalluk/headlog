-- Verification queries for 1.1.0-http-codes-optimization migration
-- Run these after migration to verify data integrity

-- Check how many error logs have code_id = 0 (N/A)
SELECT COUNT(*) as na_count FROM log_records WHERE code_id = 0;

-- Distribution of HTTP codes
SELECT 
  hc.id,
  hc.code,
  hc.description,
  COUNT(lr.id) as usage_count
FROM http_codes hc
LEFT JOIN log_records lr ON hc.id = lr.code_id
GROUP BY hc.id, hc.code, hc.description
ORDER BY usage_count DESC;

-- Verify migration correctness (old code vs new code_id)
SELECT 
  lr.id,
  lr.code as old_code,
  lr.code_id,
  hc.code as new_code,
  hc.description
FROM log_records lr 
JOIN http_codes hc ON lr.code_id = hc.id 
LIMIT 20;

-- Check for any unmigrated records (should be empty)
SELECT COUNT(*) as unmigrated_count 
FROM log_records 
WHERE code_id IS NULL;

-- Verify foreign key constraint exists
SELECT 
  CONSTRAINT_NAME,
  TABLE_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'log_records'
  AND CONSTRAINT_NAME = 'fk_log_records_code_id';
