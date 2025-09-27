import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

test.describe('Calliope chips (Healing History / Status)', () => {
  for (const url of pages){
    for (const theme of ['dark','light'] as const){
      test(`${url} chips present and styled in ${theme}`, async ({ page }) => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate((t)=>{ document.documentElement.setAttribute('data-theme', t as any); localStorage.setItem('dtpTheme', t as any); }, theme);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('#calliopeOpen').click();
        const hist = page.locator('#aiHealingHistory');
        const stat = page.locator('#aiHealingStatus');
        await expect(hist).toBeVisible();
        await expect(stat).toBeVisible();
        const styles = await stat.evaluate((el:HTMLElement)=>{
          const s = getComputedStyle(el);
          return { br: s.borderRadius, fs: s.fontWeight, pad: s.padding, bc: s.borderColor };
        });
        expect(styles.br).toBeTruthy();
        expect(styles.fs === '700' || Number(styles.fs) >= 600).toBeTruthy();
        expect(styles.pad).toContain('px');
      });
    }
  }
});


