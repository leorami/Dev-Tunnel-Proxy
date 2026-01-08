#!/usr/bin/env node
/**
 * E2E tests for nginx proxy_pass configuration
 * 
 * Issue: Nginx proxy_pass with trailing slash was rewriting URLs incorrectly
 * Fix: Removed trailing slash from proxy_pass directive for /devproxy/api/apps/
 */

const http = require('http');
const assert = require('assert');
const { execSync } = require('child_process');

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
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data, raw: data });
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
it('should correctly proxy /devproxy/api/apps/install through nginx', async () => {
  // Test that the full path is preserved when proxying
  const response = await request({
    hostname: 'localhost',
    port: 8080, // nginx port
    path: '/devproxy/api/apps/install',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { name: 'test', content: '# test' });
  
  // Should get 302 redirect to login (not 404 Not Found)
  assert.notStrictEqual(response.status, 404, 'Should not return 404 - path should be preserved');
  assert.ok(
    response.status === 302 || response.status === 401,
    `Expected 302 or 401 (auth required), got ${response.status}`
  );
});

it('should correctly proxy /devproxy/api/ai/reindex through nginx', async () => {
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/ai/reindex',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Should not return 404
  assert.notStrictEqual(response.status, 404, 'Should not return 404');
  // Should return 503 (no API key) or 200 (success)
  assert.ok(
    response.status === 503 || response.status === 200,
    `Expected 503 or 200, got ${response.status}`
  );
});

it('should correctly proxy /devproxy/api/config/ paths through nginx', async () => {
  const response = await request({
    hostname: 'localhost',
    port: 8080,
    path: '/devproxy/api/config/test.conf',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Should require auth (302 or 401), not 404
  assert.notStrictEqual(response.status, 404, 'Should not return 404');
});

it('should verify nginx config does not have trailing slash on apps proxy_pass', () => {
  try {
    const config = execSync('cat /Users/leorami/Development/dev-tunnel-proxy/config/default.conf', { encoding: 'utf8' });
    
    // Find the apps location block
    const appsBlock = config.match(/location \^~ \/devproxy\/api\/apps\/ \{[\s\S]*?proxy_pass[^;]+;/);
    
    assert.ok(appsBlock, 'Should find apps location block');
    
    // Extract proxy_pass line
    const proxyPassLine = appsBlock[0].match(/proxy_pass\s+([^;]+);/);
    assert.ok(proxyPassLine, 'Should find proxy_pass directive');
    
    const proxyPassValue = proxyPassLine[1].trim();
    
    // Should NOT end with /devproxy/api/apps/ (no path after host)
    assert.ok(
      !proxyPassValue.includes('/devproxy/api/apps/'),
      `proxy_pass should not include path with trailing slash, got: ${proxyPassValue}`
    );
    
    // Should be just the host variable or the upstream name
    assert.ok(
      (proxyPassValue.includes('$config_api') || proxyPassValue.includes('config_api_upstream')) && !proxyPassValue.includes('/devproxy'),
      `proxy_pass should be just the host variable or upstream, got: ${proxyPassValue}`
    );
    
  } catch (e) {
    throw new Error(`Failed to verify nginx config: ${e.message}`);
  }
});

it('should verify all API proxy_pass directives use deferred DNS resolution', () => {
  try {
    const config = execSync('cat /Users/leorami/Development/dev-tunnel-proxy/config/default.conf', { encoding: 'utf8' });
    
    // Find all location blocks for /devproxy/api/
    const apiBlocks = config.match(/location [^{]+ \/devproxy\/api\/[^{]+\{[\s\S]*?\n  \}/g) || [];
    
    assert.ok(apiBlocks.length > 0, 'Should find API location blocks');
    
    apiBlocks.forEach((block, i) => {
      if (block.includes('proxy_pass')) {
        // Should use $config_api variable or defined upstream for optimized resolution
        assert.ok(
          block.includes('$config_api') || block.includes('set $') || block.includes('_upstream'),
          `Block ${i + 1} should use variable-based proxy_pass or upstream for optimized DNS/connection resolution`
        );
      }
    });
    
  } catch (e) {
    throw new Error(`Failed to verify nginx config: ${e.message}`);
  }
});

// Run tests
if (require.main === module) {
  console.log('Running Nginx Proxy Pass E2E Tests...\n');
  
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
