#!/usr/bin/env node
/**
 * Verify that thoughts are actually being pushed during operations
 */

const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', () => resolve({ status: 0, data: null }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('Starting audit-and-heal (will timeout, but should push thoughts)...\n');
  
  // Start audit in background - it WILL timeout but should push thoughts anyway
  makeRequest('POST', '/api/ai/audit-and-heal', {
    url: 'http://dev-proxy/',
    route: '/',
    maxPasses: 1,
    timeout: 5000
  }).then(() => console.log('Audit completed/timed out'));
  
  // Poll for thoughts every 200ms for 10 seconds
  const startTime = Date.now();
  const thoughtLog = [];
  
  while (Date.now() - startTime < 10000) {
    const res = await makeRequest('GET', '/api/ai/thoughts');
    
    if (res.status === 200 && res.data && res.data.events) {
      if (res.data.events.length > 0) {
        res.data.events.forEach(event => {
          const elapsed = Date.now() - startTime;
          console.log(`[${elapsed}ms] ${event.message}`);
          thoughtLog.push({ elapsed, message: event.message, details: event.details });
        });
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Total thoughts captured: ${thoughtLog.length}`);
  
  if (thoughtLog.length === 0) {
    console.log('❌ FAIL: No thoughts were pushed during the operation');
    console.log('\nThis means pushThought() is either:');
    console.log('  1. Not being called');
    console.log('  2. Being called but thoughts are cleared before UI polls');
    console.log('  3. There is a bug in the thoughts queue');
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: Thoughts ARE being pushed!');
    console.log('\nThoughts timeline:');
    thoughtLog.forEach(t => {
      console.log(`  ${t.elapsed}ms: ${t.message}`);
    });
    process.exit(0);
  }
}

test();

