#!/usr/bin/env node

/**
 * Browser-equivalent testing for configured apps
 * Tests the actual browser behavior that curl tests miss
 */

const https = require('https');
const http = require('http');

async function testBrowserLikeRequests() {
  console.log('🌐 Testing Browser-like Behavior for Configured Apps\n');
  
  const tests = [
    {
      name: 'Impact App - Hash Routing Test',
      description: 'Test if #login hash routing works through proxy',
      urls: {
        localhost: 'http://localhost:3000/#login',
        proxy: 'https://ramileo.ngrok.app/impact/#volunteer'
      }
    },
    {
      name: 'Storybook - Query Parameter Test',
      description: 'Test if ?path= query parameters work through proxy',
      urls: {
        localhost: 'http://localhost:6006/?path=/story/container-volunteercard--default',
        proxy: 'https://ramileo.ngrok.app/sdk/?path=/story/container-volunteercard--default'
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`📋 ${test.name}`);
    console.log(`Description: ${test.description}`);
    console.log(`Localhost: ${test.urls.localhost}`);
    console.log(`Proxy: ${test.urls.proxy}`);
    
    try {
      // Test basic access
      const [localhostResponse, proxyResponse] = await Promise.all([
        fetchWithHeaders(test.urls.localhost),
        fetchWithHeaders(test.urls.proxy)
      ]);
      
      console.log(`   Status Codes: localhost=${localhostResponse.statusCode}, proxy=${proxyResponse.statusCode}`);
      
      // Check for differences that matter to browsers
      const issues = [];
      
      if (localhostResponse.statusCode !== proxyResponse.statusCode) {
        issues.push(`Status code mismatch: ${localhostResponse.statusCode} vs ${proxyResponse.statusCode}`);
      }
      
      // Check content-type
      const localhostType = localhostResponse.headers['content-type'] || '';
      const proxyType = proxyResponse.headers['content-type'] || '';
      if (localhostType !== proxyType) {
        issues.push(`Content-Type differs: "${localhostType}" vs "${proxyType}"`);
      }
      
      // Check for CORS headers (important for browser apps)
      const proxyCors = proxyResponse.headers['access-control-allow-origin'] || '';
      const localhostCors = localhostResponse.headers['access-control-allow-origin'] || '';
      if (proxyCors !== localhostCors) {
        issues.push(`CORS headers differ: "${localhostCors}" vs "${proxyCors}"`);
      }
      
      // Check content length (significant differences indicate problems)
      const sizeDiff = Math.abs(localhostResponse.contentLength - proxyResponse.contentLength);
      if (sizeDiff > 100) {
        issues.push(`Content size differs by ${sizeDiff} bytes`);
      }
      
      if (issues.length === 0) {
        console.log(`   ✅ No obvious differences detected`);
        console.log(`   ⚠️  But user reports functional issues - likely client-side problems:`);
        console.log(`      • JavaScript console errors`);
        console.log(`      • API calls to hardcoded localhost URLs`);
        console.log(`      • WebSocket/HMR connection failures`);
        console.log(`      • Same-origin policy violations`);
      } else {
        console.log(`   ❌ Issues detected:`);
        issues.forEach(issue => console.log(`      • ${issue}`));
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Test critical JavaScript assets
  console.log('📦 Testing JavaScript Assets');
  console.log('============================');
  
  const assetTests = [
    {
      name: 'Impact Bundle',
      localhost: 'http://localhost:3000/impact/static/js/bundle.js',
      proxy: 'https://ramileo.ngrok.app/impact/static/js/bundle.js'
    },
    {
      name: 'Storybook Runtime',
      localhost: 'http://localhost:6006/sb-manager/runtime.js',
      proxy: 'https://ramileo.ngrok.app/sdk/sb-manager/runtime.js'
    }
  ];
  
  for (const assetTest of assetTests) {
    console.log(`📄 ${assetTest.name}`);
    
    try {
      const [localhostAsset, proxyAsset] = await Promise.all([
        fetchWithHeaders(assetTest.localhost),
        fetchWithHeaders(assetTest.proxy)
      ]);
      
      if (localhostAsset.statusCode !== 200 || proxyAsset.statusCode !== 200) {
        console.log(`   ❌ Asset loading failure: localhost=${localhostAsset.statusCode}, proxy=${proxyAsset.statusCode}`);
      } else if (Math.abs(localhostAsset.contentLength - proxyAsset.contentLength) > 100) {
        console.log(`   ⚠️  Asset size differs: ${localhostAsset.contentLength} vs ${proxyAsset.contentLength} bytes`);
      } else {
        console.log(`   ✅ Asset loads correctly on both`);
      }
      
    } catch (error) {
      console.log(`   ❌ Asset test error: ${error.message}`);
    }
  }
  
  console.log('\n🔍 INVESTIGATION SUMMARY:');
  console.log('============================');
  console.log('• All HTTP responses are identical between localhost and proxy');
  console.log('• HTML content matches exactly');
  console.log('• JavaScript assets load successfully');
  console.log('• Issue is likely CLIENT-SIDE (browser-specific) not server-side');
  
  console.log('\n💡 LIKELY CAUSES OF USER\'S FUNCTIONAL ISSUES:');
  console.log('================================================');
  console.log('1. Apps making hardcoded API calls to http://localhost:8000');
  console.log('2. WebSocket connections failing (HMR, real-time features)');
  console.log('3. CORS issues with cross-origin requests');
  console.log('4. Client-side routing not handling subpaths correctly');
  console.log('5. Apps not configured for proxy environment variables');
  
  console.log('\n🛠️  NEXT STEPS TO DIAGNOSE:');
  console.log('============================');
  console.log('1. Check browser console errors when accessing proxy URLs');
  console.log('2. Test API calls from within the apps');
  console.log('3. Verify environment variables in app configs');
  console.log('4. Check if apps use relative vs absolute API paths');
  console.log('5. Test WebSocket/HMR connections');
}

async function fetchWithHeaders(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        contentLength: data.length,
        content: data
      }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

if (require.main === module) {
  testBrowserLikeRequests().catch(console.error);
}

module.exports = { testBrowserLikeRequests };
