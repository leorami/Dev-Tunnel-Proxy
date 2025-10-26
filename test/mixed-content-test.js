#!/usr/bin/env node
/**
 * Mixed Content Detection Test
 * Specifically checks for HTTP resources on HTTPS pages
 */

const puppeteer = require('puppeteer');

const NGROK_URL = 'https://ramileo.ngrok.app';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMixedContent(url) {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(`Testing: ${url}`, 'cyan');
  log('='.repeat(70), 'cyan');
  
  const mixedContentErrors = [];
  const mixedContentWarnings = [];
  const httpRequests = [];
  const httpsRequests = [];
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  const page = await browser.newPage();
  
  // Capture console messages for Mixed Content
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    
    if (text.includes('Mixed Content')) {
      if (type === 'error') {
        mixedContentErrors.push(text);
        log(`  ❌ MIXED CONTENT ERROR: ${text}`, 'red');
      } else if (type === 'warning') {
        mixedContentWarnings.push(text);
        log(`  ⚠️  MIXED CONTENT WARNING: ${text}`, 'yellow');
      }
    }
  });
  
  // Track all requests by protocol
  page.on('request', request => {
    const requestUrl = request.url();
    if (requestUrl.startsWith('http://')) {
      httpRequests.push(requestUrl);
      log(`  🔓 HTTP Request: ${requestUrl}`, 'red');
    } else if (requestUrl.startsWith('https://')) {
      httpsRequests.push(requestUrl);
    }
  });
  
  try {
    log('\n📱 Loading page...', 'cyan');
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    log(`  ✓ Page loaded`, 'green');
    
    // Wait a bit for any lazy-loaded resources
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await browser.close();
    
    return {
      mixedContentErrors,
      mixedContentWarnings,
      httpRequests,
      httpsRequests
    };
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   MIXED CONTENT DETECTION TEST                                    ║', 'cyan');
  log('║   Checking for HTTP resources on HTTPS pages                      ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  try {
    // Test /lyra
    log('\n\n🧪 Testing /lyra for Mixed Content...', 'cyan');
    const lyraResults = await testMixedContent(`${NGROK_URL}/lyra`);
    
    // Test /status
    log('\n\n🧪 Testing /status for Mixed Content...', 'cyan');
    const statusResults = await testMixedContent(`${NGROK_URL}/status`);
    
    // Summary
    log('\n\n' + '='.repeat(70), 'cyan');
    log('SUMMARY', 'cyan');
    log('='.repeat(70), 'cyan');
    
    log('\n/lyra Results:', 'cyan');
    log(`  Mixed Content Errors: ${lyraResults.mixedContentErrors.length}`, 
        lyraResults.mixedContentErrors.length > 0 ? 'red' : 'green');
    log(`  Mixed Content Warnings: ${lyraResults.mixedContentWarnings.length}`, 
        lyraResults.mixedContentWarnings.length > 0 ? 'yellow' : 'green');
    log(`  HTTP Requests: ${lyraResults.httpRequests.length}`, 
        lyraResults.httpRequests.length > 0 ? 'red' : 'green');
    log(`  HTTPS Requests: ${lyraResults.httpsRequests.length}`, 'green');
    
    log('\n/status Results:', 'cyan');
    log(`  Mixed Content Errors: ${statusResults.mixedContentErrors.length}`, 
        statusResults.mixedContentErrors.length > 0 ? 'red' : 'green');
    log(`  Mixed Content Warnings: ${statusResults.mixedContentWarnings.length}`, 
        statusResults.mixedContentWarnings.length > 0 ? 'yellow' : 'green');
    log(`  HTTP Requests: ${statusResults.httpRequests.length}`, 
        statusResults.httpRequests.length > 0 ? 'red' : 'green');
    log(`  HTTPS Requests: ${statusResults.httpsRequests.length}`, 'green');
    
    const totalErrors = lyraResults.mixedContentErrors.length + 
                       statusResults.mixedContentErrors.length +
                       lyraResults.httpRequests.length +
                       statusResults.httpRequests.length;
    
    log('\n');
    if (totalErrors > 0) {
      log('❌ TEST FAILED - Mixed Content issues detected!', 'red');
      log('\nHTTP requests on HTTPS pages will be blocked by browsers.', 'yellow');
      log('All resources must be served over HTTPS.', 'yellow');
      process.exit(1);
    } else {
      log('✅ TEST PASSED - No Mixed Content issues!', 'green');
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

module.exports = { testMixedContent };

