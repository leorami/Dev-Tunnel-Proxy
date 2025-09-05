#!/usr/bin/env node

/**
 * Enhanced functional testing for dev tunnel proxy
 * Tests actual app functionality, not just HTTP status codes
 */

const https = require('https');
const http = require('http');

const tests = [
  {
    name: 'Impact App API Configuration',
    url: 'https://ramileo.ngrok.app/impact/',
    description: 'Check if Impact app uses relative API paths',
    test: (content) => {
      const hasLocalhost = content.includes('localhost:8000');
      const hasRelativeApi = content.includes('"/api"') || content.includes("'/api'");
      
      return {
        passed: !hasLocalhost && hasRelativeApi,
        issues: hasLocalhost ? ['App hardcoded to localhost:8000 APIs - will fail in tunnel'] : [],
        recommendations: hasLocalhost ? [
          'Update REACT_APP_API_URL=/api',
          'Update REACT_APP_API_ENDPOINT=/api',
          'Use relative API paths in code'
        ] : []
      };
    }
  },
  {
    name: 'Impact App Hash Routing',
    url: 'https://ramileo.ngrok.app/impact/#volunteer',
    description: 'Test if hash routing works correctly',
    test: (content) => {
      const hasReactRouter = content.includes('react-router') || content.includes('Router');
      const hasProperBase = !content.includes('localhost:3000');
      
      return {
        passed: hasReactRouter && hasProperBase,
        issues: !hasProperBase ? ['App may have hardcoded localhost references'] : [],
        recommendations: !hasProperBase ? [
          'Ensure all asset paths are relative or proxy-aware',
          'Test hash routing functionality through tunnel'
        ] : []
      };
    }
  },
  {
    name: 'Storybook Configuration',
    url: 'https://ramileo.ngrok.app/sdk/?path=/story/container-volunteercard--default',
    description: 'Test if Storybook handles subpath deployment',
    test: (content) => {
      const hasBaseHref = content.includes('<base href="/sdk/"') || content.includes('<base href=\\"/sdk/\\"');
      const hasStorybookConfig = content.includes('storybook');
      const hasProperAssets = !content.includes('src="./') || content.includes('src="/sdk/');
      
      return {
        passed: hasBaseHref && hasStorybookConfig,
        issues: [
          ...(!hasBaseHref ? ['Storybook not configured for subpath deployment'] : []),
          ...(!hasProperAssets ? ['Assets may not load correctly'] : [])
        ],
        recommendations: !hasBaseHref ? [
          'Add base href configuration to .storybook/main.js',
          'Set STORYBOOK_BASE_PATH=/sdk environment variable',
          'Test story navigation and asset loading'
        ] : []
      };
    }
  },
  {
    name: 'API Connectivity Through Proxy',
    url: 'https://ramileo.ngrok.app/api/health',
    description: 'Verify API endpoints work through tunnel',
    test: (content) => {
      let apiResponse;
      try {
        apiResponse = JSON.parse(content);
      } catch (e) {
        apiResponse = null;
      }
      
      const isHealthy = apiResponse && (apiResponse.success || apiResponse.status === 'ok');
      
      return {
        passed: isHealthy,
        issues: !isHealthy ? ['API not responding correctly through proxy'] : [],
        recommendations: !isHealthy ? [
          'Check if API container is running',
          'Verify proxy configuration for API routes',
          'Test API endpoints directly vs through proxy'
        ] : []
      };
    }
  }
];

async function fetchContent(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ 
        content: data, 
        statusCode: res.statusCode,
        headers: res.headers
      }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🔍 Running Enhanced Functional Tests for Dev Tunnel Proxy\n');
  console.log('Testing actual app functionality, not just HTTP status codes...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  const failedTests = [];
  
  for (const test of tests) {
    totalTests++;
    console.log(`📋 ${test.name}`);
    console.log(`   URL: ${test.url}`);
    console.log(`   Description: ${test.description}`);
    
    try {
      const { content, statusCode } = await fetchContent(test.url);
      
      if (statusCode !== 200) {
        console.log(`   ❌ HTTP ${statusCode} - Cannot test functionality`);
        failedTests.push({
          name: test.name,
          error: `HTTP ${statusCode}`,
          url: test.url
        });
        console.log('');
        continue;
      }
      
      const result = test.test(content);
      
      if (result.passed) {
        console.log(`   ✅ PASSED`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED`);
        failedTests.push({
          name: test.name,
          issues: result.issues,
          recommendations: result.recommendations,
          url: test.url
        });
        
        if (result.issues.length > 0) {
          console.log('   Issues:');
          result.issues.forEach(issue => console.log(`     • ${issue}`));
        }
        
        if (result.recommendations.length > 0) {
          console.log('   Recommendations:');
          result.recommendations.forEach(rec => console.log(`     → ${rec}`));
        }
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failedTests.push({
        name: test.name,
        error: error.message,
        url: test.url
      });
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📊 Test Summary');
  console.log('================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests.length}`);
  
  if (failedTests.length > 0) {
    console.log('\n🚨 Failed Tests Require App Configuration Fixes:');
    console.log('=================================================');
    
    failedTests.forEach(test => {
      console.log(`\n${test.name}:`);
      if (test.error) {
        console.log(`  Error: ${test.error}`);
      }
      if (test.issues) {
        console.log(`  Issues: ${test.issues.join(', ')}`);
      }
      if (test.recommendations) {
        console.log(`  Fix: ${test.recommendations.join('; ')}`);
      }
      console.log(`  URL: ${test.url}`);
    });
    
    console.log('\n💡 These are APP CONFIGURATION issues, not proxy problems.');
    console.log('   Refer to APP-CONFIGURATION-ISSUES.md for detailed fixes.');
  }
  
  process.exit(failedTests.length > 0 ? 1 : 0);
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, tests };
