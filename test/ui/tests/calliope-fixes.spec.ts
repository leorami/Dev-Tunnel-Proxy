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

    // Type a question and submit
    await page.fill('#aiQuery', 'Check chat order and markdown');
    await page.keyboard.press('Enter');

    const chat = page.locator('#aiChat');

    // Expect first bubble to be the user, second bubble is assistant thinking
    const bubbles = chat.locator('.bubble');
    await expect(bubbles.nth(0)).toHaveClass(/user/);
    await expect(bubbles.nth(1)).toHaveClass(/assistant/);
    await expect(bubbles.nth(1)).toHaveClass(/thinking/);

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

    // Click the first Diagnose button
    const diagBtn = page.locator('button[title="Diagnose with Calliope"]').first();
    await diagBtn.waitFor();
    await diagBtn.click();

    const chat = page.locator('#aiChat');

    // Ack bubble appears first
    await page.getByText(/Heya! One sec while I listen to/i).waitFor();

    // Then thinking bubble shows after ack
    const bubbles = chat.locator('.bubble');
    await expect(bubbles.nth(0)).toHaveClass(/assistant/);
    await expect(bubbles.nth(0)).not.toHaveClass(/thinking/);
    await expect(bubbles.nth(1)).toHaveClass(/assistant/);
    await expect(bubbles.nth(1)).toHaveClass(/thinking/);

    // The request should have used heal: true
    await expect.poll(() => observedHeal).toBeTruthy();
  });
});


