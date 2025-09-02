const http = require('http');
const https = require('https');

function request(url, { method = 'GET', headers = {}, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(url, { method, headers, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
        resolve({ ok: false, error: 'timeout' });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.end();
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

async function checkLocalhost(route) {
  // dev-proxy is published on host 8080
  const url = `http://localhost:8080${route}`;
  return request(url, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'dev-proxy-check/1.0',
    },
    timeoutMs: 4000,
  });
}

async function checkNgrok(baseUrl, route) {
  const url = `${baseUrl.replace(/\/$/, '')}${route}`;
  return request(url, {
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'dev-proxy-check/1.0',
    },
    timeoutMs: 6000,
  });
}

module.exports = {
  checkLocalhost,
  checkNgrok,
};


