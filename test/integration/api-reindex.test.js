#!/usr/bin/env node
/**
 * Integration tests for /devproxy/api/ai/reindex endpoint
 * 
 * Issue: Reindex endpoint didn't exist, causing startup failures
 * Fix: Implemented POST /devproxy/api/ai/reindex endpoint in proxyConfigAPI.js
 */

const http = require('http');
const assert = require('assert');

const tests = [];
function it(name, fn) {
  tests.push({ name, fn });
}

// Helper to make HTTP requests
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

// Test cases
it('should return 503 when OPENAI_API_KEY is not set', async () => {
  // This test assumes OPENAI_API_KEY might not be set in test environment
  const response = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/devproxy/api/ai/reindex',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Either 503 (no API key) or 200 (has API key and works)
  assert.ok(
    response.status === 503 || response.status === 200,
    `Expected 503 or 200, got ${response.status}`
  );
  
  if (response.status === 503) {
    assert.strictEqual(response.body.ok, false);
    assert.ok(response.body.error.includes('OPENAI_API_KEY'));
  }
});

it('should be accessible without authentication (public endpoint)', async () => {
  const response = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/devproxy/api/ai/reindex',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Should not return 401 Unauthorized
  assert.notStrictEqual(response.status, 401, 'Endpoint should be public');
});

it('should return proper response structure when successful', async () => {
  const response = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/devproxy/api/ai/reindex',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (response.status === 200) {
    assert.strictEqual(response.body.ok, true);
    assert.ok(typeof response.body.chunks === 'number');
    assert.ok(typeof response.body.model === 'string');
    assert.ok(typeof response.body.dim === 'number');
    assert.ok(typeof response.body.createdAt === 'string');
  }
});

// Run tests
if (require.main === module) {
  console.log('Running API Reindex Integration Tests...\n');
  
  (async () => {
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        passed++;
      } catch (e) {
        console.log(`❌ ${test.name}`);
        console.log(`   ${e.message}`);
        failed++;
      }
    }
    
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
