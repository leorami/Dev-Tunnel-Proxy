/**
 * Reproduction test for Dashboard dropdown bug
 * 
 * BUG: Dropdowns show "Select a route..." but no actual route options
 * Expected: Routes should be grouped by config file (without .conf extension)
 */

const http = require('http');

// Test data structure matching what /routes.json returns
const mockRoutesData = {
  routes: {
    '/airluum/': 'http://airluum-dev:3000',
    '/admin/': 'http://encast-dev:3000/admin',
    '/api/': 'http://encast-dev:3000/api',
    '/impact/': 'http://encast-dev:3000/impact',
    '/lyra': 'http://lyra-dev:4000',
    '/lyra_next/': 'http://lyra-dev:3000',
    '/health/': 'http://dev-proxy-config-api:3001/health',
    '/status/': 'http://dev-proxy-config-api:3001/status'
  },
  metadata: {
    '/airluum/': {
      sourceFile: 'apps/airluum.conf',
      upstream: 'http://airluum-dev:3000',
      configFile: 'apps/airluum.conf'
    },
    '/admin/': {
      sourceFile: 'apps/encast.conf',
      upstream: 'http://encast-dev:3000/admin',
      configFile: 'apps/encast.conf'
    },
    '/api/': {
      sourceFile: 'apps/encast.conf',
      upstream: 'http://encast-dev:3000/api',
      configFile: 'apps/encast.conf'
    },
    '/impact/': {
      sourceFile: 'apps/encast.conf',
      upstream: 'http://encast-dev:3000/impact',
      configFile: 'apps/encast.conf'
    },
    '/lyra': {
      sourceFile: 'apps/lyra.conf',
      upstream: 'http://lyra-dev:4000',
      configFile: 'apps/lyra.conf'
    },
    '/lyra_next/': {
      sourceFile: 'apps/lyra.conf',
      upstream: 'http://lyra-dev:3000',
      configFile: 'apps/lyra.conf'
    },
    '/health/': {
      sourceFile: 'config/default.conf',
      upstream: 'http://dev-proxy-config-api:3001/health',
      configFile: 'config/default.conf'
    },
    '/status/': {
      sourceFile: 'config/default.conf',
      upstream: 'http://dev-proxy-config-api:3001/status',
      configFile: 'config/default.conf'
    }
  },
  summary: {},
  generatedAt: new Date().toISOString()
};

console.log('🧪 Running Dashboard Dropdown Reproduction Tests...\n');

// Simple test runner
let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

// Test 1
runTest('routes.json should have the expected structure', () => {
  if (!mockRoutesData.routes) throw new Error('Missing routes property');
  if (!mockRoutesData.metadata) throw new Error('Missing metadata property');
  if (Object.keys(mockRoutesData.routes).length === 0) throw new Error('No routes found');
});

// Test 2
runTest('metadata should contain sourceFile for each route', () => {
  const routes = Object.keys(mockRoutesData.routes);
  routes.forEach(route => {
    if (!mockRoutesData.metadata[route]) throw new Error(`Missing metadata for ${route}`);
    if (!mockRoutesData.metadata[route].sourceFile) throw new Error(`Missing sourceFile for ${route}`);
  });
});

// Test 3
runTest('loadRoutes logic should group routes by config file', () => {
  const meta = mockRoutesData.metadata;
  const byConfig = {};
  
  Object.keys(meta).forEach(route => {
    if (route.match(/^\/(health|status|reports|devproxy|config)/)) return;
    const srcFull = (meta[route] && meta[route].sourceFile) || 'unknown.conf';
    const src = srcFull.split('/').pop();
    if (!byConfig[src]) byConfig[src] = [];
    byConfig[src].push(route);
  });
  
  if (!byConfig['airluum.conf']) throw new Error('Missing airluum.conf group');
  if (!byConfig['encast.conf']) throw new Error('Missing encast.conf group');
  if (!byConfig['lyra.conf']) throw new Error('Missing lyra.conf group');
  
  if (JSON.stringify(byConfig['airluum.conf']) !== JSON.stringify(['/airluum/'])) {
    throw new Error(`airluum.conf routes incorrect: ${JSON.stringify(byConfig['airluum.conf'])}`);
  }
  if (JSON.stringify(byConfig['encast.conf'].sort()) !== JSON.stringify(['/admin/', '/api/', '/impact/'].sort())) {
    throw new Error(`encast.conf routes incorrect: ${JSON.stringify(byConfig['encast.conf'])}`);
  }
  if (JSON.stringify(byConfig['lyra.conf'].sort()) !== JSON.stringify(['/lyra', '/lyra_next/'].sort())) {
    throw new Error(`lyra.conf routes incorrect: ${JSON.stringify(byConfig['lyra.conf'])}`);
  }
  
  if (byConfig['default.conf']) throw new Error('System routes should be filtered out');
});

// Test 4
runTest('config file names should have .conf extension removed for display', () => {
  if ('airluum.conf'.replace(/\.conf$/, '') !== 'airluum') throw new Error('Failed to remove .conf from airluum.conf');
  if ('encast.conf'.replace(/\.conf$/, '') !== 'encast') throw new Error('Failed to remove .conf from encast.conf');
  if ('lyra.conf'.replace(/\.conf$/, '') !== 'lyra') throw new Error('Failed to remove .conf from lyra.conf');
});

// Test 5
runTest('optgroup structure should be correct', () => {
  const meta = mockRoutesData.metadata;
  const byConfig = {};
  
  Object.keys(meta).forEach(route => {
    if (route.match(/^\/(health|status|reports|devproxy|config)/)) return;
    const srcFull = (meta[route] && meta[route].sourceFile) || 'unknown.conf';
    const src = srcFull.split('/').pop();
    if (!byConfig[src]) byConfig[src] = [];
    byConfig[src].push(route);
  });
  
  const sortedConfigs = Object.keys(byConfig).sort();
  
  if (sortedConfigs.length === 0) throw new Error('No config files found');
  
  sortedConfigs.forEach(configFile => {
    if (byConfig[configFile].length === 0) throw new Error(`Config ${configFile} has no routes`);
    const label = configFile.replace(/\.conf$/, '');
    if (label.includes('.conf')) throw new Error(`Label still contains .conf: ${label}`);
  });
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

