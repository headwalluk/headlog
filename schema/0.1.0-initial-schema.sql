-- Migration: 0.1.0 - Initial Schema
-- Description: Creates core tables for log ingestion system
-- Author: Headlog Team
-- Date: 2025-12-07

-- ============================================================================
-- Websites Table
-- Stores information about each website being monitored
-- ============================================================================
CREATE TABLE IF NOT EXISTS websites (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  domain VARCHAR(255) NOT NULL UNIQUE,
  is_ssl BOOLEAN NOT NULL DEFAULT TRUE,
  is_dev BOOLEAN NOT NULL DEFAULT FALSE,
  owner_email VARCHAR(255) DEFAULT NULL,
  admin_email VARCHAR(255) DEFAULT NULL,
  last_activity_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_domain (domain),
  INDEX idx_last_activity (last_activity_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Log Records Table
-- Stores individual log entries from Apache access and error logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS log_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  website_id INT UNSIGNED NOT NULL,
  log_type ENUM('access', 'error') NOT NULL,
  timestamp DATETIME NOT NULL,
  host VARCHAR(255) NOT NULL,
  code VARCHAR(10) DEFAULT NULL,
  remote VARCHAR(45) DEFAULT NULL COMMENT 'IPv4 or IPv6 address',
  raw_data JSON NOT NULL COMMENT 'Complete log record as received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
  
  INDEX idx_website_id (website_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_host (host),
  INDEX idx_remote (remote),
  INDEX idx_code (code),
  INDEX idx_log_type (log_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- API Keys Table
-- Manages authentication tokens for Fluent Bit agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(40) NOT NULL UNIQUE COMMENT 'Alphanumeric token, 40 chars',
  description TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_key (`key`),
  INDEX idx_is_active (is_active),
  INDEX idx_last_used (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
