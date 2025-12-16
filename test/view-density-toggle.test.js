/**
 * Test Suite: View Density Toggle
 * 
 * Tests the compact/comfortable view toggle functionality including:
 * - Button presence and interaction
 * - CSS class application
 * - LocalStorage persistence
 * - Visual changes
 */

const assert = require('assert');
const puppeteer = require('puppeteer');

describe('View Density Toggle', function() {
  this.timeout(30000);
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
    // Clear localStorage before each test
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
    });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  describe('Toggle Button', () => {
    it('should have view density toggle button in header', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      const buttonExists = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return !!btn;
      });
      
      assert.strictEqual(buttonExists, true, 'View toggle button should exist');
    });

    it('should have correct initial icon (⊟ for comfortable)', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      const buttonText = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.textContent : '';
      });
      
      assert.strictEqual(buttonText, '⊟', 'Should show ⊟ for comfortable view by default');
    });

    it('should have appropriate title/tooltip', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      const buttonTitle = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.title : '';
      });
      
      assert.match(buttonTitle, /compact|density/i, 'Button should have descriptive title');
    });
  });

  describe('Toggle Functionality', () => {
    it('should toggle to compact view when clicked', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.strictEqual(viewMode, 'compact', 'Should set data-view to compact');
    });

    it('should change button icon to ⊞ when in compact mode', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const buttonText = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.textContent : '';
      });
      
      assert.strictEqual(buttonText, '⊞', 'Should show ⊞ in compact view');
    });

    it('should toggle back to comfortable view', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Toggle to compact
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      // Toggle back to comfortable
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.strictEqual(viewMode, 'comfortable', 'Should toggle back to comfortable');
    });

    it('should update button title when toggled', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const buttonTitle = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.title : '';
      });
      
      assert.match(buttonTitle, /comfortable/i, 'Title should mention comfortable when in compact mode');
    });
  });

  describe('Visual Changes', () => {
    it('should reduce card padding in compact view', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.card');
      
      const paddingBefore = await page.evaluate(() => {
        const card = document.querySelector('.card');
        if (!card) return null;
        return parseInt(window.getComputedStyle(card).padding);
      });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const paddingAfter = await page.evaluate(() => {
        const card = document.querySelector('.card');
        if (!card) return null;
        return parseInt(window.getComputedStyle(card).padding);
      });
      
      assert.ok(paddingAfter < paddingBefore, 'Compact view should have less padding');
    });

    it('should reduce font size in compact view', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.card');
      
      const fontSizeBefore = await page.evaluate(() => {
        const card = document.querySelector('.card');
        if (!card) return null;
        return parseInt(window.getComputedStyle(card).fontSize);
      });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const fontSizeAfter = await page.evaluate(() => {
        const card = document.querySelector('.card');
        if (!card) return null;
        return parseInt(window.getComputedStyle(card).fontSize);
      });
      
      assert.ok(fontSizeAfter <= fontSizeBefore, 'Compact view should have smaller or equal font size');
    });

    it('should reduce chip sizes in compact view', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.chip');
      
      const chipPaddingBefore = await page.evaluate(() => {
        const chip = document.querySelector('.chip');
        if (!chip) return null;
        const style = window.getComputedStyle(chip);
        return parseInt(style.paddingTop) + parseInt(style.paddingBottom);
      });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const chipPaddingAfter = await page.evaluate(() => {
        const chip = document.querySelector('.chip');
        if (!chip) return null;
        const style = window.getComputedStyle(chip);
        return parseInt(style.paddingTop) + parseInt(style.paddingBottom);
      });
      
      assert.ok(chipPaddingAfter < chipPaddingBefore, 'Compact view should have smaller chips');
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should save view preference to localStorage', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      const storedView = await page.evaluate(() => {
        return localStorage.getItem('dtpView');
      });
      
      assert.strictEqual(storedView, 'compact', 'Should save compact preference to localStorage');
    });

    it('should restore view preference on page load', async () => {
      // Set compact view in localStorage before page load
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('dtpView', 'compact');
      });
      
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(200);
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.strictEqual(viewMode, 'compact', 'Should restore compact view from localStorage');
    });

    it('should show correct button icon when restoring from localStorage', async () => {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('dtpView', 'compact');
      });
      
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(200);
      
      const buttonText = await page.evaluate(() => {
        const btn = document.getElementById('viewToggle');
        return btn ? btn.textContent : '';
      });
      
      assert.strictEqual(buttonText, '⊞', 'Should show ⊞ when restored as compact');
    });

    it('should persist across page refreshes', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Set to compact
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      // Refresh page
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForTimeout(200);
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.strictEqual(viewMode, 'compact', 'Should persist after refresh');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicking gracefully', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Click multiple times rapidly
      for (let i = 0; i < 5; i++) {
        await page.click('#viewToggle');
        await page.waitForTimeout(50);
      }
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.ok(['compact', 'comfortable'].includes(viewMode), 'Should maintain valid state after rapid clicks');
    });

    it('should work with theme toggle without conflicts', async () => {
      await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle2' });
      
      // Toggle view
      await page.click('#viewToggle');
      await page.waitForTimeout(100);
      
      // Toggle theme
      await page.click('#themeToggle');
      await page.waitForTimeout(100);
      
      const viewMode = await page.evaluate(() => {
        return document.body.getAttribute('data-view');
      });
      
      assert.strictEqual(viewMode, 'compact', 'View toggle should not be affected by theme toggle');
    });
  });
});

