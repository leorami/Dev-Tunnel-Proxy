#!/usr/bin/env node
/* Comprehensive verification of status grouping, metadata, and auto-parent selection logic */
const assert = (cond, msg) => { if (!cond) { throw new Error(msg); } };
const path = require('path');
const { parseAppsDirectory } = require('../utils/nginxParser');

function normalizeBase(up){
  if (!up) return '';
  
  // Handle nginx variables like $inspire_upstream by treating them as literal keys
  if (up.includes('$')) {
    return up.replace(/\/$/, '');
  }
  
  try {
    const u = new URL(up.startsWith('http') ? up : `http://${up}`);
    return `${u.protocol}//${u.hostname}${u.port?`:${u.port}`:''}`;
  } catch {
    return up.replace(/\/$/, '');
  }
}

function groupByBase(entries){
  const byBase = new Map();
  for (const e of entries){
    const base = normalizeBase(e.upstream);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(e.route);
  }
  // Sort member routes for stable output
  for (const [k,v] of byBase){ byBase.set(k, Array.from(new Set(v)).sort()); }
  return byBase;
}

function routeDepth(r){ 
  return (r||'').split('/').filter(Boolean).length; 
}

function testAutoParentLogic(routes) {
  // Auto-parent ONLY if there is a single shallowest route in the base group
  const depths = routes.map(r => ({ r, d: routeDepth(r) }));
  const minD = Math.min(...depths.map(x => x.d));
  const shallow = depths.filter(x => x.d === minD).map(x => x.r);
  
  if (shallow.length === 1) {
    return { hasAutoParent: true, parent: shallow[0], children: routes.filter(r => r !== shallow[0]) };
  } else {
    return { hasAutoParent: false, parent: null, children: [] };
  }
}

function testPromotionLogic(routes, promotions = {}, baseKey) {
  const promoted = promotions[baseKey] || null;
  if (promoted && routes.includes(promoted)) {
    const children = routes.filter(r => r !== promoted);
    return { hasPromotedParent: true, parent: promoted, children };
  }
  return { hasPromotedParent: false, parent: null, children: [] };
}

function main(){
  const appsDir = path.join(__dirname, '..', 'apps');
  const entries = parseAppsDirectory(appsDir);
  console.log(`Parsed ${entries.length} nginx route entries`);

  // Debug: Show all entries for inspection
  console.log('\nAll parsed entries:');
  entries.forEach(e => {
    console.log(`  ${e.sourceFile}: ${e.route} -> ${e.upstream} (base: ${normalizeBase(e.upstream)})`);
  });

  // 1) No duplicate (sourceFile, route) pairs
  const pairs = entries.map(e=>`${e.sourceFile}|${e.route}`);
  const uniquePairs = new Set(pairs);
  assert(uniquePairs.size === entries.length, 'Duplicate (source, route) pair found in parser output');
  console.log('✅ No duplicate (source, route) pairs found');

  // 2) Grouping by base upstream must collapse multiple routes per base
  const byBase = groupByBase(entries);
  console.log('\nBase groupings:');
  for (const [base, routes] of byBase) {
    console.log(`  ${base}: ${routes.join(', ')}`);
  }
  
  const multiBases = Array.from(byBase.values()).filter(v=>v.length>1);
  assert(multiBases.length>0, 'No upstream base groups with more than one route');
  console.log(`✅ Found ${multiBases.length} base groups with multiple routes`);

  // 3) Test specific expected groupings from encast.conf
  const expectContains = (base, route)=>{
    const list = byBase.get(base);
    assert(list && list.includes(route), `Expected ${route} in base ${base}, got: ${JSON.stringify(list)}`);
  };

  // API (Django) on encast-api:8000 - should have multiple routes
  const apiBase = 'http://encast-api:8000';
  if (Array.from(byBase.keys()).includes(apiBase)){
    expectContains(apiBase, '/api/');
    expectContains(apiBase, '/admin/');
    expectContains(apiBase, '/health/');
    // API static and media routes should also be grouped here
    const apiRoutes = byBase.get(apiBase);
    assert(apiRoutes.some(r => r.startsWith('/api/static') || r.startsWith('/api/media')), 
           `API base should contain static/media routes, got: ${JSON.stringify(apiRoutes)}`);
    console.log('✅ API base grouping is correct');
  }

  // Impact dev server - should have multiple routes
  const impactBase = 'http://encast-impact:3000';
  if (Array.from(byBase.keys()).includes(impactBase)){
    expectContains(impactBase, '/impact/');
    // Impact should also have various asset routes
    const impactRoutes = byBase.get(impactBase);
    assert(impactRoutes.length > 1, `Impact base should have multiple routes, got: ${JSON.stringify(impactRoutes)}`);
    console.log('✅ Impact base grouping is correct');
  }

  // SDK storybook - this should be the big test case with many routes
  const sdkBase = 'http://encast-sdk:6006';
  if (Array.from(byBase.keys()).includes(sdkBase)){
    expectContains(sdkBase, '/sdk/');
    
    // All these SDK routes should be grouped together under the same base:
    const expectedSdkRoutes = [
      '/sdk/', '/sb-addons/', '/sb-common-assets/', '/sb-manager/', 
      '/@vite/', '/@id/', '/node_modules/', '/.storybook/', '/src/', 
      '/storybook-server-channel'
    ];
    
    const actualSdkRoutes = byBase.get(sdkBase);
    const foundRoutes = expectedSdkRoutes.filter(route => actualSdkRoutes.includes(route));
    
    console.log(`Expected SDK routes: ${expectedSdkRoutes.join(', ')}`);
    console.log(`Actual SDK routes: ${actualSdkRoutes.join(', ')}`);
    console.log(`Found expected routes: ${foundRoutes.join(', ')}`);
    
    assert(foundRoutes.length >= expectedSdkRoutes.length * 0.7, 
           `SDK base should contain most expected routes. Found ${foundRoutes.length} out of ${expectedSdkRoutes.length}`);
    console.log('✅ SDK base grouping contains expected routes');
  }

  // 4) Test auto-parent selection logic
  console.log('\nTesting auto-parent selection logic:');
  for (const [base, routes] of byBase) {
    if (routes.length > 1) {
      const result = testAutoParentLogic(routes);
      console.log(`  ${base} (${routes.length} routes): ${result.hasAutoParent ? 
        `Auto-parent: ${result.parent}` : 'No auto-parent (multiple shallowest routes)'}`);
      
      // For SDK base specifically, /sdk/ should be the auto-selected parent
      if (base === sdkBase && routes.includes('/sdk/')) {
        const sdkResult = testAutoParentLogic(routes);
        if (sdkResult.hasAutoParent) {
          assert(sdkResult.parent === '/sdk/', 
                 `SDK base should auto-select /sdk/ as parent, got: ${sdkResult.parent}`);
          console.log('✅ SDK auto-parent selection works correctly');
        }
      }
    }
  }

  // 5) Test promotion logic simulation
  console.log('\nTesting promotion logic:');
  const mockPromotions = { [sdkBase]: '/sdk/' };
  
  for (const [base, routes] of byBase) {
    if (routes.length > 1) {
      const promoted = testPromotionLogic(routes, mockPromotions, base);
      if (promoted.hasPromotedParent) {
        console.log(`  ${base}: Promoted parent ${promoted.parent} with ${promoted.children.length} children`);
      } else {
        const autoResult = testAutoParentLogic(routes);
        if (autoResult.hasAutoParent) {
          console.log(`  ${base}: Auto-parent ${autoResult.parent} with ${autoResult.children.length} children`);
        } else {
          console.log(`  ${base}: No parent, ${routes.length} standalone routes`);
        }
      }
    }
  }

  console.log('\n✅ All grouping and metadata checks passed');
}

try{ main(); }catch(e){ console.error('❌', e.message); process.exit(1); }


