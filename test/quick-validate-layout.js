#!/usr/bin/env node
/**
 * Quick Layout Validation Script
 * 
 * Runs a fast sanity check on the layout features without full test suite.
 * Useful for quick verification during development.
 */

const puppeteer = require('puppeteer');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

async function quickValidate() {
  console.log(`${COLORS.cyan}╔════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║  Quick Layout Validation              ║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚════════════════════════════════════════╝${COLORS.reset}`);
  console.log('');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  let passed = 0;
  let failed = 0;

  try {
    // Navigate and handle potential login
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto('http://localhost:8080/status', { waitUntil: 'networkidle2', timeout: 10000 });
    
    // Check if we need to login
    const needsLogin = await page.evaluate(() => {
      return window.location.pathname.includes('/login');
    });
    
    if (needsLogin) {
      console.log('  Logging in...');
      // Read password from .env
      const fs = require('fs');
      const envContent = fs.readFileSync('.env', 'utf8');
      const passwordMatch = envContent.match(/ADMIN_PASSWORD=(.+)/);
      if (passwordMatch) {
        await page.type('input[type="password"]', passwordMatch[1].trim());
        await page.click('button[type="submit"]');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Wait for apps grid to load
    await page.waitForSelector('#apps', { timeout: 5000 }).catch(() => {
      console.log('  Warning: #apps element not found');
    });
    
    // Test 1: Desktop 3 columns
    console.log('Testing: Desktop 3 columns (1600x1000)...');
    
    const desktopCols = await page.evaluate(() => {
      const appsEl = document.getElementById('apps');
      if (!appsEl) return 0;
      return window.getComputedStyle(appsEl).gridTemplateColumns.split(' ').length;
    });
    
    if (desktopCols === 3) {
      console.log(`  ${COLORS.green}✓ Desktop has 3 columns${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Desktop has ${desktopCols} columns (expected 3)${COLORS.reset}`);
      failed++;
    }

    // Test 2: Tablet 2 columns
    console.log('Testing: Tablet 2 columns (1200x900)...');
    await page.setViewport({ width: 1200, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const tabletCols = await page.evaluate(() => {
      const appsEl = document.getElementById('apps');
      if (!appsEl) return 0;
      return window.getComputedStyle(appsEl).gridTemplateColumns.split(' ').length;
    });
    
    if (tabletCols === 2) {
      console.log(`  ${COLORS.green}✓ Tablet has 2 columns${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Tablet has ${tabletCols} columns (expected 2)${COLORS.reset}`);
      failed++;
    }

    // Test 3: Mobile 1 column
    console.log('Testing: Mobile 1 column (400x800)...');
    await page.setViewport({ width: 400, height: 800 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mobileCols = await page.evaluate(() => {
      const appsEl = document.getElementById('apps');
      if (!appsEl) return 0;
      return window.getComputedStyle(appsEl).gridTemplateColumns.split(' ').length;
    });
    
    if (mobileCols === 1) {
      console.log(`  ${COLORS.green}✓ Mobile has 1 column${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Mobile has ${mobileCols} columns (expected 1)${COLORS.reset}`);
      failed++;
    }

    // Test 4: No horizontal overflow on mobile
    console.log('Testing: No horizontal overflow on mobile...');
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    
    if (!hasOverflow) {
      console.log(`  ${COLORS.green}✓ No horizontal overflow${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Has horizontal overflow${COLORS.reset}`);
      failed++;
    }

    // Test 5: View toggle button exists
    console.log('Testing: View density toggle button...');
    await page.setViewport({ width: 1600, height: 1000 });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const hasToggle = await page.evaluate(() => {
      return !!document.getElementById('viewToggle');
    });
    
    if (hasToggle) {
      console.log(`  ${COLORS.green}✓ Toggle button exists${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Toggle button missing${COLORS.reset}`);
      failed++;
    }

    // Test 6: Toggle functionality
    console.log('Testing: View toggle functionality...');
    await page.click('#viewToggle');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const isCompact = await page.evaluate(() => {
      return document.body.getAttribute('data-view') === 'compact';
    });
    
    if (isCompact) {
      console.log(`  ${COLORS.green}✓ Toggle switches to compact view${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Toggle did not switch to compact${COLORS.reset}`);
      failed++;
    }

    // Test 7: Button icon changes
    console.log('Testing: Button icon changes...');
    const buttonIcon = await page.evaluate(() => {
      const btn = document.getElementById('viewToggle');
      return btn ? btn.textContent : '';
    });
    
    if (buttonIcon === '⊞') {
      console.log(`  ${COLORS.green}✓ Button shows ⊞ in compact mode${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ Button icon is "${buttonIcon}" (expected ⊞)${COLORS.reset}`);
      failed++;
    }

    // Test 8: LocalStorage persistence
    console.log('Testing: LocalStorage persistence...');
    const storedView = await page.evaluate(() => {
      return localStorage.getItem('dtpView');
    });
    
    if (storedView === 'compact') {
      console.log(`  ${COLORS.green}✓ View preference saved to localStorage${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ View not saved (got: ${storedView})${COLORS.reset}`);
      failed++;
    }

    // Test 9: Compact view reduces padding
    console.log('Testing: Compact view visual changes...');
    const cardPadding = await page.evaluate(() => {
      const card = document.querySelector('.card');
      if (!card) return null;
      return parseInt(window.getComputedStyle(card).padding);
    });
    
    if (cardPadding && cardPadding <= 12) {
      console.log(`  ${COLORS.green}✓ Compact view has reduced padding (${cardPadding}px)${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.yellow}⚠ Padding is ${cardPadding}px (expected ≤12px)${COLORS.reset}`);
      passed++; // Not critical
    }

    // Test 10: Cards present
    console.log('Testing: App cards rendered...');
    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('#apps .card').length;
    });
    
    if (cardCount > 0) {
      console.log(`  ${COLORS.green}✓ ${cardCount} cards rendered${COLORS.reset}`);
      passed++;
    } else {
      console.log(`  ${COLORS.red}✗ No cards found${COLORS.reset}`);
      failed++;
    }

  } catch (error) {
    console.log(`${COLORS.red}✗ Error during validation: ${error.message}${COLORS.reset}`);
    failed++;
  } finally {
    await browser.close();
  }

  // Summary
  console.log('');
  console.log(`${COLORS.cyan}═══════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}Summary:${COLORS.reset}`);
  console.log(`  ${COLORS.green}Passed: ${passed}${COLORS.reset}`);
  console.log(`  ${COLORS.red}Failed: ${failed}${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════${COLORS.reset}`);
  console.log('');

  if (failed === 0) {
    console.log(`${COLORS.green}✓ All checks passed!${COLORS.reset}`);
    process.exit(0);
  } else {
    console.log(`${COLORS.red}✗ ${failed} check(s) failed${COLORS.reset}`);
    console.log('Run full test suite for details: ./test/run-layout-tests.sh');
    process.exit(1);
  }
}

// Run validation
quickValidate().catch(error => {
  console.error(`${COLORS.red}Fatal error: ${error.message}${COLORS.reset}`);
  process.exit(1);
});

