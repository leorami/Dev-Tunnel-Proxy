import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

test.describe('Calliope toggle behavior (comprehensive)', () => {
  for (const url of pages) {
    test(`${url}: button toggles drawer open/close with correct states`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Find the toggle button (either new or legacy)
      const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal').first();
      await expect(btn).toBeVisible();
      
      // Initial state: drawer should be collapsed, button not pressed
      const drawer = page.locator('#aiDrawer');
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expect(drawer).toHaveClass(/collapsed/);
      
      // Click 1: Should open drawer
      await btn.click();
      await expect(drawer).not.toHaveClass(/collapsed/);
      await expect(drawer).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('body')).toHaveClass(/ai-open/);
      
      // Click 2: Should close drawer
      await btn.click();
      await expect(drawer).toHaveClass(/collapsed/);
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('body')).not.toHaveClass(/ai-open/);
      
      // Click 3: Should open again
      await btn.click();
      await expect(drawer).not.toHaveClass(/collapsed/);
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
  }
});

test.describe('Calliope positioning (comprehensive)', () => {
  for (const url of pages) {
    test(`${url}: drawer positioned with 16px gap below header and above viewport bottom`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Open drawer
      const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal').first();
      await btn.click();
      
      const drawer = page.locator('#aiDrawer');
      await expect(drawer).toBeVisible();
      
      // Get header and drawer positions (find visible header)
      const header = page.locator('header').first();
      const headerBox = await header.boundingBox();
      const drawerBox = await drawer.boundingBox();
      
      expect(headerBox).toBeTruthy();
      expect(drawerBox).toBeTruthy();
      
      if (headerBox && drawerBox) {
        // Drawer top should be header bottom + 16px gap
        const expectedTop = headerBox.y + headerBox.height + 16;
        const actualTop = drawerBox.y;
        
        // Allow 2px tolerance for rounding
        expect(Math.abs(actualTop - expectedTop)).toBeLessThanOrEqual(2);
        
        // Drawer should not overlap header
        expect(drawerBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
        
        // Drawer bottom should be at least 16px from viewport bottom
        const viewportHeight = page.viewportSize()?.height || 800;
        const drawerBottom = drawerBox.y + drawerBox.height;
        expect(drawerBottom).toBeLessThanOrEqual(viewportHeight - 16);
      }
    });
  }
});
