#!/usr/bin/env node
/**
 * Example script for programmatically uploading an app configuration to the dev-tunnel-proxy
 * 
 * IMPORTANT: This script demonstrates the correct authentication flow:
 * 1. Login to /admin/login (fixed path) to get session cookie
 * 2. Query /config (fixed path) to get API base path
 * 3. Use discovered API base path for management API calls
 * 
 * Usage:
 *   ADMIN_PASSWORD=your-password node api-upload-config.js <app-name> <config-file>
 * 
 * Example:
 *   ADMIN_PASSWORD=secret node api-upload-config.js myapp ./myapp.conf
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const PROXY_HOST = process.env.PROXY_HOST || 'dev-proxy';
const PROXY_PORT = process.env.PROXY_PORT || '8080';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Parse command line arguments
const appName = process.argv[2];
const configFile = process.argv[3];

if (!appName || !configFile) {
  console.error('Usage: ADMIN_PASSWORD=pwd node api-upload-config.js <app-name> <config-file>');
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD environment variable is required');
  process.exit(1);
}

// Validate app name (alphanumeric with hyphens and underscores only)
if (!appName.match(/^[a-zA-Z0-9_-]+$/)) {
  console.error('Error: App name must contain only alphanumeric characters, hyphens, and underscores');
  process.exit(1);
}

// Read the configuration file
let configContent;
try {
  configContent = fs.readFileSync(configFile, 'utf8');
} catch (err) {
  console.error(`Error reading config file: ${err.message}`);
  process.exit(1);
}

// Helper to make HTTP requests
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({ 
          statusCode: res.statusCode, 
          headers: res.headers, 
          body: responseData 
        });
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Main execution
(async () => {
  try {
    console.log(`📦 Installing configuration for '${appName}'...`);
    console.log();
    
    // Step 1: Login to get session cookie
    console.log('🔐 Step 1: Authenticating...');
    const loginResponse = await makeRequest({
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path: '/admin/login',  // ← Fixed path, not configurable
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: ADMIN_PASSWORD }));
    
    if (loginResponse.statusCode !== 200) {
      console.error('❌ Authentication failed:', loginResponse.body);
      process.exit(1);
    }
    
    // Extract session cookie
    const setCookie = loginResponse.headers['set-cookie'];
    if (!setCookie || !setCookie[0]) {
      console.error('❌ No session cookie received');
      process.exit(1);
    }
    const cookie = setCookie[0].split(';')[0];
    console.log('✅ Authentication successful');
    console.log();
    
    // Step 2: Discover API base path
    console.log('📡 Step 2: Discovering API base path...');
    const configResponse = await makeRequest({
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path: '/config',  // ← Fixed path, not configurable
      method: 'GET'
    });
    
    if (configResponse.statusCode !== 200) {
      console.error('❌ Failed to get API configuration');
      process.exit(1);
    }
    
    const config = JSON.parse(configResponse.body);
    const apiBasePath = config.apiBasePath;
    console.log(`✅ API base path: ${apiBasePath}`);
    console.log();
    
    // Step 3: Install configuration using discovered API path
    console.log('⬆️  Step 3: Uploading configuration...');
    const data = JSON.stringify({
      name: appName,
      content: configContent
    });
    
    const installResponse = await makeRequest({
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path: `${apiBasePath}/apps/install`,  // ← Uses discovered path
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Cookie': cookie  // ← Include session cookie
      }
    }, data);
    
    // Parse response
    try {
      const result = JSON.parse(installResponse.body);
      
      if (installResponse.statusCode === 200 && result.ok) {
        console.log('✅ Successfully installed configuration');
        console.log(`📄 File installed: ${result.installed}`);
        console.log();
        console.log(`🌐 Your app should now be accessible at:`);
        console.log(`   Local: http://localhost:${PROXY_PORT}/${appName}/`);
      } else {
        console.error(`❌ Failed to install configuration: ${result.error || 'Unknown error'}`);
        if (result.detail) {
          console.error(`Details: ${result.detail}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`❌ Error parsing response: ${err.message}`);
      console.error(`Raw response: ${installResponse.body}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
})();
