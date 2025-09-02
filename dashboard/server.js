const express = require('express');
const app = express();
const port = process.env.PORT || 2000;

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

// Route that matches the /mxtk/ path
app.get('/mxtk/', (req, res) => {
  res.json({
    message: 'Dashboard - /mxtk/ endpoint',
    timestamp: new Date().toISOString(),
    path: req.path,
    baseUrl: req.baseUrl
  });
});

// Catch-all route for /mxtk/* paths
app.get('/mxtk/*', (req, res) => {
  res.json({
    message: 'Dashboard - dynamic route',
    timestamp: new Date().toISOString(),
    path: req.path,
    originalUrl: req.originalUrl
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
