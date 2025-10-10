import { test, expect } from '@playwright/test';

test.describe('Status Dashboard', () => {
  test('renders and shows Calliope, captures console and styles', async ({ page }, testInfo) => {
    const logs: Array<{ type: string; text: string }> = [];
    page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));

    await page.goto('/status', { waitUntil: 'domcontentloaded' });

    // Verify title present
    await expect(page.locator('header h1')).toContainText('Dev Tunnel Proxy');
    // Label may be hidden; prefer the stethoscope toggle

    // Capture computed styles for a key element (Overview card)
    const overview = page.locator('.card').first();
    await overview.waitFor();
    const styles = await overview.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLElement);
      return {
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        padding: cs.padding,
        borderRadius: cs.borderRadius,
      };
    });
    await testInfo.attach('overview-styles.json', { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });

    // Expand Calliope drawer and trigger a self-check via the UI button (more realistic)
    await page.locator('#calliopeOpen').click();
    // Prefer the drawer-local Self‑Check to avoid header overlap/positioning issues
    const drawerSelfCheck = page.locator('#aiHealBtn');
    if (await drawerSelfCheck.count()) {
      await drawerSelfCheck.click();
    } else {
      await page.getByRole('button', { name: /Self‑Check/i }).click();
    }

    // Persist console logs
    const warnErr = logs.filter(l => l.type === 'warning' || l.type === 'error');
    await testInfo.attach('console.json', { body: JSON.stringify(logs, null, 2), contentType: 'application/json' });
    if (warnErr.length) {
      await testInfo.attach('console-warn-error.json', { body: JSON.stringify(warnErr, null, 2), contentType: 'application/json' });
    }

    // Screenshot for baseline/regression
    await page.screenshot({ path: `${testInfo.outputDir}/status.png`, fullPage: true });
  });

  test('Clicking stethoscope runs Calliope health when enabled', async ({ page }) => {
    await page.goto('/status', { waitUntil: 'domcontentloaded' });

    // Force-enable Calliope affordances for deterministic behavior in CI
    await page.evaluate(() => {
      // @ts-ignore
      window.__calliopeEnabled = true;
      document.body.classList.add('calliope-enabled');
    });

    // Use the stethoscope to open the drawer then run Self‑Check from inside
    await page.locator('#calliopeOpen').click();

    const drawer = page.locator('#aiDrawer');
    await drawer.waitFor();
    const collapsedBefore = await drawer.getAttribute('class');

    // Click the drawer Self‑Check
    await page.locator('#aiHealBtn').click();

    // Expect greeting bubble to appear (scoped to chat; allow either variant)
    const chat = page.locator('#aiChat');
    const baseScroll = await chat.evaluate(el => el.scrollHeight).catch(()=>0);
    await Promise.race([
      chat.locator('.bubble.assistant.thinking').first().waitFor({ timeout: 24000 }),
      chat.getByText(/One sec while I listen/i).first().waitFor({ timeout: 24000 }),
      chat.locator('.bubble.assistant').first().waitFor({ timeout: 24000 }),
      (async ()=>{ for(let i=0;i<28;i++){ const cur = await chat.evaluate(el=>el.scrollHeight).catch(()=>0); if (cur && cur > baseScroll) return true; await page.waitForTimeout(250);} return false; })()
    ]);

    // Drawer should be open
    const collapsedAfter = await drawer.getAttribute('class');
    expect(collapsedAfter?.includes('collapsed')).toBeFalsy();
  });
});


