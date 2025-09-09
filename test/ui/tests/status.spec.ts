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

    // Expand Calliope drawer and run a self-check via API to ensure endpoint is reachable
    await page.locator('#aiTab').click();
    const resp = await page.request.post('/api/ai/self-check', { data: {} });
    expect(resp.ok()).toBeTruthy();

    // Persist console logs
    const warnErr = logs.filter(l => l.type === 'warning' || l.type === 'error');
    await testInfo.attach('console.json', { body: JSON.stringify(logs, null, 2), contentType: 'application/json' });
    if (warnErr.length) {
      await testInfo.attach('console-warn-error.json', { body: JSON.stringify(warnErr, null, 2), contentType: 'application/json' });
    }

    // Screenshot for baseline/regression
    await page.screenshot({ path: `${testInfo.outputDir}/status.png`, fullPage: true });
  });
});


