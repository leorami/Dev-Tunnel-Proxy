#!/usr/bin/env node

/**
 * Impact App Debugging - Find client-side issues
 */

const https = require('https');
const http = require('http');

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

async function debugImpact() {
  console.log('🔍 IMPACT APP DEBUGGING');
  console.log('========================');
  
  // Test main app
  const proxyApp = await fetch('https://ramileo.ngrok.app/impact/');
  const localhostApp = await fetch('http://localhost:3000/');
  
  console.log('\n📱 Main App Status:');
  console.log(`   Localhost:  ${localhostApp.statusCode} (${localhostApp.contentLength} bytes)`);
  console.log(`   Proxy:      ${proxyApp.statusCode} (${proxyApp.contentLength} bytes)`);
  
  // Test JavaScript bundle content
  const proxyBundle = await fetch('https://ramileo.ngrok.app/impact/static/js/bundle.js');
  const localhostBundle = await fetch('http://localhost:3000/impact/static/js/bundle.js');
  
  console.log('\n📦 JavaScript Bundle:');
  console.log(`   Localhost:  ${localhostBundle.statusCode} (${localhostBundle.contentLength} bytes)`);
  console.log(`   Proxy:      ${proxyBundle.statusCode} (${proxyBundle.contentLength} bytes)`);
  
  // Check for hardcoded API URLs in bundle
  if (proxyBundle.content) {
    console.log('\n🔍 Scanning Bundle for Hardcoded URLs:');
    
    const localhostApiRegex = /localhost:8000/g;
    const localhostMatches = proxyBundle.content.match(localhostApiRegex) || [];
    
    const relativeApiRegex = /["']\/api/g;
    const relativeMatches = proxyBundle.content.match(relativeApiRegex) || [];
    
    console.log(`   Hardcoded localhost:8000 references: ${localhostMatches.length}`);
    console.log(`   Relative /api references: ${relativeMatches.length}`);
    
    if (localhostMatches.length > 0) {
      console.log('   ❌ PROBLEM: Impact app has hardcoded localhost API URLs');
      console.log('   🛠️  FIX: Update environment variables to use relative /api paths');
    }
    
    // Check for common React environment variables
    const envVarRegex = /REACT_APP_[A-Z_]+/g;
    const envVars = proxyBundle.content.match(envVarRegex) || [];
    
    if (envVars.length > 0) {
      console.log(`\n📋 Environment Variables Found: ${[...new Set(envVars)].join(', ')}`);
    }
  }
  
  // Test API endpoints the app might use
  console.log('\n🌐 API Endpoint Tests:');
  const apiTests = [
    { name: 'Health', path: '/api/health/' },
    { name: 'Auth Check', path: '/api/auth/check/' },
    { name: 'Users Me', path: '/api/users/me/' },
    { name: 'Login', path: '/api/auth/login/' }
  ];
  
  for (const test of apiTests) {
    const proxyApi = await fetch('https://ramileo.ngrok.app' + test.path);
    const localhostApi = await fetch('http://localhost:8000' + test.path);
    
    console.log(`   ${test.name}:`);
    console.log(`     Localhost API: ${localhostApi.statusCode}`);
    console.log(`     Proxy API:     ${proxyApi.statusCode}`);
    
    if (localhostApi.statusCode !== proxyApi.statusCode) {
      console.log(`     ⚠️  Status mismatch for ${test.name}`);
    }
  }
  
  // Final diagnosis
  console.log('\n🎯 IMPACT DIAGNOSIS:');
  console.log('====================');
  
  const issues = [];
  const fixes = [];
  
  if (localhostApp.statusCode !== proxyApp.statusCode) {
    issues.push('App status codes differ');
    fixes.push('Check proxy routing configuration');
  }
  
  if (proxyBundle.content && proxyBundle.content.includes('localhost:8000')) {
    issues.push('Hardcoded localhost API URLs in bundle');
    fixes.push('Update REACT_APP_API_BASE_URL to use relative paths or proxy domain');
  }
  
  if (issues.length === 0) {
    console.log('✅ No obvious proxy or configuration issues found');
    console.log('💡 If Impact still not working, likely causes:');
    console.log('   • Browser console JavaScript errors');
    console.log('   • CORS issues with API calls'); 
    console.log('   • Authentication/session not persisting through proxy');
    console.log('   • WebSocket connections for real-time features');
  } else {
    console.log('❌ Issues Found:');
    issues.forEach(issue => console.log(`   • ${issue}`));
    console.log('\n🛠️  Fixes:');
    fixes.forEach(fix => console.log(`   → ${fix}`));
  }
}

if (require.main === module) {
  debugImpact().catch(console.error);
}

module.exports = { debugImpact };
