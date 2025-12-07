-- Migration: 0.2.1 - Hash API keys with bcrypt
-- Description: Adds key_hash column and drops plaintext key column for security
-- Author: Headlog Team
-- Date: 2025-12-07

-- Add new column for hashed keys
ALTER TABLE api_keys 
ADD COLUMN key_hash VARCHAR(60) NULL AFTER `key`;

-- Note: Existing keys will need to be regenerated as we cannot reverse-hash them
-- The application will handle this by requiring key recreation

-- Drop the plaintext key column (this also drops UNIQUE constraint and idx_key index)
ALTER TABLE api_keys 
DROP COLUMN `key`;

-- Rename key_hash to key and make it NOT NULL with UNIQUE constraint
ALTER TABLE api_keys 
CHANGE COLUMN key_hash `key` VARCHAR(60) NOT NULL UNIQUE;

-- Add index on key column
ALTER TABLE api_keys 
ADD INDEX idx_key (`key`);
