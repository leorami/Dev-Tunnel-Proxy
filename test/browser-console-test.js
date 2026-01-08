#!/usr/bin/env node
/**
 * Real Browser Console Error Test
 * Uses Puppeteer to actually load the page in a browser and capture console errors
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Test configuration
const NGROK_URL = 'https://ramileo.ngrok.app';
const LOCAL_URL = 'http://localhost:8080';

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

async function testWithPuppeteer(url) {
  section(`Testing ${url} with Real Browser (Puppeteer)`);
  
  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];
  const requestsFailed = [];
  
  // Create a script to run Puppeteer
  const testScript = `
const puppeteer = require('puppeteer');

(async () => {
  const consoleErrors = [];
  const consoleWarnings = [];
  const networkErrors = [];
  const requestsFailed = [];
  
  const browser = await puppeteer.launch({
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
  
  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    
    if (type === 'error') {
      const loc = msg.location();
      const url = loc ? loc.url : '';
      // Ignore 401 Unauthorized for /admin/check which is expected during initial load
      if (text.includes('401') && (text.includes('/admin/check') || url.includes('/admin/check'))) {
        return;
      }
      consoleErrors.push({ type, text, location: loc });
    } else if (type === 'warning') {
      consoleWarnings.push({ type, text });
    }
  });
  
  // Capture network errors
  page.on('requestfailed', request => {
    const failure = request.failure();
    requestsFailed.push({
      url: request.url(),
      method: request.method(),
      errorText: failure ? failure.errorText : 'Unknown error'
    });
  });
  
  // Capture page errors
  page.on('pageerror', error => {
    networkErrors.push({ message: error.message, stack: error.stack });
  });
  
  try {
    // Navigate to the status page
    await page.goto('${url}/status', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait a bit for polling to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Get the page title to confirm it loaded
    const title = await page.title();
    
    console.log(JSON.stringify({
      success: true,
      title,
      consoleErrors,
      consoleWarnings,
      networkErrors,
      requestsFailed
    }));
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message,
      consoleErrors,
      consoleWarnings,
      networkErrors,
      requestsFailed
    }));
  } finally {
    await browser.close();
  }
})();
  `;
  
  const scriptPath = path.join(ROOT, '.artifacts', 'test-puppeteer.js');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, testScript);
  
  try {
    log('  Installing puppeteer if needed...', 'blue');
    try {
      require.resolve('puppeteer');
    } catch {
      log('  Installing puppeteer...', 'yellow');
      execSync('npm install puppeteer --no-save', { 
        cwd: ROOT, 
        stdio: 'pipe' 
      });
    }
    
    log('  Launching browser and loading page...', 'blue');
    const result = execSync(`node ${scriptPath}`, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000
    });
    
    const data = JSON.parse(result);
    
    if (data.success) {
      log(`  ✓ Page loaded: ${data.title}`, 'green');
    } else {
      log(`  ✗ Page load failed: ${data.error}`, 'red');
    }
    
    // Report console errors
    if (data.consoleErrors.length > 0) {
      log(`\n  ❌ Found ${data.consoleErrors.length} Console Errors:`, 'red');
      data.consoleErrors.forEach((err, i) => {
        log(`    ${i + 1}. ${err.text}`, 'red');
        if (err.location) {
          log(`       at ${err.location.url}:${err.location.lineNumber}`, 'yellow');
        }
      });
    } else {
      log(`  ✓ No console errors`, 'green');
    }
    
    // Report network errors
    if (data.requestsFailed.length > 0) {
      log(`\n  ❌ Found ${data.requestsFailed.length} Failed Requests:`, 'red');
      data.requestsFailed.forEach((req, i) => {
        log(`    ${i + 1}. ${req.method} ${req.url}`, 'red');
        log(`       Error: ${req.errorText}`, 'yellow');
        
        // Check for specific error patterns
        if (req.errorText.includes('ERR_NETWORK_CHANGED')) {
          log(`       ⚠️  ERR_NETWORK_CHANGED detected!`, 'magenta');
        }
        if (req.errorText.includes('CORS')) {
          log(`       ⚠️  CORS error detected!`, 'magenta');
        }
        if (req.errorText.includes('timeout')) {
          log(`       ⚠️  Timeout detected!`, 'magenta');
        }
      });
    } else {
      log(`  ✓ No failed requests`, 'green');
    }
    
    // Report warnings
    if (data.consoleWarnings.length > 0) {
      log(`\n  ⚠️  Found ${data.consoleWarnings.length} Console Warnings:`, 'yellow');
      data.consoleWarnings.slice(0, 5).forEach((warn, i) => {
        log(`    ${i + 1}. ${warn.text}`, 'yellow');
      });
    }
    
    return {
      success: data.success,
      consoleErrors: data.consoleErrors,
      requestsFailed: data.requestsFailed,
      networkErrors: data.networkErrors
    };
    
  } catch (error) {
    log(`  ✗ Test failed: ${error.message}`, 'red');
    if (error.stdout) {
      log(`  Output: ${error.stdout.slice(0, 500)}`, 'yellow');
    }
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   REAL BROWSER CONSOLE ERROR TEST                                 ║', 'cyan');
  log('║   Using Puppeteer to capture actual browser console errors        ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  const results = {
    local: null,
    ngrok: null
  };
  
  // Test local first
  log('\n🔧 Testing LOCAL (http://localhost:8080)...', 'cyan');
  results.local = await testWithPuppeteer(LOCAL_URL);
  
  // Test ngrok
  log('\n🌐 Testing NGROK (https://ramileo.ngrok.app)...', 'cyan');
  results.ngrok = await testWithPuppeteer(NGROK_URL);
  
  // Summary
  section('SUMMARY');
  
  const localErrors = (results.local?.consoleErrors?.length || 0) + (results.local?.requestsFailed?.length || 0);
  const ngrokErrors = (results.ngrok?.consoleErrors?.length || 0) + (results.ngrok?.requestsFailed?.length || 0);
  
  log(`\nLocal (localhost:8080):`, 'blue');
  log(`  Console Errors: ${results.local?.consoleErrors?.length || 0}`, localErrors > 0 ? 'red' : 'green');
  log(`  Failed Requests: ${results.local?.requestsFailed?.length || 0}`, localErrors > 0 ? 'red' : 'green');
  log(`  Status: ${localErrors === 0 ? '✅ PASS' : '❌ FAIL'}`, localErrors === 0 ? 'green' : 'red');
  
  log(`\nNgrok (ramileo.ngrok.app):`, 'blue');
  log(`  Console Errors: ${results.ngrok?.consoleErrors?.length || 0}`, ngrokErrors > 0 ? 'red' : 'green');
  log(`  Failed Requests: ${results.ngrok?.requestsFailed?.length || 0}`, ngrokErrors > 0 ? 'red' : 'green');
  log(`  Status: ${ngrokErrors === 0 ? '✅ PASS' : '❌ FAIL'}`, ngrokErrors === 0 ? 'green' : 'red');
  
  log('');
  
  if (localErrors === 0 && ngrokErrors === 0) {
    log('✅ ALL TESTS PASSED - No browser console errors detected!', 'green');
    process.exit(0);
  } else {
    log('❌ TESTS FAILED - Browser console errors detected!', 'red');
    log('\nErrors need to be fixed before Calliope can work properly.', 'yellow');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { testWithPuppeteer };

