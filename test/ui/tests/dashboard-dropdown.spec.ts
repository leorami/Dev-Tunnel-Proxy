/**
 * E2E test for Dashboard dropdown functionality
 * 
 * Tests that the route dropdowns are properly populated with routes
 * grouped by config file (without .conf extension)
 */

const { test, expect } = require('@playwright/test');

test.describe('Dashboard Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console listener BEFORE navigating
    page.on('console', msg => console.log(`[Browser ${msg.type()}]`, msg.text()));
    page.on('pageerror', error => console.log('[PAGE ERROR]', error.message));
    
    // Navigate to dashboard (trailing slash is required!)
    await page.goto('http://localhost:8080/dashboard/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the dashboard page', async ({ page }) => {
    await expect(page).toHaveTitle(/Calliope Tools/);
    
    // Check that tool cards are visible
    await expect(page.getByRole('heading', { name: 'Audit Route' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit + Heal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Advanced Heal' })).toBeVisible();
  });

  test('should populate all three dropdowns with routes', async ({ page }) => {
    // Wait for dropdowns to be populated
    await page.waitForTimeout(2000);
    
    // Check Audit Route dropdown
    const auditSelect = page.locator('#auditRoute');
    await expect(auditSelect).toBeVisible();
    
    const auditOptions = await auditSelect.locator('option').count();
    console.log(`Audit dropdown has ${auditOptions} options`);
    expect(auditOptions).toBeGreaterThan(1); // More than just "Select a route..."
    
    // Check Audit + Heal dropdown
    const healSelect = page.locator('#healRoute');
    await expect(healSelect).toBeVisible();
    
    const healOptions = await healSelect.locator('option').count();
    console.log(`Heal dropdown has ${healOptions} options`);
    expect(healOptions).toBeGreaterThan(1);
    
    // Check Advanced Heal dropdown
    const advHealSelect = page.locator('#advHealRoute');
    await expect(advHealSelect).toBeVisible();
    
    const advHealOptions = await advHealSelect.locator('option').count();
    console.log(`Advanced Heal dropdown has ${advHealOptions} options`);
    expect(advHealOptions).toBeGreaterThan(1);
  });

  test('should have optgroups for config files', async ({ page }) => {
    // Wait for dropdowns to be populated
    await page.waitForTimeout(2000);
    
    const auditSelect = page.locator('#auditRoute');
    
    // Check for optgroups
    const optgroups = await auditSelect.locator('optgroup').count();
    console.log(`Found ${optgroups} optgroups`);
    expect(optgroups).toBeGreaterThan(0);
    
    // Get optgroup labels
    const labels = await auditSelect.locator('optgroup').allTextContents();
    console.log('Optgroup labels:', labels);
    
    // Verify no .conf extension in labels
    labels.forEach(label => {
      expect(label).not.toContain('.conf');
    });
  });

  test('should display console logs for debugging', async ({ page }) => {
    // Just wait for dropdowns to be populated
    await page.waitForTimeout(2000);
    
    // Check that routes were loaded by verifying dropdown has options
    const auditSelect = page.locator('#auditRoute');
    const optionCount = await auditSelect.locator('option').count();
    
    console.log(`\n✅ Dashboard loaded successfully with ${optionCount} options in dropdown`);
    expect(optionCount).toBeGreaterThan(1);
  });

  test('should be able to select a route from dropdown', async ({ page }) => {
    // Wait for dropdowns to be populated
    await page.waitForTimeout(2000);
    
    const auditSelect = page.locator('#auditRoute');
    
    // Get all options (excluding the first "Select a route...")
    const options = await auditSelect.locator('option').allTextContents();
    console.log('Available options:', options);
    
    // Filter out empty and "Select a route..." options
    const routeOptions = options.filter(opt => opt.trim() && !opt.includes('Select'));
    
    if (routeOptions.length > 0) {
      // Select the first route
      await auditSelect.selectOption({ label: routeOptions[0] });
      
      // Verify selection
      const selectedValue = await auditSelect.inputValue();
      console.log('Selected value:', selectedValue);
      expect(selectedValue).toBeTruthy();
      expect(selectedValue).not.toBe('');
    } else {
      throw new Error('No route options available to select!');
    }
  });
});

