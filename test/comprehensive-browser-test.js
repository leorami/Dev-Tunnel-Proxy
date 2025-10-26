#!/usr/bin/env node
/**
 * Comprehensive Browser Test for Calliope
 * Tests console errors, network errors, and Calliope functionality
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_URL = process.env.TEST_URL || 'http://localhost:8080';
const TEST_DURATION = parseInt(process.env.TEST_DURATION || '15000', 10); // 15 seconds default

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(title, 'cyan');
  log('='.repeat(70), 'cyan');
}

async function runComprehensiveTest() {
  section(`Testing ${TEST_URL} - Comprehensive Browser Test`);
  log(`Test duration: ${TEST_DURATION}ms`, 'blue');
  
  const results = {
    consoleErrors: [],
    consoleWarnings: [],
    networkErrors: [],
    failedRequests: [],
    successfulRequests: [],
    apiEndpoints: {},
    calliopeStatus: {
      health: null,
      thoughts: null,
      selfCheck: null,
      auditAndHeal: null
    }
  };
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set up comprehensive console monitoring
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      
      if (type === 'error') {
        results.consoleErrors.push({ 
          type, 
          text, 
          url: location.url,
          lineNumber: location.lineNumber,
          columnNumber: location.columnNumber
        });
        log(`  ❌ Console Error: ${text}`, 'red');
      } else if (type === 'warning') {
        results.consoleWarnings.push({ type, text });
      }
    });
    
    // Monitor all requests
    page.on('request', request => {
      const url = request.url();
      
      // Track API endpoints
      if (url.includes('/api/ai/')) {
        const endpoint = url.split('/api/ai/')[1].split('?')[0];
        if (!results.apiEndpoints[endpoint]) {
          results.apiEndpoints[endpoint] = { attempts: 0, successes: 0, failures: 0 };
        }
        results.apiEndpoints[endpoint].attempts++;
      }
    });
    
    // Monitor request failures
    page.on('requestfailed', request => {
      const failure = request.failure();
      const url = request.url();
      const method = request.method();
      const errorText = failure ? failure.errorText : 'Unknown error';
      
      results.failedRequests.push({
        url,
        method,
        errorText
      });
      
      // Update API endpoint stats
      if (url.includes('/api/ai/')) {
        const endpoint = url.split('/api/ai/')[1].split('?')[0];
        if (results.apiEndpoints[endpoint]) {
          results.apiEndpoints[endpoint].failures++;
        }
      }
      
      log(`  ❌ Request Failed: ${method} ${url}`, 'red');
      log(`     Error: ${errorText}`, 'yellow');
      
      // Check for specific error patterns
      if (errorText.includes('ERR_NETWORK_CHANGED')) {
        log(`     ⚠️  ERR_NETWORK_CHANGED detected!`, 'magenta');
      }
      if (errorText.includes('CORS')) {
        log(`     ⚠️  CORS error detected!`, 'magenta');
      }
      if (errorText.includes('timeout') || errorText.includes('TIMED_OUT')) {
        log(`     ⚠️  Timeout detected!`, 'magenta');
      }
      if (errorText.includes('CONNECTION_REFUSED')) {
        log(`     ⚠️  Connection refused!`, 'magenta');
      }
    });
    
    // Monitor successful responses
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      
      if (url.includes('/api/ai/')) {
        const endpoint = url.split('/api/ai/')[1].split('?')[0];
        if (results.apiEndpoints[endpoint] && status >= 200 && status < 300) {
          results.apiEndpoints[endpoint].successes++;
        }
      }
      
      results.successfulRequests.push({
        url,
        status,
        statusText: response.statusText()
      });
    });
    
    // Monitor page errors
    page.on('pageerror', error => {
      results.networkErrors.push({ 
        message: error.message, 
        stack: error.stack 
      });
      log(`  ❌ Page Error: ${error.message}`, 'red');
    });
    
    log('\n📱 Loading page...', 'blue');
    await page.goto(`${TEST_URL}/status`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    const title = await page.title();
    log(`  ✓ Page loaded: ${title}`, 'green');
    
    // Check if routes.json and status.json loaded
    log('\n📊 Checking core JSON files...', 'blue');
    const routesJsonLoaded = results.successfulRequests.some(r => 
      r.url.includes('routes.json') && r.status === 200
    );
    const statusJsonLoaded = results.successfulRequests.some(r => 
      r.url.includes('status.json') && r.status === 200
    );
    
    if (routesJsonLoaded) {
      log('  ✓ routes.json loaded successfully', 'green');
    } else {
      log('  ✗ routes.json failed to load', 'red');
    }
    
    if (statusJsonLoaded) {
      log('  ✓ status.json loaded successfully', 'green');
    } else {
      log('  ✗ status.json failed to load', 'red');
    }
    
    // Wait and monitor polling
    log(`\n⏰ Monitoring for ${TEST_DURATION}ms to capture polling errors...`, 'blue');
    await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
    
    // Try to get Calliope's current state from the page
    log('\n🤖 Checking Calliope status from page...', 'blue');
    try {
      const calliopeState = await page.evaluate(() => {
        // Try to access window.calliopeHealth if it exists
        if (typeof window.calliopeHealth !== 'undefined') {
          return {
            health: window.calliopeHealth,
            hasCalliopeData: true
          };
        }
        return { hasCalliopeData: false };
      });
      
      if (calliopeState.hasCalliopeData) {
        log('  ✓ Calliope data found on page', 'green');
        results.calliopeStatus.health = calliopeState.health;
      } else {
        log('  ⚠️  No Calliope data found on page', 'yellow');
      }
    } catch (error) {
      log(`  ⚠️  Could not access Calliope state: ${error.message}`, 'yellow');
    }
    
    await browser.close();
    
    return results;
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   COMPREHENSIVE BROWSER TEST FOR CALLIOPE                         ║', 'cyan');
  log('║   Monitoring console errors, network issues, and API polling      ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  try {
    const results = await runComprehensiveTest();
    
    // Generate comprehensive report
    section('TEST RESULTS SUMMARY');
    
    log(`\n📊 Overall Statistics:`, 'blue');
    log(`  Total Requests: ${results.successfulRequests.length}`, 'blue');
    log(`  Failed Requests: ${results.failedRequests.length}`, results.failedRequests.length > 0 ? 'red' : 'green');
    log(`  Console Errors: ${results.consoleErrors.length}`, results.consoleErrors.length > 0 ? 'red' : 'green');
    log(`  Console Warnings: ${results.consoleWarnings.length}`, 'yellow');
    log(`  Page Errors: ${results.networkErrors.length}`, results.networkErrors.length > 0 ? 'red' : 'green');
    
    // API Endpoint Summary
    if (Object.keys(results.apiEndpoints).length > 0) {
      log(`\n🔌 API Endpoint Summary:`, 'blue');
      Object.entries(results.apiEndpoints).forEach(([endpoint, stats]) => {
        const successRate = stats.attempts > 0 
          ? ((stats.successes / stats.attempts) * 100).toFixed(1) 
          : 0;
        const color = successRate >= 90 ? 'green' : successRate >= 50 ? 'yellow' : 'red';
        log(`  /${endpoint}:`, 'blue');
        log(`    Attempts: ${stats.attempts}, Successes: ${stats.successes}, Failures: ${stats.failures}`, color);
        log(`    Success Rate: ${successRate}%`, color);
      });
    }
    
    // Detailed Error Analysis
    if (results.consoleErrors.length > 0) {
      log(`\n❌ Console Errors (${results.consoleErrors.length}):`, 'red');
      results.consoleErrors.slice(0, 10).forEach((err, i) => {
        log(`  ${i + 1}. ${err.text}`, 'red');
        if (err.url && err.url !== 'undefined') {
          log(`     at ${err.url}:${err.lineNumber}`, 'yellow');
        }
      });
      if (results.consoleErrors.length > 10) {
        log(`  ... and ${results.consoleErrors.length - 10} more`, 'yellow');
      }
    }
    
    if (results.failedRequests.length > 0) {
      log(`\n❌ Failed Requests (${results.failedRequests.length}):`, 'red');
      results.failedRequests.slice(0, 10).forEach((req, i) => {
        log(`  ${i + 1}. ${req.method} ${req.url}`, 'red');
        log(`     Error: ${req.errorText}`, 'yellow');
      });
      if (results.failedRequests.length > 10) {
        log(`  ... and ${results.failedRequests.length - 10} more`, 'yellow');
      }
    }
    
    // Save detailed results
    const resultsPath = path.join(__dirname, '../.artifacts/browser-test-results.json');
    fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log(`\n💾 Detailed results saved to: ${resultsPath}`, 'blue');
    
    // Final verdict
    log('\n');
    const hasErrors = results.consoleErrors.length > 0 || 
                     results.failedRequests.length > 0 || 
                     results.networkErrors.length > 0;
    
    if (hasErrors) {
      log('❌ TEST FAILED - Errors detected!', 'red');
      process.exit(1);
    } else {
      log('✅ TEST PASSED - No errors detected!', 'green');
      process.exit(0);
    }
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runComprehensiveTest };

