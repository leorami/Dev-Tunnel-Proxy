#!/usr/bin/env node
/**
 * Example script for programmatically uploading an app configuration to the dev-tunnel-proxy
 * 
 * Usage:
 *   node api-upload-config.js <app-name> <config-file>
 * 
 * Example:
 *   node api-upload-config.js myapp ./myapp.conf
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const PROXY_HOST = process.env.PROXY_HOST || 'dev-proxy';
const PROXY_PORT = process.env.PROXY_PORT || '8080';

// Parse command line arguments
const appName = process.argv[2];
const configFile = process.argv[3];

if (!appName || !configFile) {
  console.error('Usage: node api-upload-config.js <app-name> <config-file>');
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

// Prepare the request data
const data = JSON.stringify({
  name: appName,
  content: configContent
});

// Prepare the request options
const options = {
  hostname: PROXY_HOST,
  port: PROXY_PORT,
  path: '/api/apps/install',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

// Send the request
const req = http.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(responseData);
      
      if (res.statusCode === 200 && result.ok) {
        console.log(`✅ Successfully installed configuration for '${appName}'`);
        console.log(`📄 File installed: ${result.installed}`);
      } else {
        console.error(`❌ Failed to install configuration: ${result.error || 'Unknown error'}`);
        if (result.detail) {
          console.error(`Details: ${result.detail}`);
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`❌ Error parsing response: ${err.message}`);
      console.error(`Raw response: ${responseData}`);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error(`❌ Request error: ${err.message}`);
  process.exit(1);
});

// Send the data
req.write(data);
req.end();

console.log(`🔄 Uploading configuration for '${appName}'...`);
