#!/usr/bin/env node
/**
 * Calliope UI Interaction Test
 * Actually interacts with Calliope through the browser UI to test her capabilities
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://ramileo.ngrok.app';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCalliopeUI() {
  log('\n╔════════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   CALLIOPE UI INTERACTION TEST                                    ║', 'cyan');
  log('║   Testing Calliope\'s ability to detect and fix mixed content     ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════════════╝', 'cyan');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Capture console messages from Calliope
    const calliopeMessages = [];
    page.on('console', msg => {
      const text = msg.text();
      if (!text.includes('Lit is in dev mode')) {
        calliopeMessages.push(text);
      }
    });
    
    log('\n📱 Step 1: Loading status page...', 'cyan');
    await page.goto(`${BASE_URL}/status`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    log('  ✓ Status page loaded', 'green');
    
    // Wait for Calliope's chat interface to be ready
    log('\n🤖 Step 2: Waiting for Calliope to be ready...', 'cyan');
    await page.waitForSelector('#aiQuery', { timeout: 10000 });
    log('  ✓ Calliope is ready', 'green');
    
    // Take a screenshot of the initial state
    await page.screenshot({ path: '/tmp/calliope-before.png', fullPage: true });
    log('  📸 Screenshot saved: /tmp/calliope-before.png', 'yellow');
    
    // Type message to Calliope about mixed content errors
    log('\n💬 Step 3: Asking Calliope to fix mixed content errors...', 'cyan');
    const message = "I'm getting mixed content errors in my app. Please fix: Mixed Content: The page at 'https://ramileo.ngrok.app/lyra' was loaded over HTTPS, but requested an insecure stylesheet. This request has been blocked; the content must be served over HTTPS.";
    
    await page.type('#aiQuery', message);
    log(`  ✓ Typed message: "${message.slice(0, 80)}..."`, 'green');
    
    // Send the message
    log('\n📤 Step 4: Sending message to Calliope...', 'cyan');
    await page.waitForSelector('#aiAskBtn', { visible: true, timeout: 5000 });
    await page.evaluate(() => {
      document.getElementById('aiAskBtn').click();
    });
    log('  ✓ Message sent', 'green');
    
    // Wait for Calliope's response
    log('\n⏳ Step 5: Waiting for Calliope to respond and take action...', 'cyan');
    log('  (This may take 30-60 seconds while she analyzes and fixes the issue)', 'yellow');
    
    // Wait for response to appear
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll('.bubble.assistant');
        return bubbles.length > 0;
      },
      { timeout: 90000 }
    );
    
    log('  ✓ Calliope responded!', 'green');
    
    // Get Calliope's response
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for complete response
    const responses = await page.evaluate(() => {
      const bubbles = Array.from(document.querySelectorAll('.bubble.assistant'));
      return bubbles.map(el => el.textContent.trim());
    });
    
    log('\n🗣️ Calliope\'s Response:', 'magenta');
    responses.forEach((resp, i) => {
      log(`\n  Response ${i + 1}:`, 'cyan');
      log(`  ${resp.slice(0, 500)}${resp.length > 500 ? '...' : ''}`, 'yellow');
    });
    
    // Take screenshot after response
    await page.screenshot({ path: '/tmp/calliope-after-response.png', fullPage: true });
    log('\n  📸 Screenshot saved: /tmp/calliope-after-response.png', 'yellow');
    
    // Wait a bit longer for any healing actions to complete
    log('\n⏳ Step 6: Waiting for healing actions to complete...', 'cyan');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    log('\n✅ Step 7: Verifying the fix...', 'cyan');
    
    // Navigate to /lyra to check if mixed content is fixed
    await page.goto(`${BASE_URL}/lyra`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Check for mixed content errors in console
    const mixedContentErrors = calliopeMessages.filter(msg => msg.includes('Mixed Content'));
    
    if (mixedContentErrors.length > 0) {
      log(`  ⚠️ Still seeing ${mixedContentErrors.length} mixed content errors`, 'red');
      mixedContentErrors.slice(0, 3).forEach(err => log(`    ${err}`, 'red'));
    } else {
      log('  ✓ No mixed content errors detected!', 'green');
    }
    
    // Take final screenshot
    await page.screenshot({ path: '/tmp/calliope-lyra-after-fix.png', fullPage: true });
    log('\n  📸 Screenshot saved: /tmp/calliope-lyra-after-fix.png', 'yellow');
    
    // Summary
    log('\n' + '='.repeat(70), 'cyan');
    log('SUMMARY', 'cyan');
    log('='.repeat(70), 'cyan');
    
    const fullResponse = responses.join(' ');
    const mentionsAbsoluteRedirect = /absolute.?redirect/i.test(fullResponse);
    const mentionsXForwardedProto = /X-Forwarded-Proto/i.test(fullResponse);
    const mentionsHttps = /https/i.test(fullResponse);
    const mentionsFixed = /(fixed|healed|resolved|corrected)/i.test(fullResponse);
    
    log('\nCalliope\'s Understanding:', 'cyan');
    log(`  Mentioned absolute_redirect: ${mentionsAbsoluteRedirect ? '✅' : '❌'}`, mentionsAbsoluteRedirect ? 'green' : 'red');
    log(`  Mentioned X-Forwarded-Proto: ${mentionsXForwardedProto ? '✅' : '❌'}`, mentionsXForwardedProto ? 'green' : 'red');
    log(`  Mentioned HTTPS: ${mentionsHttps ? '✅' : '❌'}`, mentionsHttps ? 'green' : 'red');
    log(`  Claimed to fix issue: ${mentionsFixed ? '✅' : '❌'}`, mentionsFixed ? 'green' : 'red');
    
    log(`\nMixed Content Errors After Fix: ${mixedContentErrors.length}`, mixedContentErrors.length === 0 ? 'green' : 'red');
    
    // Save full test results
    const results = {
      timestamp: new Date().toISOString(),
      message: message,
      responses: responses,
      understanding: {
        mentionsAbsoluteRedirect,
        mentionsXForwardedProto,
        mentionsHttps,
        mentionsFixed
      },
      mixedContentErrorsAfter: mixedContentErrors.length,
      success: mixedContentErrors.length === 0 && mentionsFixed
    };
    
    fs.writeFileSync(
      path.join(__dirname, '../.artifacts/calliope-ui-test-results.json'),
      JSON.stringify(results, null, 2)
    );
    
    log('\n💾 Results saved to .artifacts/calliope-ui-test-results.json', 'yellow');
    
    if (results.success) {
      log('\n🎉 TEST PASSED - Calliope successfully detected and fixed the issue!', 'green');
    } else {
      log('\n⚠️ TEST INCOMPLETE - Calliope may need more guidance or time', 'yellow');
    }
    
    // Test complete - close browser automatically in headless mode
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  testCalliopeUI().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { testCalliopeUI };

