#!/usr/bin/env node
/**
 * Comprehensive Calliope Tests (TDD approach)
 * 
 * Tests Calliope's functionality including:
 * - API container health and accessibility
 * - All /api/ai/ endpoints
 * - Browser console errors and network failures
 * - Site auditor integration
 * - Container error capture
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const SITE_AUDITOR_DIR = path.join(ROOT, 'site-auditor-debug');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(title, 'cyan');
  log('='.repeat(60), 'cyan');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test result tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, error = null) {
  results.tests.push({ name, passed, error });
  if (passed) {
    results.passed++;
    log(`✓ ${name}`, 'green');
  } else {
    results.failed++;
    log(`✗ ${name}`, 'red');
    if (error) log(`  Error: ${error}`, 'red');
  }
}

// ===== Test 1: Check API Container is Running =====
async function testApiContainerRunning() {
  section('TEST 1: API Container Running');
  
  try {
    const result = execSync('docker ps --filter name=dev-proxy-config-api --format "{{.Names}}\t{{.Status}}"', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    
    if (result.includes('dev-proxy-config-api') && result.includes('Up')) {
      recordTest('API container is running', true);
      log(`  Status: ${result.trim()}`, 'blue');
      return true;
    } else {
      recordTest('API container is running', false, 'Container not found or not running');
      return false;
    }
  } catch (error) {
    recordTest('API container is running', false, error.message);
    return false;
  }
}

// ===== Test 2: Check API Container Logs for Errors =====
async function testApiContainerLogs() {
  section('TEST 2: API Container Logs');
  
  try {
    // Get last 50 lines of logs
    const result = execSync('docker logs --tail 50 dev-proxy-config-api 2>&1', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    
    const hasErrors = /error|exception|failed|crash/i.test(result);
    const hasListening = /listening on/i.test(result);
    
    if (hasListening && !hasErrors) {
      recordTest('API container logs show healthy startup', true);
      log(`  Server appears to be listening`, 'blue');
    } else if (hasErrors) {
      recordTest('API container logs show healthy startup', false, 'Errors found in logs');
      log(`  Recent logs:\n${result.slice(-500)}`, 'yellow');
    } else {
      recordTest('API container logs show healthy startup', false, 'No listening message found');
      log(`  Recent logs:\n${result.slice(-500)}`, 'yellow');
    }
    
    return !hasErrors;
  } catch (error) {
    recordTest('API container logs show healthy startup', false, error.message);
    return false;
  }
}

// ===== Test 3: Direct Connection to API Container =====
async function testDirectApiConnection() {
  section('TEST 3: Direct API Connection');
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'dev-proxy-config-api',
      port: 3001,
      path: '/api/ai/health',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          recordTest('Direct connection to API container', true);
          log(`  Response: ${data.slice(0, 200)}`, 'blue');
          resolve(true);
        } else {
          recordTest('Direct connection to API container', false, `HTTP ${res.statusCode}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      recordTest('Direct connection to API container', false, error.message);
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      recordTest('Direct connection to API container', false, 'Connection timeout');
      resolve(false);
    });
    
    req.end();
  });
}

// ===== Test 4: Proxy Route to API =====
async function testProxyRouteToApi() {
  section('TEST 4: Proxy Route to API');
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'dev-proxy',
      port: 80,
      path: '/api/ai/health',
      method: 'GET',
      timeout: 10000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          recordTest('Proxy route to /api/ai/health', true);
          log(`  Response: ${data.slice(0, 200)}`, 'blue');
          resolve(true);
        } else if (res.statusCode === 504) {
          recordTest('Proxy route to /api/ai/health', false, 'Gateway Timeout (504)');
          log(`  This is the main issue - nginx is timing out waiting for API response`, 'yellow');
          resolve(false);
        } else {
          recordTest('Proxy route to /api/ai/health', false, `HTTP ${res.statusCode}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      recordTest('Proxy route to /api/ai/health', false, error.message);
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      recordTest('Proxy route to /api/ai/health', false, 'Request timeout');
      resolve(false);
    });
    
    req.end();
  });
}

// ===== Test 5: Check Nginx Config for API Routes =====
async function testNginxConfigForApiRoutes() {
  section('TEST 5: Nginx Config for API Routes');
  
  try {
    const defaultConf = fs.readFileSync(path.join(ROOT, 'config', 'default.conf'), 'utf8');
    
    const hasApiLocation = /location\s+[^{]*\/api\/[^{]*\{/.test(defaultConf);
    const hasProxyPass = /proxy_pass\s+http:\/\/[^;]+;/.test(defaultConf);
    const hasTimeout = /proxy_read_timeout|proxy_send_timeout|proxy_connect_timeout/.test(defaultConf);
    
    if (hasApiLocation && hasProxyPass) {
      recordTest('Nginx config has /api/ location block', true);
      
      // Extract timeout values
      const timeoutMatch = defaultConf.match(/proxy_read_timeout\s+(\d+)/);
      if (timeoutMatch) {
        const timeout = parseInt(timeoutMatch[1]);
        log(`  proxy_read_timeout: ${timeout}s`, 'blue');
        if (timeout < 60) {
          log(`  WARNING: Timeout may be too low for slow AI operations`, 'yellow');
        }
      } else {
        log(`  WARNING: No explicit proxy_read_timeout set (using nginx default of 60s)`, 'yellow');
      }
    } else {
      recordTest('Nginx config has /api/ location block', false, 'Missing location or proxy_pass');
    }
    
    return hasApiLocation && hasProxyPass;
  } catch (error) {
    recordTest('Nginx config has /api/ location block', false, error.message);
    return false;
  }
}

// ===== Test 6: Test All AI Endpoints =====
async function testAllAiEndpoints() {
  section('TEST 6: All AI Endpoints');
  
  const endpoints = [
    { path: '/api/ai/health', method: 'GET' },
    { path: '/api/ai/thoughts', method: 'GET' },
    { path: '/api/ai/chat-history', method: 'GET' }
  ];
  
  let allPassed = true;
  
  for (const endpoint of endpoints) {
    const passed = await new Promise((resolve) => {
      const options = {
        hostname: 'dev-proxy',
        port: 80,
        path: endpoint.path,
        method: endpoint.method,
        timeout: 10000
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const success = res.statusCode === 200;
          recordTest(`${endpoint.method} ${endpoint.path}`, success, success ? null : `HTTP ${res.statusCode}`);
          resolve(success);
        });
      });
      
      req.on('error', (error) => {
        recordTest(`${endpoint.method} ${endpoint.path}`, false, error.message);
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        recordTest(`${endpoint.method} ${endpoint.path}`, false, 'Timeout');
        resolve(false);
      });
      
      req.end();
    });
    
    if (!passed) allPassed = false;
    await sleep(500); // Small delay between requests
  }
  
  return allPassed;
}

// ===== Test 7: Use Site Auditor to Capture Console/Network Errors =====
async function testSiteAuditorCapturesErrors() {
  section('TEST 7: Site Auditor - Capture Console & Network Errors');
  
  try {
    // Ensure site auditor is built
    const cliPath = path.join(SITE_AUDITOR_DIR, 'dist', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      log('  Building site auditor...', 'yellow');
      try {
        execSync('npm ci --no-audit --no-fund', { cwd: SITE_AUDITOR_DIR, stdio: 'pipe' });
        execSync('npx -y tsc', { cwd: SITE_AUDITOR_DIR, stdio: 'pipe' });
      } catch (buildError) {
        recordTest('Site auditor captures errors on status page', false, 'Failed to build site auditor');
        return false;
      }
    }
    
    // Run site auditor on status page
    log('  Running site auditor on http://dev-proxy/status...', 'blue');
    const auditCmd = `node ${cliPath} http://dev-proxy/status --headless true --waitUntil load --timeout 30000 --wait 2000 --output ${ROOT}/.artifacts/audits`;
    
    let auditOutput;
    try {
      auditOutput = execSync(auditCmd, { 
        cwd: SITE_AUDITOR_DIR,
        encoding: 'utf8',
        timeout: 45000
      });
    } catch (error) {
      // Site auditor may exit with error if issues found, but still produces report
      auditOutput = error.stdout || error.stderr || '';
    }
    
    // Find and parse the report
    const reportMatch = auditOutput.match(/Report:\s*(.+?report\.json)/);
    if (!reportMatch) {
      recordTest('Site auditor captures errors on status page', false, 'No report generated');
      log(`  Output: ${auditOutput.slice(-500)}`, 'yellow');
      return false;
    }
    
    const reportPath = reportMatch[1].trim();
    if (!fs.existsSync(reportPath)) {
      recordTest('Site auditor captures errors on status page', false, 'Report file not found');
      return false;
    }
    
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    // Analyze the report
    const consoleErrors = (report.console?.errors?.length || 0) + (report.console?.pageErrors?.length || 0);
    const networkFailures = report.network?.failures?.length || 0;
    const httpIssues = report.network?.httpIssues?.length || 0;
    
    log(`  Console errors: ${consoleErrors}`, consoleErrors > 0 ? 'yellow' : 'blue');
    log(`  Network failures: ${networkFailures}`, networkFailures > 0 ? 'yellow' : 'blue');
    log(`  HTTP issues: ${httpIssues}`, httpIssues > 0 ? 'yellow' : 'blue');
    
    // Check for 504 errors specifically
    const has504Errors = (report.network?.failures || []).some(f => 
      f.url && f.url.includes('/api/ai/')
    );
    
    const http504Issues = (report.network?.responses || []).some(r =>
      r.status === 504 && r.url && r.url.includes('/api/ai/')
    );
    
    if (has504Errors || http504Issues) {
      recordTest('Site auditor captures errors on status page', true);
      log(`  ✓ Successfully captured 504 errors from /api/ai/ endpoints`, 'green');
      
      // Show specific failures
      const apiFailures = (report.network?.failures || [])
        .filter(f => f.url && f.url.includes('/api/ai/'))
        .slice(0, 5);
      
      if (apiFailures.length > 0) {
        log(`  \n  Captured failures:`, 'yellow');
        apiFailures.forEach(f => {
          log(`    - ${f.url}`, 'yellow');
        });
      }
      
      // Save detailed report for diagnosis
      log(`  \n  Full report saved to: ${reportPath}`, 'blue');
      return true;
    } else if (consoleErrors > 0 || networkFailures > 0) {
      recordTest('Site auditor captures errors on status page', true);
      log(`  ✓ Captured ${consoleErrors + networkFailures} total errors`, 'green');
      return true;
    } else {
      recordTest('Site auditor captures errors on status page', false, 'No errors captured (but we expect some)');
      return false;
    }
  } catch (error) {
    recordTest('Site auditor captures errors on status page', false, error.message);
    log(`  Error: ${error.stack}`, 'red');
    return false;
  }
}

// ===== Test 8: Check Docker Network Connectivity =====
async function testDockerNetworkConnectivity() {
  section('TEST 8: Docker Network Connectivity');
  
  try {
    // Check if both containers are on the same network
    const proxyNetwork = execSync('docker inspect dev-proxy --format "{{json .NetworkSettings.Networks}}"', {
      encoding: 'utf8',
      timeout: 5000
    });
    
    const apiNetwork = execSync('docker inspect dev-proxy-config-api --format "{{json .NetworkSettings.Networks}}"', {
      encoding: 'utf8',
      timeout: 5000
    });
    
    const proxyNetworks = JSON.parse(proxyNetwork);
    const apiNetworks = JSON.parse(apiNetwork);
    
    const sharedNetwork = Object.keys(proxyNetworks).find(net => net in apiNetworks);
    
    if (sharedNetwork) {
      recordTest('Containers on same Docker network', true);
      log(`  Shared network: ${sharedNetwork}`, 'blue');
      return true;
    } else {
      recordTest('Containers on same Docker network', false, 'No shared network found');
      log(`  Proxy networks: ${Object.keys(proxyNetworks).join(', ')}`, 'yellow');
      log(`  API networks: ${Object.keys(apiNetworks).join(', ')}`, 'yellow');
      return false;
    }
  } catch (error) {
    recordTest('Containers on same Docker network', false, error.message);
    return false;
  }
}

// ===== Test 9: Test API Response Time =====
async function testApiResponseTime() {
  section('TEST 9: API Response Time');
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const options = {
      hostname: 'dev-proxy-config-api',
      port: 3001,
      path: '/api/ai/health',
      method: 'GET',
      timeout: 30000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        const passed = responseTime < 5000; // Should respond within 5 seconds
        
        recordTest('API responds within acceptable time', passed, passed ? null : `Took ${responseTime}ms`);
        log(`  Response time: ${responseTime}ms`, responseTime < 5000 ? 'blue' : 'yellow');
        resolve(passed);
      });
    });
    
    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      recordTest('API responds within acceptable time', false, `${error.message} after ${responseTime}ms`);
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      recordTest('API responds within acceptable time', false, 'Timeout after 30s');
      resolve(false);
    });
    
    req.end();
  });
}

// ===== Main Test Runner =====
async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     CALLIOPE COMPREHENSIVE TEST SUITE (TDD)               ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  const startTime = Date.now();
  
  // Run tests in order
  await testApiContainerRunning();
  await testApiContainerLogs();
  await testDirectApiConnection();
  await testProxyRouteToApi();
  await testNginxConfigForApiRoutes();
  await testAllAiEndpoints();
  await testDockerNetworkConnectivity();
  await testApiResponseTime();
  await testSiteAuditorCapturesErrors();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Print summary
  section('TEST RESULTS SUMMARY');
  log(`\nTotal: ${results.tests.length} tests`, 'cyan');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, 'red');
  log(`Duration: ${duration}s`, 'blue');
  
  if (results.failed > 0) {
    log('\n Failed Tests:', 'red');
    results.tests.filter(t => !t.passed).forEach(t => {
      log(`  - ${t.name}`, 'red');
      if (t.error) log(`    ${t.error}`, 'yellow');
    });
  }
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { runAllTests };

