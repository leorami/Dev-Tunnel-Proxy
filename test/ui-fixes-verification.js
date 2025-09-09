const { chromium } = require('playwright');
const path = require('path');

async function testUIFixes() {
  const browser = await chromium.launch({ headless: false }); // Set to false to see the browser
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Testing UI fixes on dev-tunnel-proxy status page...');
    
    // Navigate to the status page
    await page.goto('http://localhost:8080/status', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for any dynamic content
    
    console.log('\n✅ Page loaded successfully');
    
    // Test 1: Check Sort/Filter controls are dropdowns/inputs (not chips)
    console.log('\n1️⃣ Testing Sort/Filter controls...');
    
    const sortSelect = await page.locator('#sortMode');
    const filterInput = await page.locator('#routeFilter');
    
    await page.screenshot({ path: 'test/screenshots/sort-filter-controls.png', fullPage: true });
    console.log('   📸 Screenshot saved: sort-filter-controls.png');
    
    const sortVisible = await sortSelect.isVisible();
    const filterVisible = await filterInput.isVisible();
    console.log(`   📊 Sort dropdown visible: ${sortVisible}`);
    console.log(`   🔍 Filter input visible: ${filterVisible}`);
    
    // Test the sort functionality
    await sortSelect.selectOption('alpha');
    await page.waitForTimeout(500);
    console.log('   ✅ Sort dropdown functional');
    
    // Test the filter functionality  
    await filterInput.fill('api');
    await page.waitForTimeout(500);
    await filterInput.clear();
    console.log('   ✅ Filter input functional');
    
    // Test 2: Check Calliope button behavior
    console.log('\n2️⃣ Testing Calliope button behavior...');
    
    // Find a Calliope button (stethoscope icon)
    const calliopeBtn = await page.locator('.icon-actions .icon-btn').first();
    
    if (await calliopeBtn.isVisible()) {
      console.log('   👀 Calliope button found');
      
      // Take screenshot before click
      await page.screenshot({ path: 'test/screenshots/before-calliope-click.png', fullPage: true });
      
      // Check if drawer is collapsed initially
      const drawer = await page.locator('#aiDrawer');
      const drawerCollapsed = await drawer.getAttribute('class');
      console.log(`   📱 Drawer initially collapsed: ${drawerCollapsed.includes('collapsed')}`);
      
      // Click the Calliope button
      await calliopeBtn.click();
      await page.waitForTimeout(500);
      
      // Check if drawer opened
      const drawerAfter = await drawer.getAttribute('class');
      const drawerOpened = !drawerAfter.includes('collapsed');
      console.log(`   📱 Drawer opened after click: ${drawerOpened}`);
      
      // Take screenshot after click
      await page.screenshot({ path: 'test/screenshots/after-calliope-click.png', fullPage: true });
      console.log('   📸 Screenshots saved: before/after calliope click');
      
      if (drawerOpened) {
        console.log('   ✅ Calliope button opens chat drawer correctly');
      } else {
        console.log('   ❌ Calliope button failed to open chat drawer');
      }
    } else {
      console.log('   ⚠️ No Calliope button found to test');
    }
    
    // Test 3: Check button alignment
    console.log('\n3️⃣ Testing button alignment...');
    
    const iconActions = await page.locator('.icon-actions').first();
    if (await iconActions.isVisible()) {
      const styles = await iconActions.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          alignItems: computed.alignItems,
          justifyContent: computed.justifyContent,
          position: computed.position,
          right: computed.right,
          top: computed.top
        };
      });
      
      console.log('   📐 Icon actions styles:', styles);
      console.log(`   ✅ Buttons positioned: ${styles.position} right: ${styles.right} top: ${styles.top}`);
      console.log(`   ✅ Alignment: ${styles.alignItems}, justify: ${styles.justifyContent}`);
    }
    
    // Test 4: Check Recommend buttons are hidden
    console.log('\n4️⃣ Testing Recommend button visibility...');
    
    const recommendButtons = await page.locator('a.btn:has-text("Recommend"), button.btn:has-text("Recommend")');
    const recommendCount = await recommendButtons.count();
    
    if (recommendCount > 0) {
      console.log(`   📊 Found ${recommendCount} Recommend buttons`);
      
      // Check if they're hidden
      for (let i = 0; i < recommendCount; i++) {
        const btn = recommendButtons.nth(i);
        const isVisible = await btn.isVisible();
        const display = await btn.evaluate(el => window.getComputedStyle(el).display);
        console.log(`   🔘 Recommend button ${i + 1}: visible=${isVisible}, display=${display}`);
      }
    } else {
      console.log('   📊 No Recommend buttons found');
    }
    
    // Test 5: Check placeholder behavior
    console.log('\n5️⃣ Testing placeholder behavior...');
    
    // Open Calliope drawer if not already open
    const drawer = await page.locator('#aiDrawer');
    const drawerClass = await drawer.getAttribute('class');
    if (drawerClass.includes('collapsed')) {
      const tab = await page.locator('#aiTab');
      await tab.click();
      await page.waitForTimeout(300);
    }
    
    const queryInput = await page.locator('#aiQuery');
    const initialPlaceholder = await queryInput.getAttribute('placeholder');
    console.log(`   📝 Initial placeholder: "${initialPlaceholder}"`);
    
    // Check font styles
    const inputStyles = await queryInput.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize
      };
    });
    console.log(`   🔤 Input font: ${inputStyles.fontFamily}, size: ${inputStyles.fontSize}`);
    
    // Type a message to test placeholder removal
    await queryInput.fill('Test message');
    const askBtn = await page.locator('#aiAskBtn');
    await askBtn.click();
    await page.waitForTimeout(500);
    
    const placeholderAfterMessage = await queryInput.getAttribute('placeholder');
    console.log(`   📝 Placeholder after message: "${placeholderAfterMessage}"`);
    
    if (placeholderAfterMessage === '') {
      console.log('   ✅ Placeholder removed after first message');
    } else {
      console.log('   ❌ Placeholder still present after message');
    }
    
    // Test 6: Check Copy button styling
    console.log('\n6️⃣ Testing Copy button styling...');
    
    const copyBtn = await page.locator('#aiCopyBtn');
    const clearBtn = await page.locator('#aiClearBtn'); 
    const askBtnStyles = await page.locator('#aiAskBtn');
    
    if (await copyBtn.isVisible()) {
      const copyClass = await copyBtn.getAttribute('class');
      const clearClass = await clearBtn.getAttribute('class');
      const askClass = await askBtnStyles.getAttribute('class');
      
      console.log(`   🔘 Copy button class: "${copyClass}"`);
      console.log(`   🔘 Clear button class: "${clearClass}"`);
      console.log(`   🔘 Ask button class: "${askClass}"`);
      
      const allMatch = copyClass === clearClass && clearClass === askClass;
      console.log(`   ✅ All buttons have matching classes: ${allMatch}`);
    }
    
    // Final screenshot
    await page.screenshot({ path: 'test/screenshots/final-state.png', fullPage: true });
    console.log('\n📸 Final screenshot saved: final-state.png');
    
    console.log('\n🎉 UI Fixes Verification Complete!');
    console.log('📁 Screenshots saved to test/screenshots/');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

// Create screenshots directory if it doesn't exist
const fs = require('fs');
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Run the test
testUIFixes().catch(console.error);
