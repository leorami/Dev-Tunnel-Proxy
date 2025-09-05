#!/usr/bin/env node

/**
 * Deep App Testing - Tests all aspects that could cause functional failures
 */

const https = require('https');
const http = require('http');

// Test all critical endpoints and assets for Encast apps
const testMatrix = {
  impact: {
    name: 'Impact App',
    localhost: 'http://localhost:3000',
    proxy: 'https://ramileo.ngrok.app/impact',
    assets: [
      '/impact/static/js/bundle.js',
      '/impact/favicon.ico'
    ],
    apiEndpoints: [
      '/api/health/',
      '/api/auth/check/',
      '/api/users/me/'
    ],
    websockets: [
      '/sockjs-node/info'
    ]
  },
  storybook: {
    name: 'Storybook',
    localhost: 'http://localhost:6006',
    proxy: 'https://ramileo.ngrok.app/sdk',
    assets: [
      '/sb-manager/runtime.js',
      '/sb-addons/common-manager-bundle.js',
      '/favicon.svg'
    ],
    apiEndpoints: [],  // Storybook doesn't use backend APIs
    websockets: [
      '/storybook-server-channel'
    ]
  }
};

async function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        content: data,
        contentLength: data.length,
        redirectUrl: res.headers.location
      }));
    });
    
    req.on('error', (error) => resolve({
      error: error.message,
      statusCode: 0,
      headers: {},
      content: '',
      contentLength: 0
    }));
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        error: 'Request timeout',
        statusCode: 0,
        headers: {},
        content: '',
        contentLength: 0
      });
    });
  });
}

async function testApp(appName, appConfig) {
  console.log(`\n🔍 DEEP TESTING: ${appConfig.name}`);
  console.log('===============================================');
  
  const issues = [];
  const warnings = [];
  
  // Test main app pages
  console.log('\n📱 Main App Access:');
  const mainTests = await Promise.all([
    fetch(appConfig.localhost),
    fetch(appConfig.proxy)
  ]);
  
  const [localhostMain, proxyMain] = mainTests;
  
  if (localhostMain.statusCode !== proxyMain.statusCode) {
    issues.push(`Main page status mismatch: localhost=${localhostMain.statusCode}, proxy=${proxyMain.statusCode}`);
  }
  
  console.log(`   Localhost: ${localhostMain.statusCode} (${localhostMain.contentLength} bytes)`);
  console.log(`   Proxy:     ${proxyMain.statusCode} (${proxyMain.contentLength} bytes)`);
  
  if (proxyMain.redirectUrl) {
    console.log(`   Redirect:  ${proxyMain.redirectUrl}`);
  }
  
  // Test JavaScript assets
  console.log('\n📦 JavaScript Assets:');
  for (const assetPath of appConfig.assets) {
    const localhostAssetUrl = appConfig.localhost + assetPath;
    const proxyAssetUrl = appConfig.proxy + assetPath;
    
    const assetTests = await Promise.all([
      fetch(localhostAssetUrl),
      fetch(proxyAssetUrl)
    ]);
    
    const [localhostAsset, proxyAsset] = assetTests;
    
    console.log(`   ${assetPath}:`);
    console.log(`     Localhost: ${localhostAsset.statusCode} (${localhostAsset.contentLength} bytes)`);
    console.log(`     Proxy:     ${proxyAsset.statusCode} (${proxyAsset.contentLength} bytes)`);
    
    if (proxyAsset.redirectUrl) {
      console.log(`     Redirect:  ${proxyAsset.redirectUrl}`);
    }
    
    if (localhostAsset.statusCode !== proxyAsset.statusCode) {
      issues.push(`Asset ${assetPath}: status mismatch ${localhostAsset.statusCode} vs ${proxyAsset.statusCode}`);
    }
    
    if (localhostAsset.statusCode === 200 && proxyAsset.statusCode === 200) {
      const sizeDiff = Math.abs(localhostAsset.contentLength - proxyAsset.contentLength);
      if (sizeDiff > 100) {
        warnings.push(`Asset ${assetPath}: size difference ${sizeDiff} bytes`);
      }
    }
  }
  
  // Test API endpoints
  console.log('\n🌐 API Endpoints:');
  for (const apiPath of appConfig.apiEndpoints) {
    // API calls go to different base URLs
    const localhostApiUrl = 'http://localhost:8000' + apiPath;  // Direct to API
    const proxyApiUrl = 'https://ramileo.ngrok.app' + apiPath;  // Through proxy
    
    const apiTests = await Promise.all([
      fetch(localhostApiUrl),
      fetch(proxyApiUrl)
    ]);
    
    const [localhostApi, proxyApi] = apiTests;
    
    console.log(`   ${apiPath}:`);
    console.log(`     Localhost API: ${localhostApi.statusCode} (${localhostApi.contentLength} bytes)`);
    console.log(`     Proxy API:     ${proxyApi.statusCode} (${proxyApi.contentLength} bytes)`);
    
    if (proxyApi.redirectUrl) {
      console.log(`     Redirect:      ${proxyApi.redirectUrl}`);
    }
    
    if (localhostApi.statusCode !== proxyApi.statusCode) {
      issues.push(`API ${apiPath}: status mismatch ${localhostApi.statusCode} vs ${proxyApi.statusCode}`);
    }
  }
  
  // Test WebSocket info endpoints
  console.log('\n🔌 WebSocket Endpoints:');
  for (const wsPath of appConfig.websockets) {
    const localhostWsUrl = appConfig.localhost + wsPath;
    const proxyWsUrl = appConfig.proxy + wsPath;
    
    const wsTests = await Promise.all([
      fetch(localhostWsUrl),
      fetch(proxyWsUrl)
    ]);
    
    const [localhostWs, proxyWs] = wsTests;
    
    console.log(`   ${wsPath}:`);
    console.log(`     Localhost WS: ${localhostWs.statusCode}`);
    console.log(`     Proxy WS:     ${proxyWs.statusCode}`);
    
    if (localhostWs.statusCode !== proxyWs.statusCode) {
      issues.push(`WebSocket ${wsPath}: status mismatch ${localhostWs.statusCode} vs ${proxyWs.statusCode}`);
    }
  }
  
  // Summary for this app
  console.log(`\n📊 ${appConfig.name} Summary:`);
  if (issues.length === 0 && warnings.length === 0) {
    console.log('   ✅ All tests passed - no obvious proxy issues');
    console.log('   ⚠️  If user reports functional issues, likely causes:');
    console.log('      • Client-side JavaScript console errors');
    console.log('      • Apps hardcoded to localhost URLs in environment variables');
    console.log('      • CORS or same-origin policy issues');
    console.log('      • WebSocket connection failures (not just endpoint availability)');
  } else {
    if (issues.length > 0) {
      console.log('   ❌ CRITICAL ISSUES FOUND:');
      issues.forEach(issue => console.log(`      • ${issue}`));
    }
    if (warnings.length > 0) {
      console.log('   ⚠️  WARNINGS:');
      warnings.forEach(warning => console.log(`      • ${warning}`));
    }
  }
  
  return { issues, warnings };
}

async function runDeepTests() {
  console.log('🔬 DEEP APPLICATION TESTING');
  console.log('============================');
  console.log('Testing all aspects that could cause functional failures...\n');
  
  const allIssues = [];
  const allWarnings = [];
  
  for (const [appName, appConfig] of Object.entries(testMatrix)) {
    const { issues, warnings } = await testApp(appName, appConfig);
    allIssues.push(...issues);
    allWarnings.push(...warnings);
  }
  
  console.log('\n\n🎯 FINAL ANALYSIS');
  console.log('==================');
  
  if (allIssues.length === 0) {
    console.log('✅ NO CRITICAL PROXY CONFIGURATION ISSUES FOUND');
    console.log('\n🔍 Since user reports functional failures but proxy tests pass:');
    console.log('   The issue is likely CLIENT-SIDE (browser environment):');
    console.log('   1. Check browser console for JavaScript errors');
    console.log('   2. Verify apps use environment variables for API URLs');  
    console.log('   3. Test if apps make hardcoded localhost API calls');
    console.log('   4. Check if WebSocket connections actually establish (not just endpoint availability)');
    console.log('   5. Verify CORS headers for all API calls');
  } else {
    console.log('❌ CRITICAL PROXY CONFIGURATION ISSUES:');
    allIssues.forEach(issue => console.log(`   • ${issue}`));
    console.log('\n🛠️  These need to be fixed in the proxy configuration.');
  }
  
  if (allWarnings.length > 0) {
    console.log('\n⚠️  WARNINGS (investigate if issues persist):');
    allWarnings.forEach(warning => console.log(`   • ${warning}`));
  }
  
  process.exit(allIssues.length > 0 ? 1 : 0);
}

if (require.main === module) {
  runDeepTests().catch(console.error);
}

module.exports = { runDeepTests, testMatrix };
