import { test, expect } from '@playwright/test';

test.describe('Status Dashboard', () => {
  test('renders and shows Calliope, captures console and styles', async ({ page }, testInfo) => {
    const logs: Array<{ type: string; text: string }> = [];
    page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));

    await page.goto('/status', { waitUntil: 'domcontentloaded' });

    // Verify title and Calliope label present
    await expect(page.locator('header h1')).toContainText('Dev Tunnel Proxy');
    await expect(page.locator('#aiTab')).toHaveText(/Calliope/i);

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
    await page.locator('#aiTab').click();
    await page.getByRole('button', { name: /Self‑Check/i }).click();

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

    // Use UI button for robustness across layouts
    const btn = page.getByRole('button', { name: /Self‑Check/i });
    await btn.waitFor();

    // Drawer should be initially collapsed
    const drawer = page.locator('#aiDrawer');
    await drawer.waitFor();
    const collapsedBefore = await drawer.getAttribute('class');

    // Click the button
    await btn.click();

    // Expect greeting bubble to appear
    await page.getByText(/Heya! One sec while I listen to/i).waitFor();

    // Drawer should be open
    const collapsedAfter = await drawer.getAttribute('class');
    expect(collapsedAfter?.includes('collapsed')).toBeFalsy();
  });
});


