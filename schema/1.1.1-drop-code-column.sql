-- Migration: 1.1.1 - Drop Legacy Code Column
-- Description: Remove old VARCHAR code column after migration to code_id (SMALLINT)
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: Yes (removes old code column)

-- ============================================================================
-- Drop the old code VARCHAR column
-- ============================================================================
-- This completes the HTTP codes optimization by removing the redundant
-- VARCHAR(10) column now that all records use code_id (SMALLINT UNSIGNED)
-- Storage savings: ~3-11 bytes per record

ALTER TABLE log_records DROP COLUMN code;

-- ============================================================================
-- Verification
-- ============================================================================
-- After migration, verify:
-- 1. code column is gone: DESCRIBE log_records;
-- 2. code_id is in use: SELECT code_id, COUNT(*) FROM log_records GROUP BY code_id;
-- 3. Foreign key intact: SHOW CREATE TABLE log_records;
