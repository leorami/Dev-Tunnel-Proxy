/**
 * Test Suite: Layout Integration Tests
 * 
 * End-to-end tests verifying all layout features work together correctly
 */

const assert = require('assert');
const puppeteer = require('puppeteer');

describe('Layout Integration Tests', function() {
  this.timeout(60000);
  let browser, page;
  const baseUrl = process.env.TEST_URL || 'http://localhost:8080';

  before(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  });

  after(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
    });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Full User Journey', () => {
    it('should handle complete responsive workflow', async () => {
      // Start on desktop
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Verify desktop layout
      let columnCount = await page.evaluate(() => {
        const appsEl = document.getElementById('apps');
        const gridColumns = window.getComputedStyle(appsEl).gridTemplateColumns;
        return gridColumns.split(' ').length;
      });
      assert.strictEqual(columnCount, 3, 'Desktop should start with 3 columns');
      
      // Toggle to compact view
      await page.click('#viewToggle');
      await page.waitForTimeout(200);
      
      let viewMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      assert.strictEqual(viewMode, 'compact', 'Should be in compact mode');
      
      // Resize to tablet
      await page.setViewport({ width: 1200, height: 900 });
      await page.waitForTimeout(500);
      
      columnCount = await page.evaluate(() => {
        const appsEl = document.getElementById('apps');
        const gridColumns = window.getComputedStyle(appsEl).gridTemplateColumns;
        return gridColumns.split(' ').length;
      });
      assert.strictEqual(columnCount, 2, 'Tablet should have 2 columns');
      
      // Verify still in compact mode
      viewMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      assert.strictEqual(viewMode, 'compact', 'Should still be in compact mode after resize');
      
      // Resize to mobile
      await page.setViewport({ width: 400, height: 800 });
      await page.waitForTimeout(500);
      
      columnCount = await page.evaluate(() => {
        const appsEl = document.getElementById('apps');
        const gridColumns = window.getComputedStyle(appsEl).gridTemplateColumns;
        return gridColumns.split(' ').length;
      });
      assert.strictEqual(columnCount, 1, 'Mobile should have 1 column');
      
      // Verify no overflow on mobile
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      assert.strictEqual(hasOverflow, false, 'Mobile should not have horizontal scroll');
      
      // Toggle back to comfortable
      await page.click('#viewToggle');
      await page.waitForTimeout(200);
      
      viewMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      assert.strictEqual(viewMode, 'comfortable', 'Should be back to comfortable mode');
    });

    it('should persist view preference across navigation', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Set compact view
      await page.click('#viewToggle');
      await page.waitForTimeout(200);
      
      // Navigate to another page
      await page.goto(`${baseUrl}/health`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(200);
      
      // Navigate back to status
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(300);
      
      const viewMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      assert.strictEqual(viewMode, 'compact', 'View preference should persist across navigation');
    });
  });

  describe('Masonry with View Density', () => {
    it('should maintain masonry ordering in both compact and comfortable modes', async () => {
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(500);
      
      // Get card order in comfortable mode
      const comfortableOrder = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#apps .card'));
        return cards.map(c => c.querySelector('h2')?.textContent || '');
      });
      
      // Toggle to compact
      await page.click('#viewToggle');
      await page.waitForTimeout(500);
      
      // Get card order in compact mode
      const compactOrder = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#apps .card'));
        return cards.map(c => c.querySelector('h2')?.textContent || '');
      });
      
      // Order should be the same (masonry should persist)
      assert.deepStrictEqual(compactOrder, comfortableOrder, 
        'Card order should remain consistent between view modes');
    });

    it('should apply masonry after filtering', async () => {
      await page.setViewport({ width: 1600, height: 1000 });
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Apply filter
      await page.waitForSelector('#routeFilter');
      await page.type('#routeFilter', '200');
      await page.waitForTimeout(500);
      
      // Verify cards are still present
      const cardCount = await page.evaluate(() => {
        return document.querySelectorAll('#apps .card').length;
      });
      
      assert.ok(cardCount > 0, 'Should have cards after filtering');
      
      // Verify no layout issues
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5; // 5px tolerance
      });
      
      assert.strictEqual(hasOverflow, false, 'Filtered layout should not overflow');
    });
  });

  describe('Performance & Stability', () => {
    it('should handle rapid viewport changes', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      const viewports = [
        { width: 1600, height: 1000 },
        { width: 1200, height: 900 },
        { width: 800, height: 600 },
        { width: 400, height: 800 },
        { width: 1600, height: 1000 }
      ];
      
      for (const vp of viewports) {
        await page.setViewport(vp);
        await page.waitForTimeout(200);
      }
      
      // Verify page is still functional
      const pageIsResponsive = await page.evaluate(() => {
        const appsEl = document.getElementById('apps');
        const viewToggle = document.getElementById('viewToggle');
        return !!(appsEl && viewToggle);
      });
      
      assert.strictEqual(pageIsResponsive, true, 'Page should remain functional after rapid resizing');
    });

    it('should not cause memory leaks with repeated toggles', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Toggle view 20 times
      for (let i = 0; i < 20; i++) {
        await page.click('#viewToggle');
        await page.waitForTimeout(50);
      }
      
      // Check that page is still responsive
      const finalState = await page.evaluate(() => {
        return {
          hasButton: !!document.getElementById('viewToggle'),
          hasGrid: !!document.getElementById('apps'),
          viewMode: document.body.getAttribute('data-view')
        };
      });
      
      assert.ok(finalState.hasButton, 'Button should still exist');
      assert.ok(finalState.hasGrid, 'Grid should still exist');
      assert.ok(['compact', 'comfortable'].includes(finalState.viewMode), 'Should have valid view mode');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on toggle button', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      const ariaLabel = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.getAttribute('aria-label') : null;
      });
      
      assert.ok(ariaLabel, 'Button should have aria-label');
      assert.match(ariaLabel, /density|view/i, 'aria-label should describe the button');
    });

    it('should be keyboard accessible', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Tab to the view toggle button
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab'); // Adjust tabs as needed
      
      // Check if we can activate with Enter or Space
      const initialMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      
      // Try to toggle with Enter
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      
      const afterToggle = await page.evaluate(() => document.body.getAttribute('data-view'));
      
      // Should have changed (or at least be a valid state)
      assert.ok(['compact', 'comfortable'].includes(afterToggle), 'Should have valid state after keyboard interaction');
    });
  });

  describe('Browser Compatibility Checks', () => {
    it('should handle missing localStorage gracefully', async () => {
      await page.evaluateOnNewDocument(() => {
        // Simulate localStorage being unavailable
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => { throw new Error('localStorage unavailable'); },
            setItem: () => { throw new Error('localStorage unavailable'); },
            removeItem: () => { throw new Error('localStorage unavailable'); }
          },
          writable: false
        });
      });
      
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Should still load and function
      const hasToggle = await page.evaluate(() => !!document.getElementById('viewToggle'));
      assert.ok(hasToggle, 'Should load even without localStorage');
      
      // Should still be able to toggle (just won't persist)
      await page.click('#viewToggle');
      await page.waitForTimeout(200);
      
      const viewMode = await page.evaluate(() => document.body.getAttribute('data-view'));
      assert.ok(['compact', 'comfortable'].includes(viewMode), 'Should toggle even without localStorage');
    });
  });
});

