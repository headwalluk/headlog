-- Migration: 1.2.1 - Drop Legacy Host Column
-- Description: Remove old VARCHAR host column after migration to host_id (SMALLINT)
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: Yes (removes old host column)

-- ============================================================================
-- Drop the old host VARCHAR column
-- ============================================================================
-- This completes the host deduplication optimization by removing the redundant
-- VARCHAR(255) column now that all records use host_id (SMALLINT UNSIGNED)
-- Storage savings: ~50-255 bytes per record

ALTER TABLE log_records DROP COLUMN host;

-- ============================================================================
-- Verification
-- ============================================================================
-- After migration, verify:
-- 1. host column is gone: DESCRIBE log_records;
-- 2. host_id is in use: SELECT host_id, COUNT(*) FROM log_records GROUP BY host_id LIMIT 10;
-- 3. Foreign key intact: SHOW CREATE TABLE log_records;
