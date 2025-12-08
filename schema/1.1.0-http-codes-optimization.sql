-- Migration: 1.1.0 - HTTP Codes Optimization
-- Description: Creates http_codes lookup table and migrates log_records to use code_id
-- Author: Headlog Team
-- Date: 2025-12-08
-- Breaking Change: Yes (schema change)

-- ============================================================================
-- Step 1: Create http_codes lookup table
-- ============================================================================
CREATE TABLE IF NOT EXISTS http_codes (
  id SMALLINT UNSIGNED PRIMARY KEY COMMENT 'HTTP status code number (or 0 for N/A)',
  code VARCHAR(10) NOT NULL UNIQUE COMMENT 'HTTP status code as string',
  description VARCHAR(100) DEFAULT NULL COMMENT 'Human-readable description',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Step 2: Pre-populate with standard HTTP codes (IANA registry)
-- Source: https://www.iana.org/assignments/http-status-codes/
-- ============================================================================
INSERT INTO http_codes (id, code, description) VALUES
  -- Special value for logs without HTTP status
  (0,   'N/A',  'Not applicable (error log without HTTP status)'),
  
  -- 1xx Informational
  (100, '100',  'Continue'),
  (101, '101',  'Switching Protocols'),
  (102, '102',  'Processing'),
  (103, '103',  'Early Hints'),
  
  -- 2xx Success
  (200, '200',  'OK'),
  (201, '201',  'Created'),
  (202, '202',  'Accepted'),
  (203, '203',  'Non-Authoritative Information'),
  (204, '204',  'No Content'),
  (205, '205',  'Reset Content'),
  (206, '206',  'Partial Content'),
  (207, '207',  'Multi-Status'),
  (208, '208',  'Already Reported'),
  (226, '226',  'IM Used'),
  
  -- 3xx Redirection
  (300, '300',  'Multiple Choices'),
  (301, '301',  'Moved Permanently'),
  (302, '302',  'Found'),
  (303, '303',  'See Other'),
  (304, '304',  'Not Modified'),
  (305, '305',  'Use Proxy'),
  (307, '307',  'Temporary Redirect'),
  (308, '308',  'Permanent Redirect'),
  
  -- 4xx Client Error
  (400, '400',  'Bad Request'),
  (401, '401',  'Unauthorized'),
  (402, '402',  'Payment Required'),
  (403, '403',  'Forbidden'),
  (404, '404',  'Not Found'),
  (405, '405',  'Method Not Allowed'),
  (406, '406',  'Not Acceptable'),
  (407, '407',  'Proxy Authentication Required'),
  (408, '408',  'Request Timeout'),
  (409, '409',  'Conflict'),
  (410, '410',  'Gone'),
  (411, '411',  'Length Required'),
  (412, '412',  'Precondition Failed'),
  (413, '413',  'Content Too Large'),
  (414, '414',  'URI Too Long'),
  (415, '415',  'Unsupported Media Type'),
  (416, '416',  'Range Not Satisfiable'),
  (417, '417',  'Expectation Failed'),
  (421, '421',  'Misdirected Request'),
  (422, '422',  'Unprocessable Content'),
  (423, '423',  'Locked'),
  (424, '424',  'Failed Dependency'),
  (425, '425',  'Too Early'),
  (426, '426',  'Upgrade Required'),
  (428, '428',  'Precondition Required'),
  (429, '429',  'Too Many Requests'),
  (431, '431',  'Request Header Fields Too Large'),
  (451, '451',  'Unavailable For Legal Reasons'),
  
  -- 5xx Server Error
  (500, '500',  'Internal Server Error'),
  (501, '501',  'Not Implemented'),
  (502, '502',  'Bad Gateway'),
  (503, '503',  'Service Unavailable'),
  (504, '504',  'Gateway Timeout'),
  (505, '505',  'HTTP Version Not Supported'),
  (506, '506',  'Variant Also Negotiates'),
  (507, '507',  'Insufficient Storage'),
  (508, '508',  'Loop Detected'),
  (510, '510',  'Not Extended (OBSOLETED)'),
  (511, '511',  'Network Authentication Required');

-- ============================================================================
-- Step 3: Add new code_id column to log_records (without constraint yet)
-- ============================================================================
ALTER TABLE log_records 
  ADD COLUMN code_id SMALLINT UNSIGNED DEFAULT NULL COMMENT 'Foreign key to http_codes.id'
  AFTER code;

-- ============================================================================
-- Step 4: Migrate existing data
-- ============================================================================
-- Update code_id for records with valid HTTP codes
UPDATE log_records lr
JOIN http_codes hc ON lr.code = hc.code
SET lr.code_id = hc.id
WHERE lr.code IS NOT NULL;

-- Set code_id to 0 (N/A) for records without a code
UPDATE log_records
SET code_id = 0
WHERE code IS NULL;

-- ============================================================================
-- Step 5: Make code_id NOT NULL and add foreign key constraint
-- ============================================================================
ALTER TABLE log_records
  MODIFY COLUMN code_id SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Foreign key to http_codes.id (0 = N/A for error logs)',
  ADD CONSTRAINT fk_log_records_code_id 
    FOREIGN KEY (code_id) REFERENCES http_codes(id);

-- ============================================================================
-- Step 6: Add index on code_id for query performance
-- ============================================================================
ALTER TABLE log_records
  ADD INDEX idx_code_id (code_id);

-- ============================================================================
-- Step 7: Drop old code column (breaking change)
-- ============================================================================
-- Uncomment the line below to complete the migration
-- WARNING: This is a breaking change - ensure all code is updated first
-- ALTER TABLE log_records DROP COLUMN code;
