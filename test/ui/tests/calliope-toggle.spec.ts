import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

test.describe('Calliope header toggle + aria state', () => {
  for (const url of pages){
    test(`toggle open/close and aria-pressed on ${url}`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal');
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await btn.click();
      const drawer = page.locator('#aiDrawer');
      await expect(drawer).toBeVisible();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await btn.click();
      // when closed, drawer has class 'collapsed'
      await expect(drawer).toHaveClass(/collapsed/);
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
    });
  }
});


