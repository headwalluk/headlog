-- Migration: 1.3.0 - TIMESTAMP Optimization
-- Description: Convert timestamp column from DATETIME to TIMESTAMP for storage savings and timezone awareness
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: Minimal (TIMESTAMP handles timezones, range: 1970-2038)

-- ============================================================================
-- Convert timestamp column from DATETIME to TIMESTAMP
-- ============================================================================
-- DATETIME: 8 bytes, no timezone awareness, range: 1000-01-01 to 9999-12-31
-- TIMESTAMP: 4 bytes, UTC-based with timezone conversion, range: 1970-01-19 to 2038-01-19
-- Storage savings: 4 bytes per record

ALTER TABLE log_records 
  MODIFY COLUMN timestamp TIMESTAMP NOT NULL 
  COMMENT 'Log record timestamp (UTC)';

-- ============================================================================
-- Verification
-- ============================================================================
-- After migration, verify:
-- 1. Column type changed: DESCRIBE log_records;
-- 2. Existing timestamps preserved: SELECT timestamp, created_at FROM log_records LIMIT 10;
-- 3. New inserts work: Check after ingesting new logs
