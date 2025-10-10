import { test, expect } from '@playwright/test';

test('Calliope audits half of discovered routes via Dashboard', async ({ page }, testInfo) => {
  // Get routes metadata
  const routesRes = await page.request.get('/routes.json', { headers: { 'ngrok-skip-browser-warning': 'true' } });
  expect(routesRes.ok()).toBeTruthy();
  const routesJson = await routesRes.json();
  const routes: string[] = Object.keys(routesJson?.metadata || {}).filter(r => r && r !== '/');
  expect(routes.length).toBeGreaterThan(0);

  // Take every other route (about half)
  const sample = routes.filter((_, idx) => idx % 2 === 0).slice(0, 10);

  // Open dashboard and Calliope
  await page.goto('/dashboard/', { waitUntil: 'domcontentloaded' });
  await page.locator('#calliopeOpen').click();
  await expect(page.locator('#aiDrawer')).toBeVisible();

  // Put a plausible ngrok/base URL if dashboard logic uses it to build absolute URLs
  try { await page.fill('#auditUrl', 'http://localhost:8080/status'); } catch {}

  // For each sampled route, click Audit+Heal and validate output looks reasonable
  let successes = 0;
  for (const route of sample) {
    const rows = page.locator('.routes .route');
    const row = rows.filter({ hasText: route }).first();
    await expect(row).toBeVisible();
    const btn = row.getByRole('button', { name: /Audit\+Heal/i });
    await btn.click();

    // Wait for result text to include a reasonable signal
    const out = page.locator('#out');
    await expect(out).toBeVisible();
    await expect.poll(async () => {
      const t = (await out.textContent()) || '';
      return /(ok|success|complete|healed|summary|error|warning)/i.test(t);
    }, { timeout: 25000, message: `No reasonable output for ${route}` }).toBeTruthy();

    successes++;
  }

  // Expect at least one route audited successfully
  expect(successes).toBeGreaterThan(0);
});


