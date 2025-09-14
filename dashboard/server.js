const express = require('express');
const app = express();
const port = process.env.PORT || 2000;
const path = require('path');
const fs = require('fs');
const CALLIOPE_API = process.env.CALLIOPE_API || 'http://localhost:3001';

// Middleware to parse JSON
app.use(express.json());
// Serve static assets from public
app.use(express.static('public'));

// Basic route for health check
app.get('/', (req, res) => {
  res.json({
    message: 'Dashboard dev app running',
    timestamp: new Date().toISOString(),
    port: port
  });
});

// Serve routes.json from repo root for per-route UI
app.get('/routes', (req, res) => {
  try {
    const p = path.join(__dirname, '..', 'routes.json');
    if (!fs.existsSync(p)) return res.status(404).json({ ok:false, error:'routes.json not found' });
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// Minimal proxy to Calliope AI API to avoid CORS during local dev
app.post('/proxy/ai/audit', async (req, res) => {
  try {
    const r = await fetch(CALLIOPE_API + '/api/ai/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/proxy/ai/audit-and-heal', async (req, res) => {
  try {
    const r = await fetch(CALLIOPE_API + '/api/ai/audit-and-heal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/proxy/ai/advanced-heal', async (req, res) => {
  try {
    const r = await fetch(CALLIOPE_API + '/api/ai/advanced-heal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.get('/proxy/ai/thoughts', async (req, res) => {
  try {
    const r = await fetch(CALLIOPE_API + '/api/ai/thoughts');
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

// Generic dynamic route handler for testing any proxy path
app.get('*', (req, res) => {
  // Skip favicon requests and static assets
  if (req.path === '/favicon.ico' || req.path.startsWith('/static/')) {
    return res.status(404).send('Not Found');
  }
  
  res.json({
    message: 'Dashboard - dynamic route handler',
    timestamp: new Date().toISOString(),
    path: req.path,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'dashboard' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Dashboard dev app running on port ${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
});
