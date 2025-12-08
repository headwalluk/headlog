-- Migration: 1.5.0 - Hierarchical Aggregation
-- Description: Add upstream log forwarding capability with batch tracking and deduplication
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: No (additive only)

-- ============================================================================
-- Step 1: Add archived_at column to track upstream sync status
-- ============================================================================
ALTER TABLE log_records
  ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When this record was successfully forwarded to upstream server (NULL = not archived)',
  ADD INDEX idx_archived_at (archived_at);

-- ============================================================================
-- Step 2: Create upstream_sync_batches table for batch tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS upstream_sync_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_uuid BINARY(16) NOT NULL UNIQUE COMMENT 'UUID stored as 16-byte binary',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  record_count INT UNSIGNED NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  INDEX idx_batch_uuid (batch_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Step 3: Add upstream_batch_uuid column to log_records
-- ============================================================================
ALTER TABLE log_records
  ADD COLUMN upstream_batch_uuid BINARY(16) NULL
    COMMENT 'UUID of the sync batch this record belongs to (16-byte binary format)',
  ADD INDEX idx_upstream_batch_uuid (upstream_batch_uuid);

-- ============================================================================
-- Step 4: Create batch_deduplication table for upstream instances
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch_deduplication (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_uuid BINARY(16) NOT NULL COMMENT 'Batch UUID from regional instance',
  source_instance VARCHAR(255) NOT NULL COMMENT 'Hostname/identifier of regional instance',
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  record_count INT UNSIGNED NOT NULL,
  
  UNIQUE KEY uk_batch_source (batch_uuid, source_instance),
  INDEX idx_batch_uuid (batch_uuid),
  INDEX idx_source_instance (source_instance),
  INDEX idx_received_at (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Verification
-- ============================================================================
-- After migration, verify:
-- 1. New columns exist: DESCRIBE log_records;
-- 2. New tables created: SHOW TABLES LIKE '%batch%';
-- 3. Indexes created: SHOW INDEX FROM log_records WHERE Key_name LIKE '%upstream%';
