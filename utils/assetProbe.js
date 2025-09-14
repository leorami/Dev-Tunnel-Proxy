#!/usr/bin/env node
const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchUrl(rawUrl, { timeoutMs = 3000, headers = {}, method = 'HEAD' } = {}) {
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
          method,
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
          // For HEAD, no body is expected
          if (method === 'HEAD') {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: res.headers,
              size: 0,
              body: '',
            });
            return;
          }
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
    // ignore javascript:, fragments, and obvious non-urls
    if (/^(javascript:|#)/i.test(u)) return;
    if (/^window\.location/i.test(u)) return;
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

async function probe(baseUrl, { restrictToSameOrigin = true, restrictToRouteBase = '' } = {}) {
  const page = await fetchUrl(baseUrl);
  const assets = [];
  let filtered = [];
  if (page.ok) {
    const urls = extractUrls(baseUrl, page.body || '');
    try {
      const base = new URL(baseUrl);
      filtered = urls.filter((u) => {
        try {
          const abs = new URL(u, baseUrl);
          if (restrictToSameOrigin && abs.origin !== base.origin) return false;
          if (restrictToRouteBase) {
            const basePath = restrictToRouteBase.endsWith('/') ? restrictToRouteBase : restrictToRouteBase + '/';
            if (!abs.pathname.startsWith(basePath)) return false;
          }
          return true;
        } catch { return false; }
      });
    } catch { filtered = urls; }

    const fetches = filtered.map(async (u) => {
      const res = await fetchUrl(u);
      let key = null;
      try {
        const uo = new URL(u);
        key = uo.pathname + (uo.search || '');
      } catch {}
      // MIME validation: many module fetch failures are 200 text/html fallbacks
      const contentType = (res.headers && (res.headers['content-type'] || '')) || '';
      const pathLower = (key || u).toLowerCase();
      const looksLikeJs = /\.(js|mjs|jsx|ts|tsx)(\?|$)/.test(pathLower) || /(^\/@id\/|^\/@vite\/|^\/@fs\/)/.test(pathLower);
      const looksLikeCss = /\.(css)(\?|$)/.test(pathLower);
      const looksLikeWasm = /\.(wasm)(\?|$)/.test(pathLower);
      const isHtml = /text\/html/i.test(contentType);
      const isJs = /javascript|ecmascript|module/i.test(contentType);
      const isCss = /text\/css/i.test(contentType);
      const isWasm = /application\/wasm/i.test(contentType);
      let mimeOk = true;
      if (looksLikeJs) mimeOk = isJs && !isHtml;
      else if (looksLikeCss) mimeOk = isCss && !isHtml;
      else if (looksLikeWasm) mimeOk = isWasm && !isHtml;
      // Consider text/html for asset-looking paths as a failure even if 200
      const ok = !!res.ok && mimeOk;
      return {
        url: u,
        key,
        ok,
        status: res.status || 0,
        type: contentType,
        size: res.size || 0,
        error: res.error || null,
        mimeOk,
      };
    });
    const results = await Promise.all(fetches);
    assets.push(...results);
  }
  return {
    base: baseUrl,
    page: { ok: !!page.ok, status: page.status || 0, error: page.error || null },
    assets,
    checkedCount: assets.length,
    failed: assets.filter(x => !x.ok),
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


