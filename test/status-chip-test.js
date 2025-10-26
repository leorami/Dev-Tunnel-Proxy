#!/usr/bin/env node
/**
 * Test status chip updates during operations
 * Verifies that the status chip changes from idle to working states
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
      timeout: 10000
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
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Status Chip Update Test                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Get initial status
  console.log('1. Getting initial status (should be idle)...');
  const initial = await makeRequest('GET', '/api/ai/health');
  
  if (!initial.data || initial.status !== 200) {
    console.log('   ❌ FAIL: Could not get health status');
    console.log(`   Status: ${initial.status}, Data: ${JSON.stringify(initial.data)}`);
    process.exit(1);
  }
  
  console.log(`   Activity: "${initial.data.activity}" (expected: "")`);
  
  if (initial.data.activity !== "" && initial.data.activity !== "auditing" && initial.data.activity !== "healing") {
    console.log(`   ⚠️  WARNING: Unexpected initial activity: ${initial.data.activity}`);
  }
  
  console.log('');
  console.log('2. Starting audit operation...');
  const startTime = Date.now();
  
  // Start operation
  const auditRes = await makeRequest('POST', '/api/ai/audit-and-heal', {
    url: 'http://dev-proxy/',
    route: '/',
    maxPasses: 1,
    timeout: 5000
  });
  
  if (auditRes.status !== 202) {
    console.log(`   ❌ FAIL: Expected 202, got ${auditRes.status}`);
    process.exit(1);
  }
  
  console.log(`   ✅ Operation started (got 202 response)`);
  console.log('');
  
  // Poll for status changes
  console.log('3. Polling for status chip changes...');
  const statusHistory = [];
  const pollDuration = 8000; // 8 seconds
  
  while (Date.now() - startTime < pollDuration) {
    const res = await makeRequest('GET', '/api/ai/health');
    if (res.status === 200 && res.data.activity !== undefined) {
      const elapsed = Date.now() - startTime;
      const activity = res.data.activity || "(idle)";
      
      // Only log when status changes
      if (statusHistory.length === 0 || statusHistory[statusHistory.length - 1].activity !== activity) {
        console.log(`   [${elapsed}ms] Status: ${activity}`);
        statusHistory.push({ activity, elapsed });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log(`Total status changes: ${statusHistory.length}`);
  console.log('');
  
  if (statusHistory.length === 0) {
    console.log('❌ FAIL: No status changes detected');
    console.log('');
    console.log('The status chip should change during operations:');
    console.log('  - idle → auditing → idle');
    console.log('  - idle → healing → idle');
    process.exit(1);
  }
  
  console.log('Status timeline:');
  statusHistory.forEach(s => {
    console.log(`  ${s.elapsed}ms: ${s.activity}`);
  });
  console.log('');
  
  // Check for expected patterns
  const hadAuditing = statusHistory.some(s => s.activity === 'auditing');
  const hadHealing = statusHistory.some(s => s.activity === 'healing');
  const hadIdle = statusHistory.some(s => s.activity === '(idle)');
  
  console.log('Pattern checks:');
  console.log(`  - Status changed to "auditing": ${hadAuditing ? '✅' : '❌'}`);
  console.log(`  - Status changed to "healing": ${hadHealing ? '✅' : '⚠️  (optional)'}`);
  console.log(`  - Status returned to idle: ${hadIdle ? '✅' : '⚠️  (may still be working)'}`);
  console.log('');
  
  if (!hadAuditing) {
    console.log('❌ FAIL: Status chip never changed to "auditing"');
    console.log('');
    console.log('Expected behavior:');
    console.log('  1. audit-and-heal starts');
    console.log('  2. pushStatusChip("Auditing") is called');
    console.log('  3. /api/ai/health returns activity: "auditing"');
    console.log('  4. UI shows "Auditing" status chip');
    process.exit(1);
  }
  
  if (statusHistory.length >= 2) {
    console.log('✅ PASS: Status chip updates are working!');
    console.log('');
    console.log('Status chip changed at least once during the operation,');
    console.log('indicating real-time updates are functioning correctly.');
  } else {
    console.log('⚠️  WARNING: Only 1 status captured - may need more polling time');
  }
  
  process.exit(0);
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

