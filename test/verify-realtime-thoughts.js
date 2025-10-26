#!/usr/bin/env node
/**
 * Verify thoughts appear in REAL-TIME (progressively), not all at once
 */

const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      timeout: 120000 // 2 minute timeout
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
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, data: null });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('🧪 Testing Real-Time Thought Updates\n');
  console.log('Starting audit (will timeout after 10s but should show progress)...\n');
  
  // Start audit with short timeout so it completes faster
  makeRequest('POST', '/api/ai/audit-and-heal', {
    url: 'http://dev-proxy/',
    route: '/',
    maxPasses: 1,
    timeout: 10000 // 10 second timeout so it fails faster
  }).then(res => {
    if (res.status === 202) {
      console.log(`\n✅ Got 202 response (started in background)`);
    }
  });
  
  // Poll for thoughts every 200ms for up to 20 seconds
  const startTime = Date.now();
  const thoughtLog = [];
  let lastPollTime = startTime;
  
  console.log('📊 Polling for thoughts every 200ms...\n');
  
  while (Date.now() - startTime < 20000) {
    const res = await makeRequest('GET', '/api/ai/thoughts');
    
    if (res.status === 200 && res.data && res.data.events) {
      if (res.data.events.length > 0) {
        const pollElapsed = Date.now() - startTime;
        res.data.events.forEach(event => {
          console.log(`[${pollElapsed}ms] ${event.message}`);
          thoughtLog.push({ elapsed: pollElapsed, message: event.message });
        });
      }
    }
    
    lastPollTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  const totalTime = Date.now() - startTime;
  
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Test Duration: ${totalTime}ms`);
  console.log(`Total thoughts captured: ${thoughtLog.length}`);
  
  if (thoughtLog.length === 0) {
    console.log('\n❌ FAIL: No thoughts were pushed');
    process.exit(1);
  }
  
  // Check if thoughts appeared progressively (not all at once)
  const timestamps = thoughtLog.map(t => t.elapsed);
  const timeSpread = Math.max(...timestamps) - Math.min(...timestamps);
  
  console.log(`Time spread: ${timeSpread}ms`);
  
  if (timeSpread < 500) {
    console.log('\n❌ FAIL: All thoughts appeared within 500ms (not real-time)');
    console.log('They should spread out over several seconds as work progresses.');
    process.exit(1);
  }
  
  // Check if thoughts appeared in first 5 seconds (not delayed until end)
  const earlyThoughts = thoughtLog.filter(t => t.elapsed < 5000);
  
  console.log(`\nThoughts in first 5 seconds: ${earlyThoughts.length}/${thoughtLog.length}`);
  
  if (earlyThoughts.length === 0) {
    console.log('\n❌ FAIL: No thoughts appeared in first 5 seconds');
    console.log('Users should see progress immediately, not wait until the end.');
    process.exit(1);
  }
  
  console.log('\n✅ SUCCESS: Thoughts appeared progressively in real-time!');
  console.log('\nFirst few thoughts:');
  thoughtLog.slice(0, 5).forEach(t => {
    console.log(`  ${t.elapsed}ms: ${t.message}`);
  });
  
  process.exit(0);
}

test();

