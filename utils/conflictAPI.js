#!/usr/bin/env node

/**
 * Conflict Management API Server
 * 
 * Provides REST endpoints for the conflict management UI:
 * - GET /api/config/:file - View config file contents
 * - POST /api/config/:file - Save config file contents  
 * - POST /api/resolve-conflict - Change which config wins a conflict
 * - POST /api/rename-route - Rename a route in a config file
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { loadResolutions, saveResolutions } = require('./conflictResolver');

const APPS_DIR = path.join(__dirname, '..', 'apps');
const PORT = process.env.CONFLICT_API_PORT || 3001;

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(text);
}

function getConfigPath(configFile) {
  // Validate filename to prevent directory traversal
  if (!configFile || !/^[a-zA-Z0-9_-]+\.conf$/.test(configFile)) {
    throw new Error('Invalid config filename');
  }
  return path.join(APPS_DIR, configFile);
}

async function handleGetConfig(res, configFile) {
  try {
    const configPath = getConfigPath(configFile);
    
    if (!fs.existsSync(configPath)) {
      return sendText(res, 'Config file not found', 404);
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    sendText(res, content);
  } catch (error) {
    console.error('Error reading config:', error);
    sendText(res, error.message, 400);
  }
}

async function handleSaveConfig(req, res, configFile) {
  try {
    const configPath = getConfigPath(configFile);
    
    // Read request body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // Basic nginx config validation
        if (!body.trim()) {
          return sendText(res, 'Config content cannot be empty', 400);
        }
        
        // Check for basic nginx syntax
        if (!body.includes('location') && !body.includes('#')) {
          return sendText(res, 'Config appears to be invalid (no location blocks found)', 400);
        }
        
        // Create backup before saving
        if (fs.existsSync(configPath)) {
          const backupPath = `${configPath}.backup.${Date.now()}`;
          fs.copyFileSync(configPath, backupPath);
          console.log(`Created backup: ${backupPath}`);
        }
        
        // Save new content
        fs.writeFileSync(configPath, body, 'utf8');
        console.log(`Config saved: ${configFile}`);
        
        sendText(res, 'Config saved successfully');
      } catch (error) {
        console.error('Error saving config:', error);
        sendText(res, error.message, 500);
      }
    });
  } catch (error) {
    console.error('Error in handleSaveConfig:', error);
    sendText(res, error.message, 400);
  }
}

async function handleResolveConflict(req, res) {
  try {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { route, winner } = JSON.parse(body);
        
        if (!route || !winner) {
          return sendJSON(res, { error: 'Missing route or winner' }, 400);
        }
        
        // Load existing resolutions
        const resolutions = loadResolutions();
        
        // Update the resolution
        resolutions[route] = {
          winner,
          resolvedAt: new Date().toISOString(),
          strategy: 'manual-selection'
        };
        
        // Save updated resolutions
        saveResolutions(resolutions);
        
        console.log(`Conflict resolved: ${route} -> ${winner}`);
        sendJSON(res, { success: true, route, winner });
      } catch (error) {
        console.error('Error resolving conflict:', error);
        sendJSON(res, { error: error.message }, 400);
      }
    });
  } catch (error) {
    console.error('Error in handleResolveConflict:', error);
    sendJSON(res, { error: error.message }, 500);
  }
}

async function handleRenameRoute(req, res) {
  try {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { oldRoute, newRoute, configFile } = JSON.parse(body);
        
        if (!oldRoute || !newRoute || !configFile) {
          return sendJSON(res, { error: 'Missing required parameters' }, 400);
        }
        
        const configPath = getConfigPath(configFile);
        
        if (!fs.existsSync(configPath)) {
          return sendJSON(res, { error: 'Config file not found' }, 404);
        }
        
        // Read current config
        let content = fs.readFileSync(configPath, 'utf8');
        
        // Create backup
        const backupPath = `${configPath}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, content);
        
        // Simple route renaming - replace location blocks
        // This is a basic implementation - could be enhanced with proper nginx parsing
        const oldLocationRegex = new RegExp(`location\\s+([^\\s]*\\s+)?${oldRoute.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}([^\\s]*)?\\s*\\{`, 'g');
        const newContent = content.replace(oldLocationRegex, (match) => {
          return match.replace(oldRoute, newRoute);
        });
        
        if (newContent === content) {
          return sendJSON(res, { error: `Route ${oldRoute} not found in ${configFile}` }, 404);
        }
        
        // Save updated config
        fs.writeFileSync(configPath, newContent);
        
        console.log(`Route renamed: ${oldRoute} -> ${newRoute} in ${configFile}`);
        sendJSON(res, { success: true, oldRoute, newRoute, configFile });
      } catch (error) {
        console.error('Error renaming route:', error);
        sendJSON(res, { error: error.message }, 500);
      }
    });
  } catch (error) {
    console.error('Error in handleRenameRoute:', error);
    sendJSON(res, { error: error.message }, 500);
  }
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }
    
    try {
      // Route handling
      if (pathname.startsWith('/api/config/')) {
        const configFile = pathname.split('/api/config/')[1];
        
        if (method === 'GET') {
          await handleGetConfig(res, configFile);
        } else if (method === 'POST') {
          await handleSaveConfig(req, res, configFile);
        } else {
          sendJSON(res, { error: 'Method not allowed' }, 405);
        }
      } else if (pathname === '/api/resolve-conflict' && method === 'POST') {
        await handleResolveConflict(req, res);
      } else if (pathname === '/api/rename-route' && method === 'POST') {
        await handleRenameRoute(req, res);
      } else {
        sendJSON(res, { error: 'Not found' }, 404);
      }
    } catch (error) {
      console.error('Server error:', error);
      sendJSON(res, { error: 'Internal server error' }, 500);
    }
  });
  
  return server;
}

if (require.main === module) {
  const server = createServer();
  
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Conflict Management API running on http://127.0.0.1:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /api/config/:file - View config file');
    console.log('  POST /api/config/:file - Save config file');
    console.log('  POST /api/resolve-conflict - Resolve route conflict');
    console.log('  POST /api/rename-route - Rename route in config');
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Shutting down Conflict Management API...');
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = { createServer };
