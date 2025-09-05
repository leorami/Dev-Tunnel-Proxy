#!/usr/bin/env node

/**
 * Storybook Browser Behavior Testing
 * Tests the actual JavaScript execution differences between localhost and proxy
 */

const https = require('https');
const http = require('http');

async function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        content: data,
        contentLength: data.length
      }));
    });
    
    req.on('error', (error) => resolve({
      error: error.message,
      statusCode: 0,
      content: ''
    }));
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        error: 'Request timeout',
        statusCode: 0,
        content: ''
      });
    });
  });
}

async function testStorybookBehavior() {
  console.log('🔍 STORYBOOK BROWSER BEHAVIOR COMPARISON');
  console.log('==========================================');
  
  const storyPath = '?path=/story/action-button--default';
  const localhost = `http://localhost:6006/${storyPath}`;
  const proxy = `https://ramileo.ngrok.app/sdk/${storyPath}`;
  
  console.log(`\n📱 Testing Story: ${storyPath}`);
  console.log(`   Localhost: ${localhost}`);
  console.log(`   Proxy:     ${proxy}`);
  
  // Test main story URLs
  console.log('\n📄 Initial HTML Response:');
  const [localhostResp, proxyResp] = await Promise.all([
    fetch(localhost),
    fetch(proxy)
  ]);
  
  console.log(`   Localhost: ${localhostResp.statusCode} (${localhostResp.contentLength} bytes)`);
  console.log(`   Proxy:     ${proxyResp.statusCode} (${proxyResp.contentLength} bytes)`);
  
  if (localhostResp.contentLength !== proxyResp.contentLength) {
    console.log('   ⚠️  Content length differs - investigating...');
  }
  
  // Test critical Storybook assets that might cause different behavior
  console.log('\n📦 Critical Storybook Assets:');
  
  const criticalAssets = [
    '/sb-manager/runtime.js',
    '/sb-addons/common-manager-bundle.js',
    '/@vite/client',
    '/iframe.html'
  ];
  
  for (const asset of criticalAssets) {
    const localhostAsset = await fetch(`http://localhost:6006${asset}`);
    const proxyAsset = await fetch(`https://ramileo.ngrok.app/sdk${asset}`);
    
    console.log(`   ${asset}:`);
    console.log(`     Localhost: ${localhostAsset.statusCode} (${localhostAsset.contentLength} bytes)`);
    console.log(`     Proxy:     ${proxyAsset.statusCode} (${proxyAsset.contentLength} bytes)`);
    
    if (localhostAsset.statusCode !== proxyAsset.statusCode) {
      console.log(`     ❌ CRITICAL: Asset loading differs!`);
    }
  }
  
  // Test story-specific API calls
  console.log('\n🎭 Story-specific Requests:');
  
  // Check if iframe loads correctly (this is where stories actually render)
  const iframeTests = [
    '/iframe.html?path=/story/action-button--default',
    '/iframe.html?id=action-button--default'
  ];
  
  for (const iframePath of iframeTests) {
    const localhostIframe = await fetch(`http://localhost:6006${iframePath}`);
    const proxyIframe = await fetch(`https://ramileo.ngrok.app/sdk${iframePath}`);
    
    console.log(`   ${iframePath}:`);
    console.log(`     Localhost: ${localhostIframe.statusCode} (${localhostIframe.contentLength} bytes)`);
    console.log(`     Proxy:     ${proxyIframe.statusCode} (${proxyIframe.contentLength} bytes)`);
    
    // Check iframe content for errors
    if (proxyIframe.content && proxyIframe.content.length > 100) {
      const hasErrors = proxyIframe.content.includes('error') || 
                       proxyIframe.content.includes('Error') ||
                       proxyIframe.content.includes('404') ||
                       proxyIframe.content.includes('not found');
      
      if (hasErrors) {
        console.log(`     ⚠️  Iframe may contain errors`);
        // Show a snippet of concerning content
        const errorSnippet = proxyIframe.content.substring(0, 200).replace(/\s+/g, ' ');
        console.log(`     Content: ${errorSnippet}...`);
      }
    }
    
    if (localhostIframe.statusCode !== proxyIframe.statusCode || 
        Math.abs(localhostIframe.contentLength - proxyIframe.contentLength) > 1000) {
      console.log(`     ❌ CRITICAL: Iframe behavior differs!`);
    }
  }
  
  // Final analysis
  console.log('\n🎯 BROWSER BEHAVIOR ANALYSIS:');
  console.log('==============================');
  
  console.log('💡 Key Insight: Identical HTML but different browser behavior indicates:');
  console.log('   1. JavaScript execution failures in proxy environment');
  console.log('   2. Asset loading issues (different base paths)');
  console.log('   3. Iframe rendering problems (stories render in iframes)');
  console.log('   4. WebSocket connection failures');
  console.log('   5. CORS or security context differences');
  
  console.log('\n🔧 Debug Steps:');
  console.log('   1. Check browser console errors on both URLs');
  console.log('   2. Compare Network tab asset loading');
  console.log('   3. Test iframe.html directly');
  console.log('   4. Verify story path resolution');
  console.log('   5. Check WebSocket connections for HMR');
  
  console.log(`\n📋 Specific URLs to test in browser:`);
  console.log(`   Localhost iframe: http://localhost:6006/iframe.html${storyPath}`);
  console.log(`   Proxy iframe:     https://ramileo.ngrok.app/sdk/iframe.html${storyPath}`);
}

if (require.main === module) {
  testStorybookBehavior().catch(console.error);
}

module.exports = { testStorybookBehavior };
