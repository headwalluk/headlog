#!/usr/bin/env node

/**
 * API Integration Tests
 *
 * Prerequisites: Server must be running (npm run dev or npm start)
 *
 * Usage:
 *   npm run test:quick    # Quick smoke tests (4 tests)
 *   npm run test:complete # Full test suite (20+ tests)
 *   npm test              # Alias for test:complete
 *
 * Or directly:
 *   node tests/api.test.js --type=quick
 *   node tests/api.test.js --type=complete
 */

const { test, describe, before, after } = require('node:test');
const { initDatabase, closeDatabase } = require('../src/config/database');
const {
  request,
  createTestApiKey,
  deleteApiKey,
  cleanupTestData,
  waitForServer,
  generateSampleLogs,
  assert,
  assertEqual
} = require('./helpers');

// Parse command line arguments
const args = process.argv.slice(2);
const typeArg = args.find(arg => arg.startsWith('--type='));
const testType = typeArg ? typeArg.split('=')[1] : 'complete';

const isQuick = testType === 'quick';
const isComplete = testType === 'complete';

if (!['quick', 'complete'].includes(testType)) {
  console.error('Invalid test type. Use --type=quick or --type=complete');
  process.exit(1);
}

console.log(`\n🧪 Running ${testType} tests...\n`);

// Global test state
let testApiKey = null;

// Setup: Initialize database and wait for server
before(async () => {
  await initDatabase();

  // Wait for server to be ready
  const serverReady = await waitForServer();
  if (!serverReady) {
    console.error('\n❌ ERROR: Server is not running!\n');
    console.error('Please start the server in another terminal:');
    console.error('  npm run dev  (for development)');
    console.error('  npm start    (for production)\n');
    throw new Error(
      'Server did not start in time. Make sure the server is running before executing tests.'
    );
  }

  console.log('✓ Server is ready\n');

  // Clean up any existing test data
  await cleanupTestData();
});

// Cleanup: Close database and remove test data
after(async () => {
  await cleanupTestData();
  await closeDatabase();
  console.log('\n✓ Cleanup complete\n');
});

// =============================================================================
// Quick Tests - Essential smoke tests
// =============================================================================

describe('Quick Tests - Smoke Tests', { skip: !isQuick && !isComplete }, () => {
  test('Health endpoint returns 200', async () => {
    const response = await request({
      method: 'GET',
      path: '/health'
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.body.status === 'ok', 'Expected status: ok');
    assert(response.body.timestamp, 'Expected timestamp in response');
  });

  test('Missing API key returns 401', async () => {
    const response = await request({
      method: 'POST',
      path: '/logs',
      body: []
    });

    assert(response.status === 401, `Expected 401, got ${response.status}`);
  });

  test('Invalid API key returns 401', async () => {
    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: 'Bearer invalid-key-12345678901234567890'
      },
      body: []
    });

    assert(response.status === 401, `Expected 401, got ${response.status}`);
  });

  test('Can create and use API key for single log ingestion', async () => {
    // Create test API key
    testApiKey = await createTestApiKey();
    assert(testApiKey.length === 40, 'API key should be 40 characters');

    // Generate single log record
    const logs = generateSampleLogs(1);

    // Submit log
    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: logs
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.body.received === 1, 'Expected 1 record received');
    assert(response.body.processed === 1, 'Expected 1 record processed');
  });
});

// =============================================================================
// Complete Tests - Full test suite
// =============================================================================

describe('Complete Tests - Authentication', { skip: !isComplete }, () => {
  test('Create API key via helper', async () => {
    if (!testApiKey) {
      testApiKey = await createTestApiKey();
    }
    assert(testApiKey.length === 40, 'API key should be 40 characters');
    assert(/^[a-zA-Z0-9]+$/.test(testApiKey), 'API key should be alphanumeric');
  });

  test('Valid API key allows access', async () => {
    const response = await request({
      method: 'GET',
      path: '/websites',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  test('Deactivated API key returns 401', async () => {
    const { getPool } = require('../src/config/database');
    const pool = getPool();

    // Deactivate the key
    await pool.query('UPDATE api_keys SET is_active = 0 WHERE `key` = ?', [testApiKey]);

    const response = await request({
      method: 'GET',
      path: '/websites',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 401, `Expected 401, got ${response.status}`);

    // Reactivate for other tests
    await pool.query('UPDATE api_keys SET is_active = 1 WHERE `key` = ?', [testApiKey]);
  });
});

describe('Complete Tests - Log Ingestion', { skip: !isComplete }, () => {
  test('Ingest single access log (uncompressed)', async () => {
    const logs = generateSampleLogs(1);

    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: logs
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assertEqual(response.body.received, 1, 'Expected 1 record received');
    assertEqual(response.body.processed, 1, 'Expected 1 record processed');
  });

  test('Ingest batch logs (10 records, uncompressed)', async () => {
    const logs = generateSampleLogs(10);

    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: logs
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assertEqual(response.body.received, 10, 'Expected 10 records received');
    assertEqual(response.body.processed, 10, 'Expected 10 records processed');
  });

  test('Ingest batch logs with gzip compression', async () => {
    const logs = generateSampleLogs(5);

    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: logs,
      compress: true
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assertEqual(response.body.received, 5, 'Expected 5 records received');
    assertEqual(response.body.processed, 5, 'Expected 5 records processed');
  });

  test('Reject invalid log format', async () => {
    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: { invalid: 'format' } // Should be array
    });

    assert(response.status === 400, `Expected 400, got ${response.status}`);
  });

  test('Reject empty log array', async () => {
    const response = await request({
      method: 'POST',
      path: '/logs',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: []
    });

    assert(response.status === 400, `Expected 400, got ${response.status}`);
  });
});

describe('Complete Tests - Website Management', { skip: !isComplete }, () => {
  test('Website auto-created from log ingestion', async () => {
    // Verify test website was created
    const response = await request({
      method: 'GET',
      path: '/websites',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(Array.isArray(response.body.websites), 'Expected websites array');

    const testWebsite = response.body.websites.find(w => w.domain === 'test-example.com');
    assert(testWebsite, 'Expected test-example.com to be auto-created');
  });

  test('Get specific website by domain', async () => {
    const response = await request({
      method: 'GET',
      path: '/websites/test-example.com',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assertEqual(response.body.domain, 'test-example.com', 'Expected correct domain');
    assert(response.body.last_activity_at, 'Expected last_activity_at to be set');
  });

  test('Update website metadata', async () => {
    const response = await request({
      method: 'PUT',
      path: '/websites/test-example.com',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      },
      body: {
        owner_email: 'test@example.com',
        is_dev: true
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assertEqual(response.body.owner_email, 'test@example.com', 'Expected updated email');
    // MySQL returns booleans as 1/0
    assert(
      response.body.is_dev === true || response.body.is_dev === 1,
      'Expected is_dev to be truthy'
    );
  });

  test('List websites with pagination', async () => {
    const response = await request({
      method: 'GET',
      path: '/websites?limit=5&offset=0',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(Array.isArray(response.body.websites), 'Expected websites array');
    assert(response.body.total !== undefined, 'Expected total count');
  });

  test('Delete website (cascade deletes logs)', async () => {
    const response = await request({
      method: 'DELETE',
      path: '/websites/test-example.com',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.body.message.includes('deleted'), 'Expected deletion confirmation');

    // Verify it's gone
    const checkResponse = await request({
      method: 'GET',
      path: '/websites/test-example.com',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(checkResponse.status === 404, 'Expected 404 for deleted website');
  });

  test('404 for non-existent website', async () => {
    const response = await request({
      method: 'GET',
      path: '/websites/non-existent-domain.com',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 404, `Expected 404, got ${response.status}`);
  });
});

describe('Complete Tests - Cleanup', { skip: !isComplete }, () => {
  test('Delete test API key', async () => {
    await deleteApiKey(testApiKey);

    // Verify it no longer works
    const response = await request({
      method: 'GET',
      path: '/websites',
      headers: {
        Authorization: `Bearer ${testApiKey}`
      }
    });

    assert(response.status === 401, 'Expected 401 after key deletion');
  });
});

// Run tests
console.log('\n📊 Test Summary:\n');
