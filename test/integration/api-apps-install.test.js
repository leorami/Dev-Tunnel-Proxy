#!/usr/bin/env node
/**
 * Integration tests for /devproxy/api/apps/install endpoint
 * 
 * Issue: Apps were failing to install configs with 500/404 errors
 * Fixes: 
 * 1. Endpoint existed but had wrong indentation
 * 2. Nginx proxy_pass had trailing slash causing URL rewriting issues
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
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

// Helper to login and get session cookie
async function login() {
  const password = process.env.ADMIN_PASSWORD || 'M7hRJqybcn1FWFMxZNbF-2nXLVLWoUweB2AxBBXPWXkKDw44NLDEwLr3YItN801C';
  
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { password });
  
  const cookie = response.headers['set-cookie']?.[0]?.split(';')[0];
  return cookie;
}

// Test cases
it('should require authentication', async () => {
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { name: 'test', content: '# test' });
  
  // Should redirect to login (302) or return unauthorized
  assert.ok(
    response.status === 302 || response.status === 401,
    `Expected 302 or 401, got ${response.status}`
  );
});

it('should install a valid config file', async () => {
  const cookie = await login();
  
  const testConfig = `# test-integration-${Date.now()}
location /test-integration/ {
  proxy_pass http://test-integration:3000/;
}`;
  
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    }
  }, {
    name: `test-integration-${Date.now()}`,
    content: testConfig
  });
  
  assert.strictEqual(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(response.body)}`);
  assert.strictEqual(response.body.ok, true);
  assert.ok(response.body.installed);
});

it('should reject invalid app names', async () => {
  const cookie = await login();
  
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    }
  }, {
    name: '../../../etc/passwd',
    content: '# malicious'
  });
  
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.ok, false);
});

it('should reject missing name or content', async () => {
  const cookie = await login();
  
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    }
  }, {
    name: 'test'
    // missing content
  });
  
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.ok, false);
});

it('should reject invalid nginx config', async () => {
  const cookie = await login();
  
  const invalidConfig = `# invalid nginx config
location /test/ {
  invalid_directive_that_does_not_exist;
}`;
  
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    }
  }, {
    name: `test-invalid-${Date.now()}`,
    content: invalidConfig
  });
  
  // Should fail nginx test
  assert.strictEqual(response.status, 422);
  assert.strictEqual(response.body.ok, false);
  assert.ok(response.body.error.includes('nginx_test_failed'));
});

// Run tests
if (require.main === module) {
  console.log('Running API Apps Install Integration Tests...\n');
  
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
        if (e.stack) console.log(`   ${e.stack.split('\n')[1]}`);
        failed++;
      }
    }
    
    // Clean up test configs
    try {
      const { execSync } = require('child_process');
      execSync('rm -f /Users/leorami/Development/dev-tunnel-proxy/apps/test-*.conf', { stdio: 'ignore' });
      execSync('cd /Users/leorami/Development/dev-tunnel-proxy && node utils/generateAppsBundle.js', { stdio: 'ignore' });
      execSync('docker exec dev-proxy nginx -s reload', { stdio: 'ignore' });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}
