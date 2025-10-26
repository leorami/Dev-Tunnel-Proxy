#!/usr/bin/env node
/**
 * Test: Site Auditor Functionality
 * 
 * Verifies that the site auditor can successfully audit pages through dev-proxy
 * Tests both simple routes (/) and complex routes (/lyra)
 */

const { runSiteAuditor } = require('../utils/calliopeHealing');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function pass(msg) {
  console.log(`${GREEN}✅ PASS${RESET}: ${msg}`);
}

function fail(msg) {
  console.log(`${RED}❌ FAIL${RESET}: ${msg}`);
}

async function testSimpleRoute() {
  console.log('\n' + BOLD + 'Test 1: Audit Simple Route (/)' + RESET);
  
  try {
    const result = await runSiteAuditor('http://dev-proxy/', {
      timeout: 15000,
      wait: 500
    });
    
    if (!result.ok) {
      fail('Auditor failed to complete');
      console.log('  Error:', result.error || 'Unknown');
      return false;
    }
    
    if (!result.summary) {
      fail('No summary returned');
      return false;
    }
    
    pass('Auditor completed successfully');
    console.log('  Console Errors:', result.summary.consoleErrors);
    console.log('  Network Failures:', result.summary.networkFailures);
    console.log('  HTTP Issues:', result.summary.httpIssues);
    
    // Root page should be clean (no errors expected)
    if (result.summary.consoleErrors === 0 && result.summary.networkFailures === 0) {
      pass('Root page is clean (no console errors or network failures)');
    }
    
    return true;
  } catch (error) {
    fail(`Exception thrown: ${error.message}`);
    return false;
  }
}

async function testComplexRoute() {
  console.log('\n' + BOLD + 'Test 2: Audit Complex Route (/lyra)' + RESET);
  
  try {
    const result = await runSiteAuditor('http://dev-proxy/lyra', {
      timeout: 20000,
      wait: 1000
    });
    
    if (!result.ok) {
      fail('Auditor failed to complete');
      console.log('  Error:', result.error || 'Unknown');
      return false;
    }
    
    if (!result.summary) {
      fail('No summary returned');
      return false;
    }
    
    pass('Auditor completed successfully');
    console.log('  Console Errors:', result.summary.consoleErrors);
    console.log('  Network Failures:', result.summary.networkFailures);
    console.log('  HTTP Issues:', result.summary.httpIssues);
    
    // /lyra is expected to have some issues (Next.js auth config)
    if (result.summary.consoleErrors > 0 || result.summary.httpIssues > 0) {
      pass('Detected issues in /lyra route (expected due to Next.js auth config)');
    }
    
    return true;
  } catch (error) {
    fail(`Exception thrown: ${error.message}`);
    return false;
  }
}

async function testReasonableTimeout() {
  console.log('\n' + BOLD + 'Test 3: Audit Completes in Reasonable Time' + RESET);
  
  try {
    const startTime = Date.now();
    const result = await runSiteAuditor('http://dev-proxy/', {
      timeout: 10000,
      wait: 500
    });
    const elapsed = Date.now() - startTime;
    
    if (!result.ok) {
      fail('Auditor failed');
      return false;
    }
    
    console.log(`  Completed in ${elapsed}ms`);
    
    if (elapsed < 30000) {
      pass('Audit completed in reasonable time (< 30 seconds)');
      return true;
    } else {
      fail(`Audit took too long: ${elapsed}ms`);
      return false;
    }
  } catch (error) {
    fail(`Exception thrown: ${error.message}`);
    return false;
  }
}

async function testReportGenerated() {
  console.log('\n' + BOLD + 'Test 4: Audit Report Generated' + RESET);
  
  try {
    const result = await runSiteAuditor('http://dev-proxy/', {
      timeout: 15000,
      wait: 500
    });
    
    if (!result.ok) {
      fail('Auditor failed');
      return false;
    }
    
    if (!result.reportPath) {
      fail('No report path returned');
      return false;
    }
    
    pass('Report path generated');
    console.log('  Path:', result.reportPath);
    
    // Check if report file exists
    const fs = require('fs');
    if (fs.existsSync(result.reportPath)) {
      pass('Report file exists on disk');
      
      // Verify report is valid JSON with expected structure
      const report = JSON.parse(fs.readFileSync(result.reportPath, 'utf8'));
      if (report.console && report.network && report.viewports) {
        pass('Report has expected structure (console, network, viewports)');
        return true;
      } else {
        fail('Report missing expected fields');
        return false;
      }
    } else {
      fail('Report file not found on disk');
      return false;
    }
  } catch (error) {
    fail(`Exception thrown: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(BOLD + '\n🔍 Site Auditor Test Suite\n' + RESET);
  console.log('Testing that Puppeteer-based auditor can successfully audit pages');
  console.log('through the dev-tunnel-proxy...\n');
  
  const results = [];
  
  results.push(await testSimpleRoute());
  results.push(await testComplexRoute());
  results.push(await testReasonableTimeout());
  results.push(await testReportGenerated());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('\n' + BOLD + '═'.repeat(60) + RESET);
  console.log(BOLD + `Results: ${passed}/${total} tests passed` + RESET);
  console.log(BOLD + '═'.repeat(60) + RESET + '\n');
  
  if (passed === total) {
    console.log(GREEN + BOLD + '🎉 ALL TESTS PASSED!' + RESET);
    process.exit(0);
  } else {
    console.log(RED + BOLD + `❌ ${total - passed} test(s) failed` + RESET);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(RED + BOLD + '\n💥 TEST SUITE CRASHED' + RESET);
  console.error(err);
  process.exit(1);
});

