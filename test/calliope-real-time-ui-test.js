#!/usr/bin/env node
/**
 * Test Calliope's real-time UI updates
 * - Status chip changes during work
 * - Thinking bubbles appear progressively
 * - Messages not buffered until the end
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';

function makeRequest(method, path, body = null, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      timeout
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

    req.on('error', (err) => {
      // Don't reject on timeout - return what we have
      resolve({ status: 0, data: null, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, data: null, error: 'timeout' });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function pollThoughts(duration = 5000, interval = 500) {
  const thoughts = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < duration) {
    const res = await makeRequest('GET', '/api/ai/thoughts');
    if (res.status === 200 && Array.isArray(res.data)) {
      thoughts.push(...res.data.map(t => ({ ...t, polledAt: Date.now() })));
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return thoughts;
}

async function test1_AuditAndHealShowsRealTimeThoughts() {
  console.log('\n=== TEST 1: Audit-and-Heal Shows Real-Time Thoughts ===');
  
  // Start audit-and-heal in background (with 60s timeout)
  const auditPromise = makeRequest('POST', '/api/ai/audit-and-heal', {
    url: 'http://dev-proxy/lyra',
    route: '/lyra',
    maxPasses: 1,
    timeout: 10000
  }, 60000);
  
  // Poll for thoughts during the work
  const thoughts = await pollThoughts(15000, 300);
  
  // Wait for audit to complete (don't fail if it times out)
  const auditResult = await auditPromise;
  
  console.log(`\n📊 Results:`);
  console.log(`  - Total thoughts captured: ${thoughts.length}`);
  console.log(`  - Audit status: ${auditResult.status}`);
  
  // Verify we got thoughts DURING the work, not just at the end
  if (thoughts.length === 0) {
    console.log('❌ FAIL: No thoughts captured during audit');
    return false;
  }
  
  // Check for expected thought patterns
  const hasStartThought = thoughts.some(t => 
    t.message && /Taking a peek|Starting audit|Auditing pass/.test(t.message)
  );
  const hasProgressThought = thoughts.some(t => 
    t.message && /pass \d+|Working|healing|complete/i.test(t.message)
  );
  
  console.log(`\n✅ Thoughts found:`);
  thoughts.slice(0, 5).forEach(t => {
    console.log(`  - [${new Date(t.ts).toISOString()}] ${t.message}`);
  });
  
  if (!hasStartThought) {
    console.log('\n❌ FAIL: No start thought found');
    return false;
  }
  
  if (!hasProgressThought) {
    console.log('\n❌ FAIL: No progress thoughts found');
    return false;
  }
  
  // Verify thoughts appeared progressively (not all at once)
  const timestamps = thoughts.map(t => t.polledAt);
  const timeSpread = Math.max(...timestamps) - Math.min(...timestamps);
  
  if (timeSpread < 1000) {
    console.log(`\n⚠️  WARNING: All thoughts appeared within ${timeSpread}ms (may be buffered)`);
  } else {
    console.log(`\n✅ PASS: Thoughts spread over ${timeSpread}ms (real-time)`);
  }
  
  return hasStartThought && hasProgressThought;
}

async function test2_StatusChipUpdates() {
  console.log('\n=== TEST 2: Status Chip Updates During Work ===');
  
  const statusHistory = [];
  
  // Start audit-and-heal
  const auditPromise = makeRequest('POST', '/api/ai/audit-and-heal', {
    url: 'http://dev-proxy/lyra',
    route: '/lyra',
    maxPasses: 1,
    timeout: 10000
  });
  
  // Poll for status chip changes
  const startTime = Date.now();
  while (Date.now() - startTime < 12000) {
    const res = await makeRequest('GET', '/api/ai/health');
    if (res.status === 200 && res.data.status) {
      statusHistory.push({ 
        status: res.data.status, 
        time: Date.now() - startTime 
      });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  await auditPromise;
  
  // Deduplicate consecutive same statuses
  const uniqueStatuses = statusHistory.filter((s, i, arr) => 
    i === 0 || s.status !== arr[i-1].status
  );
  
  console.log(`\n📊 Status Changes:`);
  uniqueStatuses.forEach(s => {
    console.log(`  - ${s.time}ms: "${s.status}"`);
  });
  
  const hadAuditingStatus = uniqueStatuses.some(s => s.status === 'Auditing');
  const hadHealingStatus = uniqueStatuses.some(s => s.status === 'Healing');
  const hadHappyStatus = uniqueStatuses.some(s => s.status === 'Happy');
  
  if (hadAuditingStatus) {
    console.log('\n✅ Status chip changed to "Auditing"');
  } else {
    console.log('\n❌ FAIL: Status chip never changed to "Auditing"');
  }
  
  if (hadHappyStatus) {
    console.log('✅ Status chip returned to "Happy"');
  }
  
  return hadAuditingStatus || hadHealingStatus;
}

async function test3_AppLevelDiagnosisDetection() {
  console.log('\n=== TEST 3: App-Level Diagnosis (Next.js Auth) ===');
  
  // Simulate asking about auth errors
  const query = `
/lyra has errors. Here's what I see:

[next-auth][error][CLIENT_FETCH_ERROR]
Unexpected token '<', "<!DOCTYPE "... is not valid JSON

POST https://ramileo.ngrok.app/api/auth/_log 500 (Internal Server Error)
  `;
  
  const res = await makeRequest('POST', '/api/ai/ask', { query });
  
  if (res.status !== 200) {
    console.log(`❌ FAIL: API returned ${res.status}`);
    return false;
  }
  
  const answer = res.data.answer || '';
  
  console.log(`\n📝 Calliope's Response (first 500 chars):`);
  console.log(answer.substring(0, 500));
  
  // Check for app-level diagnosis indicators
  const mentionsAppLevel = /app-level|app level|configuration|config/i.test(answer);
  const mentionsNextAuth = /next-auth|nextauth/i.test(answer);
  const providesCode = /```typescript|```bash|basePath|NEXTAUTH_URL/i.test(answer);
  const offersHelp = /paste.*config|review.*config|help identify/i.test(answer);
  
  console.log(`\n✅ Checks:`);
  console.log(`  - Mentions app-level issue: ${mentionsAppLevel ? '✅' : '❌'}`);
  console.log(`  - Mentions next-auth: ${mentionsNextAuth ? '✅' : '❌'}`);
  console.log(`  - Provides code examples: ${providesCode ? '✅' : '❌'}`);
  console.log(`  - Offers to review config: ${offersHelp ? '✅' : '❌'}`);
  
  if (!mentionsAppLevel) {
    console.log('\n❌ FAIL: Did not identify as app-level issue');
    return false;
  }
  
  if (!providesCode) {
    console.log('\n❌ FAIL: Did not provide code examples');
    return false;
  }
  
  console.log('\n✅ PASS: Correctly diagnosed and provided recommendations');
  return true;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Calliope Real-Time UI & Diagnosis Tests                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const results = {
    test1: false,
    test2: false,
    test3: false
  };
  
  try {
    // Test 1: Real-time thoughts
    results.test1 = await test1_AuditAndHealShowsRealTimeThoughts();
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Status chip updates
    results.test2 = await test2_StatusChipUpdates();
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: App-level diagnosis
    results.test3 = await test3_AppLevelDiagnosisDetection();
    
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    process.exit(1);
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nTest 1 (Real-Time Thoughts): ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 2 (Status Chip Updates): ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 3 (App-Level Diagnosis): ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

main();

