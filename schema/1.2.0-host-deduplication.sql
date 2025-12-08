-- Migration: 1.2.0 - Host Deduplication Optimization
-- Description: Creates hosts lookup table and migrates log_records to use host_id
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: Yes (schema change)

-- ============================================================================
-- Step 1: Create hosts lookup table
-- ============================================================================
CREATE TABLE IF NOT EXISTS hosts (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Host ID',
  hostname VARCHAR(255) NOT NULL UNIQUE COMMENT 'Hostname from log records',
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_hostname (hostname),
  INDEX idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Step 2: Populate hosts table from existing log_records
-- ============================================================================
INSERT INTO hosts (hostname, first_seen_at, last_seen_at)
SELECT 
  host as hostname,
  MIN(created_at) as first_seen_at,
  MAX(created_at) as last_seen_at
FROM log_records
WHERE host IS NOT NULL
GROUP BY host;

-- ============================================================================
-- Step 3: Add new host_id column to log_records (without constraint yet)
-- ============================================================================
ALTER TABLE log_records 
  ADD COLUMN host_id SMALLINT UNSIGNED DEFAULT NULL COMMENT 'Foreign key to hosts.id'
  AFTER host;

-- ============================================================================
-- Step 4: Migrate existing data
-- ============================================================================
UPDATE log_records lr
JOIN hosts h ON lr.host = h.hostname
SET lr.host_id = h.id
WHERE lr.host IS NOT NULL;

-- ============================================================================
-- Step 5: Make host_id NOT NULL and add foreign key constraint
-- ============================================================================
ALTER TABLE log_records
  MODIFY COLUMN host_id SMALLINT UNSIGNED NOT NULL
    COMMENT 'Foreign key to hosts.id',
  ADD CONSTRAINT fk_log_records_host_id 
    FOREIGN KEY (host_id) REFERENCES hosts(id);

-- ============================================================================
-- Step 6: Add index on host_id for query performance
-- ============================================================================
ALTER TABLE log_records
  ADD INDEX idx_host_id (host_id);

-- ============================================================================
-- Step 7: Drop old host column (breaking change)
-- ============================================================================
-- Uncomment the line below to complete the migration
-- WARNING: This is a breaking change - ensure all code is updated first
-- ALTER TABLE log_records DROP COLUMN host;
