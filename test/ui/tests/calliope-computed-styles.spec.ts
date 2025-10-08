import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

test.describe('Calliope computed styles verification', () => {
  for (const url of pages) {
    test(`${url}: toggle behavior and positioning via computed styles`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal').first();
      const drawer = page.locator('#aiDrawer');
      
      // Initial state
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await expect(drawer).toHaveClass(/collapsed/);
      
      // Click to open
      await btn.click();
      await page.waitForTimeout(200); // Wait for positioning updates and button state
      
      // Check if drawer state changed (this should work if function is called)
      await expect(drawer).not.toHaveClass(/collapsed/);
      await expect(page.locator('body')).toHaveClass(/ai-open/);
      
      // Check if button state updated (this is what's failing)
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      
      // Verify positioning via specific computed styles
      const headerBottom = await page.locator('header').first().evaluate((el: HTMLElement) => {
        return el.getBoundingClientRect().bottom;
      });
      
      const drawerTop = await drawer.evaluate((el: HTMLElement) => {
        return el.getBoundingClientRect().top;
      });
      
      // Drawer should be positioned 16px below header
      const gap = drawerTop - headerBottom;
      
      expect(Math.abs(gap - 16)).toBeLessThanOrEqual(2); // 16px gap ±2px tolerance
      expect(drawerTop).toBeGreaterThan(headerBottom); // No overlap
      
      // Click to close
      await btn.click();
      await page.waitForTimeout(100);
      
      // Check if drawer closed (this should work if function is called)
      await expect(drawer).toHaveClass(/collapsed/);
      await expect(page.locator('body')).not.toHaveClass(/ai-open/);
      
      // Check if button state updated (this is what's failing)
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    });
  }
});
