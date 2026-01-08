import { Page, expect } from '@playwright/test';

export async function loginIfRequired(page: Page) {
  // Check if we are on the login page
  const title = await page.title();
  if (title.includes('Admin Login')) {
    console.log('Login required, performing login...');
    
    // Get password from env or use a default if not set (though it should be set)
    const password = process.env.ADMIN_PASSWORD || 'M7hRJqybcn1FWFMxZNbF-2nXLVLWoUweB2AxBBXPWXkKDw44NLDEwLr3YItN801C';
    
    await page.fill('#password', password);
    
    // Give it a moment to settle
    await page.waitForTimeout(500);
    
    // Press Enter or click button
    await page.press('#password', 'Enter');
    
    // If still on the same page after 2 seconds, try clicking the button explicitly
    await page.waitForTimeout(2000);
    if (page.url().includes('/admin/login')) {
      console.log('Still on login page after Enter, clicking button...');
      await page.click('#submitBtn');
    }
    
    // Wait for either:
    // 1. URL to change away from login
    // 2. An error message to appear
    await Promise.race([
      page.waitForURL(url => !url.toString().includes('/admin/login'), { timeout: 20000 }),
      page.waitForSelector('.error.show', { timeout: 20000 }).then(() => {
        throw new Error('Login failed: error message appeared on page');
      })
    ]).catch(err => {
      if (err.message.includes('Timeout')) {
        console.log('Login timeout - checking current URL and title');
        console.log('URL:', page.url());
      }
      throw err;
    });

    await page.waitForLoadState('networkidle');
    
    const newTitle = await page.title();
    console.log(`Login successful, now on page: ${newTitle}`);
  }
}
