#!/usr/bin/env node
/**
 * Visual test for Calliope enable/disable behavior
 * Tests that UI components are correctly shown/hidden based on OPENAI_API_KEY presence
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'calliope-states');
const STATUS_URL = process.env.UI_BASE_URL || 'http://localhost:8080/status';

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function collectComputedStyles(page, selector) {
  return await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return null;
    
    const styles = window.getComputedStyle(element);
    return {
      display: styles.display,
      visibility: styles.visibility,
      opacity: styles.opacity,
      pointerEvents: styles.pointerEvents,
    };
  }, selector);
}

async function testCalliopeState(browser, testName, expectedEnabled) {
  console.log(`\n🧪 Testing: ${testName}`);
  
  const page = await browser.newPage();
  const logs = [];
  
  // Capture console logs
  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  
  try {
    // Navigate to status page
    console.log('   📍 Loading status page...');
    await page.goto(STATUS_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // Wait for dynamic content
    
    // Check API health endpoint directly
    console.log('   🏥 Checking /api/ai/health...');
    const healthResponse = await page.request.get('/api/ai/health');
    const healthData = healthResponse.ok() ? await healthResponse.json() : null;
    console.log(`   📊 Health response: ${JSON.stringify(healthData)}`);
    
    // Check if page has correct calliope-enabled class
    const hasCalliopeClass = await page.evaluate(() => {
      return document.body.classList.contains('calliope-enabled');
    });
    console.log(`   🏷️ body.calliope-enabled: ${hasCalliopeClass}`);
    
    // Validate the class matches expectations
    if (hasCalliopeClass !== expectedEnabled) {
      console.log(`   ❌ FAILED: Expected calliope-enabled=${expectedEnabled}, got ${hasCalliopeClass}`);
    } else {
      console.log(`   ✅ PASSED: calliope-enabled class is correct`);
    }
    
    // Test Recommend buttons visibility
    console.log('   🔍 Checking Recommend buttons...');
    const recommendButtons = await page.locator('a.btn, button.btn').evaluateAll(elements => {
      return elements
        .filter(el => /Recommend/i.test(el.textContent || ''))
        .map(el => ({
          text: el.textContent,
          display: window.getComputedStyle(el).display,
          visible: window.getComputedStyle(el).display !== 'none'
        }));
    });
    
    console.log(`   📋 Found ${recommendButtons.length} recommend button(s)`);
    recommendButtons.forEach((btn, i) => {
      console.log(`      Button ${i+1}: "${btn.text}" display=${btn.display} visible=${btn.visible}`);
      if (btn.visible === expectedEnabled) {
        console.log(`      ❌ FAILED: Recommend button should be ${expectedEnabled ? 'hidden' : 'visible'}`);
      } else {
        console.log(`      ✅ PASSED: Recommend button visibility is correct`);
      }
    });
    
    // Test Diagnose buttons (stethoscope icons)
    console.log('   🩺 Checking Diagnose buttons...');
    const diagnoseButtons = await page.locator('button, .icon-btn').evaluateAll(elements => {
      return elements
        .filter(el => {
          const label = el.getAttribute('aria-label') || '';
          const text = el.textContent || '';
          return /Diagnose/i.test(label) || text.includes('Diagnose') || el.querySelector('img[src*="calliope_heart_stethoscope"]');
        })
        .map(el => ({
          title: el.title,
          ariaLabel: el.getAttribute('aria-label'),
          hasStethoscope: !!el.querySelector('img[src*="calliope_heart_stethoscope"]'),
          display: window.getComputedStyle(el).display,
          visible: window.getComputedStyle(el).display !== 'none'
        }));
    });
    
    console.log(`   📋 Found ${diagnoseButtons.length} diagnose button(s)`);
    diagnoseButtons.forEach((btn, i) => {
      console.log(`      Button ${i+1}: title="${btn.title}" aria-label="${btn.ariaLabel}" visible=${btn.visible}`);
      
      // Check title/aria-label matches expected state
      const expectedLabel = expectedEnabled ? 'Calliope' : 'Diagnose';
      if (btn.title === expectedLabel || btn.ariaLabel === expectedLabel) {
        console.log(`      ✅ PASSED: Button label is correct (${expectedLabel})`);
      } else {
        console.log(`      ❌ FAILED: Expected label '${expectedLabel}', got title='${btn.title}' aria-label='${btn.ariaLabel}'`);
      }
    });
    
    // Test Calliope drawer visibility/accessibility
    console.log('   💬 Checking Calliope drawer...');
    const drawerElement = page.locator('#aiDrawer');
    const drawerExists = await drawerElement.count() > 0;
    
    if (drawerExists) {
      const drawerStyles = await collectComputedStyles(page, '#aiDrawer');
      console.log(`   📊 Drawer styles: ${JSON.stringify(drawerStyles)}`);
      
      // Test if drawer can be opened (when Calliope is enabled)
      if (expectedEnabled && diagnoseButtons.length > 0) {
        console.log('   🖱️ Testing Calliope button click...');
        const firstDiagnoseBtn = page.locator('button, .icon-btn').filter({
          has: page.locator('img[src*="calliope_heart_stethoscope"]')
        }).first();
        
        if (await firstDiagnoseBtn.count() > 0) {
          await firstDiagnoseBtn.click();
          await page.waitForTimeout(500);
          
          const drawerAfterClick = await page.evaluate(() => {
            const drawer = document.getElementById('aiDrawer');
            return drawer ? {
              collapsed: drawer.classList.contains('collapsed'),
              visible: !drawer.classList.contains('collapsed')
            } : null;
          });
          
          console.log(`   📊 Drawer after click: ${JSON.stringify(drawerAfterClick)}`);
          
          if (drawerAfterClick && drawerAfterClick.visible) {
            console.log(`   ✅ PASSED: Calliope drawer opens when button clicked`);
          } else {
            console.log(`   ❌ FAILED: Calliope drawer should open when button clicked`);
          }
        }
      } else if (!expectedEnabled) {
        console.log('   ℹ️ Skipping drawer click test (Calliope disabled)');
      }
    } else {
      console.log('   ⚠️ Calliope drawer (#aiDrawer) not found');
    }
    
    // Take screenshot
    const screenshotName = `${testName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, screenshotName), 
      fullPage: true 
    });
    console.log(`   📸 Screenshot saved: ${screenshotName}`);
    
    // Save console logs
    const warningErrors = logs.filter(l => l.type === 'warning' || l.type === 'error');
    if (warningErrors.length > 0) {
      console.log(`   ⚠️ Found ${warningErrors.length} console warnings/errors:`);
      warningErrors.forEach(log => console.log(`      ${log.type}: ${log.text}`));
    }
    
    // Save detailed test results
    const results = {
      testName,
      expectedEnabled,
      timestamp: new Date().toISOString(),
      healthData,
      hasCalliopeClass,
      recommendButtons,
      diagnoseButtons,
      drawerExists,
      logs: warningErrors
    };
    
    const resultsFile = path.join(SCREENSHOTS_DIR, `${testName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_results.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`   💾 Results saved: ${path.basename(resultsFile)}`);
    
    return results;
    
  } catch (error) {
    console.error(`   ❌ Test failed:`, error);
    return { testName, error: error.message };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('🚀 Starting Calliope Enable/Disable Visual Tests');
  console.log(`📍 Testing URL: ${STATUS_URL}`);
  
  await ensureScreenshotDir();
  console.log(`📁 Screenshots will be saved to: ${SCREENSHOTS_DIR}`);
  
  const browser = await chromium.launch({ 
    headless: false, // Set to true for CI
    slowMo: 100 // Slow down for better visibility
  });
  
  try {
    // Test with current environment (could be enabled or disabled)
    console.log('\n🧪 PHASE 1: Test current environment state');
    const currentStateResults = await testCalliopeState(browser, 'current_environment_state', null);
    
    // Determine the expected state based on actual health response
    const actualEnabled = currentStateResults.healthData?.enabled || false;
    console.log(`\n📊 Detected actual enabled state: ${actualEnabled}`);
    
    // Test with the determined state
    console.log('\n🧪 PHASE 2: Validate UI matches API state');
    const validationResults = await testCalliopeState(browser, 'validation_test', actualEnabled);
    
    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('================');
    console.log(`Current API enabled state: ${actualEnabled}`);
    console.log(`UI calliope-enabled class: ${validationResults.hasCalliopeClass}`);
    console.log(`Class matches API: ${validationResults.hasCalliopeClass === actualEnabled ? '✅ YES' : '❌ NO'}`);
    
    if (validationResults.recommendButtons) {
      const recVisible = validationResults.recommendButtons.some(btn => btn.visible);
      const recShouldBeVisible = !actualEnabled;
      console.log(`Recommend buttons visible: ${recVisible ? '✅ YES' : '❌ NO'} (should be ${recShouldBeVisible ? 'visible' : 'hidden'})`);
    }
    
    if (validationResults.diagnoseButtons) {
      const correctLabels = validationResults.diagnoseButtons.filter(btn => {
        const expectedLabel = actualEnabled ? 'Calliope' : 'Diagnose';
        return btn.title === expectedLabel || btn.ariaLabel === expectedLabel;
      }).length;
      console.log(`Diagnose button labels correct: ${correctLabels}/${validationResults.diagnoseButtons.length}`);
    }
    
    console.log(`\n📁 All results saved to: ${SCREENSHOTS_DIR}`);
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testCalliopeState, main };
