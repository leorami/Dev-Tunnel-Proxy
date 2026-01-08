#!/usr/bin/env node
/**
 * Iterative Test Runner with :fast-10 support
 * 
 * Runs all unit, integration, and e2e tests.
 * Stops after 10 failures if :fast-10 is enabled.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const FAST_MODE = process.argv.includes(':fast-10');
const MAX_FAILURES = 10;

let totalPassed = 0;
let totalFailed = 0;
let failedTests = [];

function runTest(testFile, testName) {
  if (FAST_MODE && totalFailed >= MAX_FAILURES) {
    return;
  }

  console.log(`\n\x1b[33m▶ Running: ${testName}\x1b[0m (${testFile})`);
  
  try {
    let cmd;
    
    if (testFile.endsWith('.spec.ts') || testFile.endsWith('.spec.js') || testFile.includes('test/ui/')) {
      // For Playwright tests, we MUST run from the test/ui directory where the config is
      const uiDir = path.join(ROOT_DIR, 'test', 'ui');
      const relativeTestPath = path.relative(uiDir, path.join(ROOT_DIR, testFile));
      cmd = `cd "${uiDir}" && npx playwright test "${relativeTestPath}"`;
    } else if (testFile.endsWith('.sh')) {
      cmd = `bash "${path.join(ROOT_DIR, testFile)}"`;
    } else {
      cmd = `node "${path.join(ROOT_DIR, testFile)}"`;
    }

    execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
    
    console.log(`\x1b[32m✓ PASSED: ${testName}\x1b[0m`);
    totalPassed++;
  } catch (error) {
    console.log(`\x1b[31m✗ FAILED: ${testName}\x1b[0m`);
    totalFailed++;
    failedTests.push({ name: testName, file: testFile });
    
    if (FAST_MODE && totalFailed >= MAX_FAILURES) {
      console.log(`\n\x1b[1;31m🛑 STOPPING: Reached ${MAX_FAILURES} failures (:fast-10 mode active)\x1b[0m`);
    }
  }
}

async function main() {
  console.log('\x1b[1;35m🧪 Dev Tunnel Proxy - Iterative Test Suite\x1b[0m');
  console.log('==========================================');
  if (FAST_MODE) console.log(`\x1b[36m⚡ :fast-10 mode enabled (stopping at ${MAX_FAILURES} failures)\x1b[0m`);
  
  // 1. Unit Tests
  console.log('\n\x1b[1m📦 Unit Tests\x1b[0m');
  runTest('test/unit/route-promotion-filtering.test.js', 'Route Promotion Child Filtering');
  runTest('test/collect-docs.test.js', 'Collect Docs Logic');
  runTest('test/status-model.js', 'Status Model Logic');
  
  // 2. Integration Tests
  console.log('\n\x1b[1m🔗 Integration Tests\x1b[0m');
  runTest('test/integration/api-reindex.test.js', 'API Reindex');
  runTest('test/integration/api-apps-install.test.js', 'API Apps Install');
  runTest('test/calliope-embeddings-integration.test.js', 'Calliope Embeddings');
  runTest('test/status-chip-mechanism-test.js', 'Status Chip Mechanism');
  
  // 3. UI/E2E Tests
  console.log('\n\x1b[1m🌐 UI/E2E Tests\x1b[0m');
  runTest('test/e2e/nginx-proxy-pass.test.js', 'Nginx Proxy Pass Config');
  runTest('test/ui/tests/dashboard-dropdown.spec.ts', 'Dashboard Dropdown UI');
  runTest('test/ui/tests/status.spec.ts', 'Status Dashboard UI');
  runTest('test/ui/tests/calliope-toggle.spec.ts', 'Calliope Toggle UI');
  runTest('test/calliope-simple-test.js', 'Calliope Simple E2E');
  runTest('test/site-auditor-test.js', 'Site Auditor');
  runTest('test/browser-console-test.js', 'Browser Console Errors');
  runTest('test/mixed-content-test.js', 'Mixed Content Detection');

  // Summary
  console.log('\n==========================================');
  console.log('\x1b[1mTest Summary\x1b[0m');
  console.log('==========================================');
  console.log(`\x1b[32mPassed: ${totalPassed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${totalFailed}\x1b[0m`);
  
  if (failedTests.length > 0) {
    console.log('\n\x1b[31mFailed Tests:\x1b[0m');
    failedTests.forEach(t => console.log(` - ${t.name} (${t.file})`));
  }

  if (totalFailed === 0) {
    console.log('\n\x1b[1;32m🎉 ALL GREEN!\x1b[0m');
    process.exit(0);
  } else {
    console.log(`\n\x1b[1;31m❌ ${totalFailed} tests failed. Fix them and run again.\x1b[0m`);
    process.exit(1);
  }
}

main();
