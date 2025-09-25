import { test, expect } from '@playwright/test';

test.describe('Calliope UI behavior fixes', () => {
  test('Chat shows user bubble before thinking; renders Markdown; no post-processing rewrite', async ({ page }) => {
    // Stub AI answer with Markdown and the word "Ensure" (verifies no deEnsure post-processing)
    await page.route('**/api/ai/ask', async (route) => {
      const body = {
        ok: true,
        answer: [
          '### Test Heading',
          '',
          '- Ensure this line stays',
          '',
          '```bash',
          'echo hello',
          '```'
        ].join('\n')
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/status', { waitUntil: 'domcontentloaded' });
    await page.locator('#aiTab').click();
    // Ensure clean chat state
    const clearBtn = page.locator('#aiClearBtn');
    try { await clearBtn.scrollIntoViewIfNeeded(); await clearBtn.click(); } catch {}

    // Type a question and submit
    await page.fill('#aiQuery', 'Check chat order and markdown');
    const askBtn = page.locator('#aiAskBtn');
    try { await askBtn.scrollIntoViewIfNeeded(); } catch {}
    await askBtn.click();

    const chat = page.locator('#aiChat');

    // Expect at least one user bubble to appear, and a thinking assistant bubble present
    await expect(chat.locator('.bubble.user').first()).toBeVisible();
    // Thinking bubble should appear shortly after
    await expect(chat.locator('.bubble.assistant.thinking').first()).toBeVisible({ timeout: 7000 });

    // Wait for the final assistant response to render (Markdown parsed)
    await expect(chat.locator('h3:has-text("Test Heading")')).toBeVisible();
    await expect(chat.locator('pre code')).toBeVisible();

    // Verify that the word "Ensure" remains (no deEnsure rewrite)
    await expect(chat).toContainText('Ensure this line stays');
  });

  test('Health check posts heal:true and thinking bubble appears after ack', async ({ page }) => {
    let observedHeal = false;

    // Intercept self-check to capture payload and return a minimal successful response
    await page.route('**/api/ai/self-check', async (route) => {
      try {
        const req = route.request();
        const json = req.postDataJSON() as any;
        observedHeal = Boolean(json && json.heal === true);
      } catch {}
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, summary: 'All good ✨', self: { ok: true } })
      });
    });

    await page.goto('/status', { waitUntil: 'domcontentloaded' });

    // Force-enable Calliope UI affordances for this test
    await page.evaluate(() => {
      // @ts-ignore
      window.__calliopeEnabled = true;
      document.body.classList.add('calliope-enabled');
    });

    // Use the global header Self‑Check for reliability across layouts
    const headerBtn = page.locator('#aiSelfCheckGlobal');
    await headerBtn.waitFor();
    await headerBtn.click();

    const chat = page.locator('#aiChat');

    // Expect either greeting text or thinking bubble to appear promptly
    const chatAck = page.locator('#aiChat');
    await Promise.race([
      chatAck.locator('.bubble.assistant.thinking').first().waitFor({ timeout: 12000 }),
      chatAck.getByText(/One sec while I listen/i).first().waitFor({ timeout: 12000 }),
    ]);
    // Thinking bubble persists while working
    await expect(chat.locator('.bubble.assistant.thinking').first()).toBeVisible();

    // The request should have used heal: true
    await expect.poll(() => observedHeal).toBeTruthy();
  });
});


