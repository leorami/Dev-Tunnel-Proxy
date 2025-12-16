#!/usr/bin/env python3
import re

# Read the file
with open('utils/proxyConfigAPI.js', 'r') as f:
    content = f.read()

# Add the configuration section after SESSION_FILE
config_section = '''
// ========================================
// API BASE PATH CONFIGURATION
// Centralized configuration for API endpoint namespacing
// ========================================
const PROXY_API_BASE_PATH = process.env.PROXY_API_BASE_PATH || '/devproxy/api';

// Helper to build API paths consistently
function apiPath(path) {
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${PROXY_API_BASE_PATH}/${cleanPath}`;
}
'''

# Insert after SESSION_FILE line
content = content.replace(
    "const SESSION_FILE = path.join(ARTIFACTS_DIR, 'admin-session.json');",
    "const SESSION_FILE = path.join(ARTIFACTS_DIR, 'admin-session.json');" + config_section
)

# Replace all /api/ endpoint checks with apiPath() calls
# Pattern: u.pathname === '/api/something'
content = re.sub(
    r"u\.pathname === '/api/([^']+)'",
    r"u.pathname === apiPath('\1')",
    content
)

# Pattern: u.pathname.startsWith('/api/something')
content = re.sub(
    r"u\.pathname\.startsWith\('/api/([^']+)'\)",
    r"u.pathname.startsWith(apiPath('\1'))",
    content
)

# Add /config endpoint after admin/check
config_endpoint = '''
    
    // GET /config - Public endpoint for frontend configuration
    // Returns API base path and other client configuration
    if (req.method === 'GET' && u.pathname === '/config'){
      return send(res, 200, {
        apiBasePath: PROXY_API_BASE_PATH,
        version: '1.0.0'
      });
    }
'''

content = content.replace(
    '''    // ========================================
    // PROTECTED ROUTES - Require Authentication
    // ========================================''',
    config_endpoint + '''
    // ========================================
    // PROTECTED ROUTES - Require Authentication
    // ========================================'''
)

# Update the protected paths arrays
old_public = '''    // Public endpoints that don't require authentication
    const publicEndpoints = [
      '/api/ai/health',
      '/api/ai/stats',
      '/api/ai/thoughts',
      '/api/overrides/conflicts'
    ];'''

new_public = '''    // Public endpoints that don't require authentication
    const publicEndpoints = [
      apiPath('ai/health'),
      apiPath('ai/stats'),
      apiPath('ai/thoughts'),
      apiPath('overrides/conflicts')
    ];'''

content = content.replace(old_public, new_public)

old_protected = '''    // Protect all admin/management endpoints (except public ones)
    const protectedPaths = [
      '/api/apps/',
      '/api/config/',
      '/api/overrides/',
      '/api/reports/',
      '/api/ai/',
      '/api/resolve-conflict',
      '/api/rename-route'
    ];'''

new_protected = '''    // Protect all admin/management endpoints (except public ones)
    const protectedPaths = [
      apiPath('apps/'),
      apiPath('config/'),
      apiPath('overrides/'),
      apiPath('reports/'),
      apiPath('ai/'),
      apiPath('resolve-conflict'),
      apiPath('rename-route')
    ];'''

content = content.replace(old_protected, new_protected)

# Update the debug logging
content = content.replace(
    "if (u.pathname.startsWith('/api/')) {",
    "if (u.pathname.startsWith(PROXY_API_BASE_PATH)) {"
)

# Write the file
with open('utils/proxyConfigAPI.js', 'w') as f:
    f.write(content)

print("✅ Fixed all API paths")

