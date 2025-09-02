#!/usr/bin/env node
const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchUrl(rawUrl, { timeoutMs = 10000, headers = {} } = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(rawUrl);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + (urlObj.search || ''),
          method: 'GET',
          headers: Object.assign(
            {
              'user-agent': 'dev-proxy-asset-probe/1.0',
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

function extractUrls(baseUrl, html) {
  const urls = new Set();
  // <script src="...">
  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  // <link href="..." rel="stylesheet"> and other links
  const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
  // <img src="...">
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  // CSS url(...) within inline styles
  const cssUrlRe = /url\(([^)]+)\)/gi;

  const add = (u) => {
    if (!u) return;
    // ignore data: urls
    if (/^data:/i.test(u)) return;
    try {
      const absolute = new URL(u, baseUrl).toString();
      urls.add(absolute);
    } catch {}
  };

  let m;
  while ((m = scriptRe.exec(html)) !== null) add(m[1]);
  while ((m = linkRe.exec(html)) !== null) add(m[1]);
  while ((m = imgRe.exec(html)) !== null) add(m[1]);
  while ((m = cssUrlRe.exec(html)) !== null) {
    const raw = m[1].trim().replace(/^['"]|['"]$/g, '');
    add(raw);
  }

  return Array.from(urls);
}

async function probe(baseUrl) {
  const page = await fetchUrl(baseUrl);
  const assets = [];
  if (page.ok) {
    const urls = extractUrls(baseUrl, page.body || '');
    const fetches = urls.map(async (u) => {
      const res = await fetchUrl(u);
      let key = null;
      try {
        const uo = new URL(u);
        key = uo.pathname + (uo.search || '');
      } catch {}
      return {
        url: u,
        key,
        ok: !!res.ok,
        status: res.status || 0,
        type: (res.headers && (res.headers['content-type'] || '')) || '',
        size: res.size || 0,
        error: res.error || null,
      };
    });
    const results = await Promise.all(fetches);
    assets.push(...results);
  }
  return {
    base: baseUrl,
    page: { ok: !!page.ok, status: page.status || 0, error: page.error || null },
    assets,
  };
}

function compare(a, b) {
  const mapA = new Map(a.assets.map((x) => [x.key || x.url, x]));
  const mapB = new Map(b.assets.map((x) => [x.key || x.url, x]));
  const allKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
  const differences = [];
  for (const k of allKeys) {
    const left = mapA.get(k);
    const right = mapB.get(k);
    if (!left) {
      differences.push({ key: k, onlyIn: 'right', rightUrl: right.url });
      continue;
    }
    if (!right) {
      differences.push({ key: k, onlyIn: 'left', leftUrl: left.url });
      continue;
    }
    if (left.ok !== right.ok || left.status !== right.status) {
      differences.push({
        key: k,
        left: { status: left.status, ok: left.ok, url: left.url },
        right: { status: right.status, ok: right.ok, url: right.url },
      });
    }
  }
  return differences;
}

async function main() {
  const [left, right] = process.argv.slice(2);
  if (!left || !right) {
    console.error('Usage: assetProbe <leftUrl> <rightUrl>');
    process.exit(2);
  }
  const [resLeft, resRight] = await Promise.all([probe(left), probe(right)]);
  const diff = compare(resLeft, resRight);
  const report = {
    summary: {
      left: resLeft.base,
      right: resRight.base,
      pageLeft: resLeft.page,
      pageRight: resRight.page,
      counts: { left: resLeft.assets.length, right: resRight.assets.length, diff: diff.length },
    },
    differences: diff,
  };
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { probe, compare };


