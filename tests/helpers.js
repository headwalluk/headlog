/**
 * Test helper utilities
 */

const http = require('http');
const https = require('https');
const { promisify } = require('util');
const zlib = require('zlib');

const gzip = promisify(zlib.gzip);

// Load config to get server port
const config = require('../src/config');

const BASE_URL = `http://${config.server.host}:${config.server.port}`;

/**
 * Make HTTP request with optional compression
 * @param {Object} options - Request options
 * @returns {Promise<Object>} { status, headers, body }
 */
async function request(options) {
  const { method = 'GET', path, headers = {}, body = null, compress = false } = options;

  return new Promise((resolve, reject) => {
    let postData = null;

    if (body) {
      if (typeof body === 'object') {
        postData = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      } else {
        postData = body;
      }
    }

    // Handle gzip compression
    const performRequest = async () => {
      let finalData = postData;
      let finalHeaders = { ...headers };

      if (compress && postData) {
        finalData = await gzip(postData);
        finalHeaders['Content-Encoding'] = 'gzip';
        finalHeaders['Content-Length'] = finalData.length;
      } else if (postData) {
        finalHeaders['Content-Length'] = Buffer.byteLength(postData);
      }

      const url = new URL(path, BASE_URL);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(
        url,
        {
          method,
          headers: finalHeaders
        },
        res => {
          let responseBody = '';

          res.on('data', chunk => {
            responseBody += chunk;
          });

          res.on('end', () => {
            let parsedBody = responseBody;

            // Try to parse JSON
            if (res.headers['content-type']?.includes('application/json')) {
              try {
                parsedBody = JSON.parse(responseBody);
              } catch {
                // Keep as string if parse fails
              }
            }

            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedBody
            });
          });
        }
      );

      req.on('error', reject);

      if (finalData) {
        req.write(finalData);
      }

      req.end();
    };

    performRequest().catch(reject);
  });
}

/**
 * Create a test API key via CLI
 * @returns {Promise<{key: string, id: number}>} Object with plaintext key and database ID
 */
async function createTestApiKey() {
  const bcrypt = require('bcrypt');
  const { generateApiKey } = require('../src/utils/generateApiKey');
  const { getPool } = require('../src/config/database');

  const key = generateApiKey();
  const keyHash = await bcrypt.hash(key, 10);
  const pool = getPool();

  const [result] = await pool.query('INSERT INTO api_keys (`key`, description) VALUES (?, ?)', [
    keyHash,
    'Test API key - auto-generated'
  ]);

  return { key, id: result.insertId }; // Return plaintext key and ID
}

/**
 * Delete an API key by description pattern
 * @param {string} descriptionPattern - Description pattern to match (uses LIKE)
 */
async function deleteApiKey(descriptionPattern = 'Test API key%') {
  const { getPool } = require('../src/config/database');
  const pool = getPool();

  await pool.query('DELETE FROM api_keys WHERE description LIKE ?', [descriptionPattern]);
}

/**
 * Clean up test data from database
 */
async function cleanupTestData() {
  const { getPool } = require('../src/config/database');
  const pool = getPool();

  // Delete test API keys
  await pool.query('DELETE FROM api_keys WHERE description LIKE ?', ['Test API key%']);

  // Delete test websites and their logs (cascade)
  await pool.query('DELETE FROM websites WHERE domain LIKE ?', ['test-%']);
}

/**
 * Wait for server to be ready
 * @param {number} maxAttempts - Maximum connection attempts
 * @param {number} delay - Delay between attempts (ms)
 * @returns {Promise<boolean>}
 */
async function waitForServer(maxAttempts = 10, delay = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await request({ method: 'GET', path: '/health' });
      if (response.status === 200) {
        return true;
      }
    } catch {
      // Server not ready, wait and retry
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return false;
}

/**
 * Generate sample log records
 * @param {number} count - Number of records to generate
 * @returns {Array<Object>}
 */
function generateSampleLogs(count = 1) {
  const logs = [];
  const timestamp = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    // Alternate between access and error logs
    if (i % 2 === 0) {
      logs.push({
        timestamp,
        host: 'test-example.com',
        source_file: '/var/www/test-example.com/log/access.log',
        remote: '192.0.2.1',
        method: 'GET',
        path: `/test-${i}`,
        code: '200',
        size: 1234,
        referer: '-',
        agent: 'Mozilla/5.0 (Test)'
      });
    } else {
      logs.push({
        timestamp,
        host: 'test-example.com',
        source_file: '/var/www/test-example.com/log/error.log',
        remote: '192.0.2.1',
        level: 'error',
        message: `Test error message ${i}`,
        code: '500'
      });
    }
  }

  return logs;
}

/**
 * Assert helper with better error messages
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Deep equality check
 * @param {any} actual
 * @param {any} expected
 * @param {string} message
 */
function assertEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr !== expectedStr) {
    throw new Error(
      `Assertion failed: ${message}\n` + `  Expected: ${expectedStr}\n` + `  Actual:   ${actualStr}`
    );
  }
}

module.exports = {
  BASE_URL,
  request,
  createTestApiKey,
  deleteApiKey,
  cleanupTestData,
  waitForServer,
  generateSampleLogs,
  assert,
  assertEqual
};
