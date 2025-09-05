#!/usr/bin/env node

/**
 * Comparative Testing for Dev Tunnel Proxy
 * 
 * Compares localhost vs proxy access to ensure identical behavior.
 * Any differences indicate proxy configuration issues.
 */

const https = require('https');
const http = require('http');

const testPairs = [
  {
    name: 'Impact App (React/CRA)',
    localhost: 'http://localhost:3000/',
    proxy: 'http://localhost:8080/impact/',
    tunnel: 'https://ramileo.ngrok.app/impact/',
    testCriteria: {
      statusCode: true,
      contentType: true,
      hasReactApp: (content) => content.includes('react') || content.includes('React') || content.includes('bundle.js'),
      hasCorrectAssets: (content) => {
        // Check that all assets use relative paths or proper proxy paths
        const scripts = content.match(/src="([^"]+)"/g) || [];
        const links = content.match(/href="([^"]+)"/g) || [];
        const allAssets = [...scripts, ...links];
        
        return {
          assets: allAssets,
          hasAbsolutePaths: allAssets.some(asset => asset.includes('http://localhost')),
          hasRelativePaths: allAssets.some(asset => asset.includes('src="/') || asset.includes('href="/')),
        };
      },
      apiConfiguration: (content) => {
        // Check for API configuration issues
        const hasLocalhostApi = content.includes('localhost:8000') || content.includes('127.0.0.1:8000');
        const hasRelativeApi = content.includes('"/api"') || content.includes("'/api'");
        
        return {
          hasLocalhostApi,
          hasRelativeApi,
          shouldUseRelativeApis: !hasRelativeApi && hasLocalhostApi
        };
      }
    }
  },
  {
    name: 'Storybook (SDK)',
    localhost: 'http://localhost:6006/',
    proxy: 'http://localhost:8080/sdk/',
    tunnel: 'https://ramileo.ngrok.app/sdk/',
    testCriteria: {
      statusCode: true,
      contentType: true,
      hasStorybook: (content) => content.includes('storybook') || content.includes('Storybook'),
      hasCorrectBase: (content) => {
        const hasBaseHref = content.includes('<base href="/sdk/"') || content.includes('<base href=\\"/sdk/\\"');
        const hasRootBase = content.includes('<base href="/"') || content.includes('<base href="./"');
        
        return {
          hasBaseHref,
          hasRootBase,
          needsProxyBase: !hasBaseHref && hasRootBase
        };
      },
      assetPaths: (content) => {
        // Check that assets load from correct paths
        const assets = content.match(/(src|href)="([^"]+)"/g) || [];
        const relativeAssets = assets.filter(asset => asset.includes('./') || !asset.includes('http'));
        
        return {
          totalAssets: assets.length,
          relativeAssets: relativeAssets.length,
          needsPathConfiguration: relativeAssets.length > 0
        };
      }
    }
  },
  {
    name: 'API Health',
    localhost: 'http://localhost:8000/health/',
    proxy: 'http://localhost:8080/api/health/',
    tunnel: 'https://ramileo.ngrok.app/api/health/',
    testCriteria: {
      statusCode: true,
      contentType: true,
      isJson: (content) => {
        try {
          return JSON.parse(content);
        } catch (e) {
          return null;
        }
      },
      hasHealthData: (content) => {
        try {
          const json = JSON.parse(content);
          return json && (json.success || json.status || json.health);
        } catch (e) {
          return false;
        }
      }
    }
  }
];

async function fetchWithDetails(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        content: data,
        statusCode: res.statusCode,
        headers: res.headers,
        contentType: res.headers['content-type'] || '',
        contentLength: data.length
      }));
    });
    
    req.on('error', (error) => resolve({
      error: error.message,
      statusCode: 0,
      headers: {},
      contentType: '',
      content: '',
      contentLength: 0
    }));
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        error: 'Request timeout',
        statusCode: 0,
        headers: {},
        contentType: '',
        content: '',
        contentLength: 0
      });
    });
  });
}

function compareResponses(localhost, proxy, tunnel) {
  const differences = [];
  
  // Status code comparison
  if (localhost.statusCode !== proxy.statusCode) {
    differences.push({
      type: 'status_code',
      localhost: localhost.statusCode,
      proxy: proxy.statusCode,
      severity: 'critical',
      description: 'HTTP status codes differ'
    });
  }
  
  if (localhost.statusCode !== tunnel.statusCode) {
    differences.push({
      type: 'status_code_tunnel',
      localhost: localhost.statusCode,
      tunnel: tunnel.statusCode,
      severity: 'critical',
      description: 'HTTP status codes differ between localhost and tunnel'
    });
  }
  
  // Content type comparison
  const localhostType = localhost.contentType.split(';')[0];
  const proxyType = proxy.contentType.split(';')[0];
  const tunnelType = tunnel.contentType.split(';')[0];
  
  if (localhostType !== proxyType) {
    differences.push({
      type: 'content_type',
      localhost: localhostType,
      proxy: proxyType,
      severity: 'warning',
      description: 'Content types differ'
    });
  }
  
  if (localhostType !== tunnelType) {
    differences.push({
      type: 'content_type_tunnel',
      localhost: localhostType,
      tunnel: tunnelType,
      severity: 'warning',
      description: 'Content types differ between localhost and tunnel'
    });
  }
  
  // Content length comparison (allow some variance for headers/etc)
  const lengthDiff = Math.abs(localhost.contentLength - proxy.contentLength);
  const lengthVariance = localhost.contentLength * 0.1; // 10% variance allowed
  
  if (lengthDiff > lengthVariance && lengthDiff > 100) { // More than 10% or 100 bytes difference
    differences.push({
      type: 'content_length',
      localhost: localhost.contentLength,
      proxy: proxy.contentLength,
      difference: lengthDiff,
      severity: 'warning',
      description: 'Significant content length difference'
    });
  }
  
  return differences;
}

function runTestCriteria(testPair, responses) {
  const issues = [];
  const recommendations = [];
  
  for (const [criteriaName, testFn] of Object.entries(testPair.testCriteria)) {
    if (typeof testFn !== 'function') continue;
    
    try {
      // Run test on all three responses
      const localhostResult = testFn(responses.localhost.content);
      const proxyResult = testFn(responses.proxy.content);
      const tunnelResult = testFn(responses.tunnel.content);
      
      // Store results for analysis
      if (criteriaName === 'hasCorrectAssets') {
        if (localhostResult?.hasAbsolutePaths || proxyResult?.hasAbsolutePaths || tunnelResult?.hasAbsolutePaths) {
          issues.push('App uses absolute localhost paths that will fail in tunnel');
          recommendations.push('Use relative paths or environment-aware API configuration');
        }
      }
      
      if (criteriaName === 'apiConfiguration') {
        if (localhostResult?.shouldUseRelativeApis || proxyResult?.shouldUseRelativeApis || tunnelResult?.shouldUseRelativeApis) {
          issues.push('App hardcoded to localhost API endpoints');
          recommendations.push('Update environment variables to use /api instead of http://localhost:8000');
        }
      }
      
      if (criteriaName === 'hasCorrectBase') {
        if (proxyResult?.needsProxyBase || tunnelResult?.needsProxyBase) {
          issues.push('Storybook not configured for subpath deployment');
          recommendations.push('Add base href="/sdk/" to Storybook configuration');
        }
      }
      
    } catch (error) {
      issues.push(`Test ${criteriaName} failed: ${error.message}`);
    }
  }
  
  return { issues, recommendations };
}

async function runComparativeTests() {
  console.log('🔍 Running Comparative Tests (Localhost vs Proxy vs Tunnel)\n');
  console.log('Ensures identical behavior across all access methods...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  const failedTests = [];
  
  for (const testPair of testPairs) {
    totalTests++;
    console.log(`📋 ${testPair.name}`);
    console.log(`   Localhost: ${testPair.localhost}`);
    console.log(`   Proxy:     ${testPair.proxy}`);
    console.log(`   Tunnel:    ${testPair.tunnel}`);
    
    try {
      // Fetch all three versions
      const [localhost, proxy, tunnel] = await Promise.all([
        fetchWithDetails(testPair.localhost),
        fetchWithDetails(testPair.proxy),
        fetchWithDetails(testPair.tunnel)
      ]);
      
      const responses = { localhost, proxy, tunnel };
      
      // Check for errors
      const hasErrors = [localhost, proxy, tunnel].some(r => r.error);
      if (hasErrors) {
        const errors = [
          localhost.error && `localhost: ${localhost.error}`,
          proxy.error && `proxy: ${proxy.error}`,
          tunnel.error && `tunnel: ${tunnel.error}`
        ].filter(Boolean);
        
        console.log(`   ❌ ERRORS: ${errors.join(', ')}`);
        failedTests.push({
          name: testPair.name,
          errors,
          responses
        });
        console.log('');
        continue;
      }
      
      // Compare responses
      const differences = compareResponses(localhost, proxy, tunnel);
      
      // Run test-specific criteria
      const { issues, recommendations } = runTestCriteria(testPair, responses);
      
      // Determine overall result
      const hasCriticalDifferences = differences.some(d => d.severity === 'critical');
      const hasIssues = issues.length > 0;
      
      if (!hasCriticalDifferences && !hasIssues) {
        console.log(`   ✅ PASSED - Consistent behavior across all access methods`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED - Inconsistencies detected`);
        
        if (differences.length > 0) {
          console.log('   Behavioral Differences:');
          differences.forEach(diff => {
            console.log(`     • ${diff.description} (${diff.severity})`);
            if (diff.localhost !== undefined) console.log(`       Localhost: ${diff.localhost}`);
            if (diff.proxy !== undefined) console.log(`       Proxy: ${diff.proxy}`);
            if (diff.tunnel !== undefined) console.log(`       Tunnel: ${diff.tunnel}`);
          });
        }
        
        if (issues.length > 0) {
          console.log('   Configuration Issues:');
          issues.forEach(issue => console.log(`     • ${issue}`));
        }
        
        if (recommendations.length > 0) {
          console.log('   Recommendations:');
          recommendations.forEach(rec => console.log(`     → ${rec}`));
        }
        
        failedTests.push({
          name: testPair.name,
          differences,
          issues,
          recommendations,
          responses
        });
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failedTests.push({
        name: testPair.name,
        error: error.message
      });
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📊 Comparative Test Summary');
  console.log('============================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests.length}`);
  
  if (failedTests.length > 0) {
    console.log('\n🚨 Failed Tests Indicate Proxy Configuration Issues:');
    console.log('====================================================');
    
    failedTests.forEach(test => {
      console.log(`\n${test.name}:`);
      if (test.error) {
        console.log(`  Error: ${test.error}`);
      }
      if (test.errors) {
        console.log(`  Errors: ${test.errors.join('; ')}`);
      }
      if (test.differences) {
        console.log(`  Differences: ${test.differences.map(d => d.description).join('; ')}`);
      }
      if (test.issues) {
        console.log(`  Issues: ${test.issues.join('; ')}`);
      }
      if (test.recommendations) {
        console.log(`  Fixes: ${test.recommendations.join('; ')}`);
      }
    });
    
    console.log('\n💡 Key Principle: Localhost and Proxy should behave identically.');
    console.log('   Any differences indicate configuration problems that need fixing.');
  }
  
  process.exit(failedTests.length > 0 ? 1 : 0);
}

if (require.main === module) {
  runComparativeTests().catch(console.error);
}

module.exports = { runComparativeTests, testPairs };
