/**
 * E2E test for Dashboard dropdown functionality
 * 
 * Tests that the route dropdowns are properly populated with routes
 * grouped by config file (without .conf extension)
 */

const { test, expect } = require('@playwright/test');

test.describe('Dashboard Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('http://localhost:8080/dashboard');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the dashboard page', async ({ page }) => {
    await expect(page).toHaveTitle(/Calliope Tools/);
    
    // Check that tool cards are visible
    await expect(page.locator('text=Audit Route')).toBeVisible();
    await expect(page.locator('text=Audit + Heal')).toBeVisible();
    await expect(page.locator('text=Advanced Heal')).toBeVisible();
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
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('[Dashboard]')) {
        logs.push(msg.text());
        console.log('Browser console:', msg.text());
      }
    });
    
    // Wait for loadRoutes to complete
    await page.waitForTimeout(3000);
    
    // Check that loadRoutes was called
    const loadRoutesLog = logs.find(log => log.includes('loadRoutes() called'));
    expect(loadRoutesLog).toBeDefined();
    console.log('\nAll dashboard logs:', logs.join('\n'));
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

