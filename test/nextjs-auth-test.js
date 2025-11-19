/**
 * Generic test for Next.js Auth endpoints (NextAuth/Auth.js) using Playwright
 * This test will capture console errors and network failures for any Next.js app with auth
 * 
 * Usage: node test/nextjs-auth-test.js <url> [authPattern]
 * Example: node test/nextjs-auth-test.js https://example.com/myapp next-auth
 */

const { chromium } = require('playwright');

async function testNextAuthEndpoint(url, authPattern = 'next-auth') {
  // Parse URL to extract base path
  const urlObj = new URL(url);
  const basePath = urlObj.pathname.replace(/\/$/, '');
  
  console.log(`🔬 Starting Next.js Auth Test with Playwright...`);
  console.log(`   URL: ${url}`);
  console.log(`   Base Path: ${basePath || '/'}`);
  console.log(`   Auth Pattern: ${authPattern}\n`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  const consoleMessages = [];
  const networkErrors = [];
  const apiResponses = [];
  
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({
      type: msg.type(),
      text: text,
      location: msg.location()
    });
    if (text.includes(authPattern) || text.includes('CLIENT_FETCH_ERROR') || text.includes('not valid JSON')) {
      console.log(`❌ [CONSOLE ${msg.type().toUpperCase()}]:`, text.substring(0, 200));
    }
  });
  
  // Capture network responses
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/auth')) {
      const status = response.status();
      let body = null;
      let contentType = response.headers()['content-type'] || '';
      
      try {
        body = await response.text();
      } catch (e) {
        body = `[Error reading body: ${e.message}]`;
      }
      
      apiResponses.push({
        url,
        status,
        contentType,
        body: body.substring(0, 500),
        headers: response.headers()
      });
      
      console.log(`📡 API Response: ${url}`);
      console.log(`   Status: ${status}`);
      console.log(`   Content-Type: ${contentType}`);
      console.log(`   Body preview: ${body.substring(0, 100)}`);
      console.log('');
      
      if (status >= 300 && status < 400) {
        console.log(`⚠️  REDIRECT detected! Location: ${response.headers()['location']}`);
      }
      
      if (contentType.includes('text/html') && url.includes('/api/')) {
        console.log(`❌ ERROR: API endpoint returning HTML instead of JSON!`);
      }
    }
  });
  
  // Capture failed requests
  page.on('requestfailed', request => {
    if (request.url().includes(basePath) || request.url().includes('/api/auth')) {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()
      });
      console.log(`❌ Request Failed: ${request.url()}`);
      console.log(`   Failure: ${request.failure().errorText}`);
    }
  });
  
  try {
    console.log(`🌐 Navigating to ${url}\n`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait a bit for any async auth checks
    await page.waitForTimeout(3000);
    
    console.log('\n📊 Test Results Summary:');
    console.log('=' .repeat(60));
    
    // Check for auth API calls
    const authAPICalls = apiResponses.filter(r => r.url.includes('/api/auth'));
    console.log(`\n✓ Auth API Calls: ${authAPICalls.length}`);
    
    authAPICalls.forEach(call => {
      const isError = call.status !== 200 || !call.contentType.includes('json');
      console.log(`  ${isError ? '❌' : '✅'} ${call.url}`);
      console.log(`     Status: ${call.status}, Type: ${call.contentType}`);
      if (call.status >= 300 && call.status < 400) {
        console.log(`     Redirect to: ${call.headers['location']}`);
      }
      if (isError) {
        console.log(`     Body: ${call.body.substring(0, 150)}`);
      }
    });
    
    // Check for console errors
    const authErrors = consoleMessages.filter(m => 
      m.text.includes(authPattern) || 
      m.text.includes('not valid JSON') ||
      m.text.includes('CLIENT_FETCH_ERROR')
    );
    
    console.log(`\n✓ Console Errors: ${authErrors.length}`);
    authErrors.forEach(err => {
      console.log(`  ❌ [${err.type}] ${err.text.substring(0, 200)}`);
    });
    
    // Check for network failures
    console.log(`\n✓ Network Failures: ${networkErrors.length}`);
    networkErrors.forEach(err => {
      console.log(`  ❌ ${err.url}: ${err.failure.errorText}`);
    });
    
    // Overall result
    console.log('\n' + '='.repeat(60));
    if (authAPICalls.some(c => c.status === 308 || c.status === 301) || authErrors.length > 0) {
      console.log('❌ TEST FAILED: Auth issues detected');
      console.log('\n🔍 Root Cause Analysis:');
      
      const redirects = authAPICalls.filter(c => c.status >= 300 && c.status < 400);
      if (redirects.length > 0) {
        console.log('  • Auth API endpoints are redirecting (308/301)');
        console.log('  • This causes the client to receive HTML instead of JSON');
        console.log('  • Likely cause: Next.js auth configuration or nginx routing');
      }
      
      return { success: false, authAPICalls, authErrors, networkErrors };
    } else {
      console.log('✅ TEST PASSED: No auth issues detected');
      return { success: true, authAPICalls, authErrors, networkErrors };
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run the test with command line arguments
const args = process.argv.slice(2);
const testUrl = args[0];
const authPattern = args[1] || 'next-auth';

if (!testUrl) {
  console.error('Usage: node test/nextjs-auth-test.js <url> [authPattern]');
  console.error('Example: node test/nextjs-auth-test.js https://example.com/myapp next-auth');
  process.exit(1);
}

testNextAuthEndpoint(testUrl, authPattern)
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

