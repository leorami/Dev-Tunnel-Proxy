const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchRaw(rawUrl, { timeoutMs = 8000, headers = {} } = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(rawUrl);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          method: 'GET',
          headers: Object.assign(
            {
              'user-agent': 'dev-proxy-api-probe/1.0',
              'ngrok-skip-browser-warning': 'true',
            },
            headers
          ),
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: res.headers,
              size: buf.length,
              body: buf.toString('utf8'),
            });
          });
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
        resolve({ ok: false, error: 'timeout' });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function extractApiCandidatesFromHtml(html) {
  const set = new Set();
  if (!html) return [];
  // Common patterns: fetch('/api/...'), axios('/api/...'), axios.get('/api/...')
  const patterns = [
    /fetch\(\s*['"](\/[^'"\)]+)['"]/gi,
    /axios(?:\.get|\.post|\.put|\.delete|\.patch)?\(\s*['"](\/[^'"\)]+)['"]/gi,
    /url\s*:\s*['"](\/[^'"\)]+)['"]/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const p = (m[1] || '').trim();
      if (p.startsWith('/api') || p.startsWith('/mxtk/api')) set.add(p);
    }
  }
  // Fallback plain '/api/...'
  const plain = html.match(/['"](\/api\/[^'"\s]+)['"]/gi) || [];
  plain.forEach((s) => {
    const m = s.match(/['"](\/api\/[^'"\s]+)['"]/i);
    if (m) set.add(m[1]);
  });
  return Array.from(set);
}

function extractApiCandidatesFromJs(jsText) {
  return extractApiCandidatesFromHtml(jsText);
}

async function checkEndpoint(baseUrl, path) {
  const url = new URL(path, baseUrl).toString();
  const started = Date.now();
  const res = await fetchRaw(url);
  const latencyMs = Date.now() - started;
  let json = null;
  try {
    if (res.ok && res.body && /json/i.test(res.headers['content-type'] || '')) {
      json = JSON.parse(res.body);
    }
  } catch {}
  return {
    path,
    url,
    ok: !!res.ok,
    status: res.status || 0,
    latencyMs,
    contentType: res.headers ? res.headers['content-type'] : undefined,
    server: res.headers ? res.headers['server'] : undefined,
    size: res.size || 0,
    jsonSample: json && typeof json === 'object' ? Object.keys(json).slice(0, 5) : null,
    error: res.error || null,
  };
}

async function testApiSet(baseUrl, candidates) {
  const unique = Array.from(new Set(candidates));
  const checks = await Promise.all(unique.map((p) => checkEndpoint(baseUrl, p)));
  return checks;
}

async function tryWsUpgrade(baseUrl) {
  try {
    const u = new URL(baseUrl);
    const path = '/_next/webpack-hmr';
    const lib = u.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      const req = lib.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path,
          method: 'GET',
          headers: {
            Host: u.hostname,
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': '13',
            'ngrok-skip-browser-warning': 'true',
          },
          timeout: 5000,
        },
        (res) => {
          resolve({ status: res.statusCode, ok: res.statusCode === 101 });
        }
      );
      req.on('timeout', () => { req.destroy(new Error('timeout')); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.end();
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  fetchRaw,
  extractApiCandidatesFromHtml,
  extractApiCandidatesFromJs,
  testApiSet,
  tryWsUpgrade,
};


