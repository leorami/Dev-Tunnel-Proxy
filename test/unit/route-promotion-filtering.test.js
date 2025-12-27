#!/usr/bin/env node
/**
 * Unit tests for route promotion child filtering logic
 * 
 * Issue: Child routes were showing up in configured apps list even when promoted
 * Fix: Pre-process promoted routes and mark children as processed before rendering
 */

const assert = require('assert');

// Simple test framework
const tests = [];
function it(name, fn) {
  tests.push({ name, fn });
}

// Simulate the filtering logic from status.html
function filterRoutesWithPromotions(routes, promotions) {
  const processedRoutes = new Set();
  const visibleRoutes = [];
  
  // PRE-PROCESS: Mark all child routes as processed before rendering
  routes.forEach(item => {
    const configFile = item.source;
    const promotionData = promotions?.[configFile]?.[item.route];
    
    if (promotionData) {
      const mode = typeof promotionData === 'object' ? promotionData.mode : 'children';
      
      if (mode === 'config') {
        // Mark all routes from this config file as processed
        routes.forEach(child => {
          if (child.source === configFile && child.route !== item.route) {
            processedRoutes.add(child.route);
          }
        });
      } else {
        // Mark child routes as processed
        routes.forEach(child => {
          if (child.route !== item.route &&
              child.source === configFile &&
              child.route.startsWith(item.route) &&
              (child.route[item.route.length] === '/' || item.route.endsWith('/'))) {
            processedRoutes.add(child.route);
          }
        });
      }
    }
  });
  
  // Collect visible routes (not processed)
  routes.forEach(item => {
    if (!processedRoutes.has(item.route)) {
      visibleRoutes.push(item);
    }
  });
  
  return visibleRoutes;
}

// Test cases
it('should hide child routes when parent is promoted with children mode', () => {
  const routes = [
    { route: '/lyra/', source: 'lyra.conf' },
    { route: '/lyra/api/', source: 'lyra.conf' },
    { route: '/lyra/admin/', source: 'lyra.conf' },
    { route: '/lyra/static/', source: 'lyra.conf' }
  ];
  
  const promotions = {
    'lyra.conf': {
      '/lyra/': { mode: 'children' }
    }
  };
  
  const visible = filterRoutesWithPromotions(routes, promotions);
  
  assert.strictEqual(visible.length, 1, 'Should only show parent route');
  assert.strictEqual(visible[0].route, '/lyra/', 'Should show the promoted parent');
});

it('should hide all routes from config when promoted with config mode', () => {
  const routes = [
    { route: '/admin/', source: 'encast.conf' },
    { route: '/api/', source: 'encast.conf' },
    { route: '/impact/', source: 'encast.conf' },
    { route: '/inspire/', source: 'encast.conf' }
  ];
  
  const promotions = {
    'encast.conf': {
      '/admin/': { mode: 'config' }
    }
  };
  
  const visible = filterRoutesWithPromotions(routes, promotions);
  
  assert.strictEqual(visible.length, 1, 'Should only show the promoted route');
  assert.strictEqual(visible[0].route, '/admin/', 'Should show the promoted route');
});

it('should handle multiple promoted routes from different configs', () => {
  const routes = [
    { route: '/lyra/', source: 'lyra.conf' },
    { route: '/lyra/api/', source: 'lyra.conf' },
    { route: '/mxtk/', source: 'mxtk.conf' },
    { route: '/mxtk/dashboard/', source: 'mxtk.conf' },
    { route: '/test/', source: 'test.conf' }
  ];
  
  const promotions = {
    'lyra.conf': {
      '/lyra/': { mode: 'children' }
    },
    'mxtk.conf': {
      '/mxtk/': { mode: 'children' }
    }
  };
  
  const visible = filterRoutesWithPromotions(routes, promotions);
  
  assert.strictEqual(visible.length, 3, 'Should show 2 promoted parents + 1 unpromoted route');
  assert.ok(visible.some(r => r.route === '/lyra/'), 'Should include lyra parent');
  assert.ok(visible.some(r => r.route === '/mxtk/'), 'Should include mxtk parent');
  assert.ok(visible.some(r => r.route === '/test/'), 'Should include unpromoted route');
  assert.ok(!visible.some(r => r.route === '/lyra/api/'), 'Should not include lyra child');
  assert.ok(!visible.some(r => r.route === '/mxtk/dashboard/'), 'Should not include mxtk child');
});

it('should not hide routes when no promotions exist', () => {
  const routes = [
    { route: '/lyra/', source: 'lyra.conf' },
    { route: '/lyra/api/', source: 'lyra.conf' },
    { route: '/test/', source: 'test.conf' }
  ];
  
  const promotions = {};
  
  const visible = filterRoutesWithPromotions(routes, promotions);
  
  assert.strictEqual(visible.length, 3, 'Should show all routes when no promotions');
});

// Run tests
if (require.main === module) {
  console.log('Running Route Promotion Filtering Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    try {
      test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${test.name}`);
      console.log(`   ${e.message}`);
      failed++;
    }
  });
  
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
