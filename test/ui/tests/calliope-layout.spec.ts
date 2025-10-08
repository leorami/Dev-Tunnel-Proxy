import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

async function openCalliope(page){
  const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal');
  await btn.first().click();
}

function withinTolerance(a:number,b:number, tol=16){
  return Math.abs(a-b) <= tol;
}

test.describe('Calliope layout + styling parity', () => {
  for (const theme of ['dark','light'] as const){
    test.describe(`theme: ${theme}`, () => {
      for (const url of pages){
        test(`drawer push + bubbles + buttons on ${url}`, async ({ page }) => {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.evaluate((t)=>{ document.documentElement.setAttribute('data-theme', t as any); localStorage.setItem('dtpTheme', t as any); }, theme);
          await page.reload({ waitUntil: 'domcontentloaded' });

          const content = page.locator('body[data-page="status"] .content, body[data-page="dashboard"] .content, body[data-page="reports"] .container, body[data-page="health"] .container, .content, .container').first();
          await expect(content).toBeVisible();
          const contentBefore = await content.boundingBox();

          await openCalliope(page);
          const drawer = page.locator('#aiDrawer');
          await expect(drawer).toBeVisible();
          
          // Wait for positioning logic to complete (runs with 100ms setTimeout)
          await page.waitForTimeout(150);

          const drawerBox = await drawer.boundingBox();
          const contentAfter = await content.boundingBox();
          if (drawerBox && contentBefore && contentAfter){
            // Gap should equal CSS gutter (~16px)
            const gap = Math.round(drawerBox.x - (contentAfter.x + contentAfter.width));
            expect(Math.abs(gap - 16) <= 18).toBeTruthy();
            // Shrink is approx drawer width + gutter
            const shrink = Math.round(contentBefore.width - contentAfter.width);
            expect(Math.abs(shrink - (drawerBox.width + 16)) < 64 || shrink >= drawerBox.width).toBeTruthy();
          }

          // Bubbles render
          const chat = page.locator('#aiChat');
          await expect(chat).toBeVisible();
          const q = page.locator('#aiQuery');
          await q.fill('ping');
          await page.locator('#aiAskBtn').click();
          await expect(chat.locator('.bubble.user').first()).toBeVisible();

          // Buttons order: Copy, Clear, Ask, Self‑Check (allow subtle hyphen variations)
          const btns = page.locator('.ai-actions .btn');
          const texts = (await btns.allTextContents()).map(t=>t.trim());
          expect(texts[0]).toBe('Copy');
          expect(texts[1]).toBe('Clear');
          expect(/Ask/i.test(texts[2])).toBeTruthy();
          expect(/Self.?Check/i.test(texts[3])).toBeTruthy();
        });
      }
    });
  }
});
