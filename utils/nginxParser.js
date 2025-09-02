const fs = require('fs');
const path = require('path');

/**
 * Parse Nginx app config files under apps/ and extract testable route prefixes
 * with their upstream targets. This is a best-effort lightweight parser that
 * looks for `location` blocks and associated `proxy_pass` directives.
 * - Supports `proxy_pass http://host:port` and `proxy_pass $var` with `set $var http://...`.
 * - Ignores internal dev-only paths like Next.js internals.
 */
function parseAppsDirectory(appsDir) {
  const files = fs.readdirSync(appsDir).filter(f => f.endsWith('.conf'));
  const results = [];

  for (const file of files) {
    const fullPath = path.join(appsDir, file);
    const text = fs.readFileSync(fullPath, 'utf8');
    const parsed = parseSingleFile(text, { file });
    results.push(...parsed);
  }

  // De-duplicate by route path
  const deduped = new Map();
  for (const r of results) {
    const key = `${r.route}`;
    if (!deduped.has(key)) deduped.set(key, r);
  }
  return Array.from(deduped.values());
}

function parseSingleFile(text, meta = {}) {
  // Capture variable sets: set $name http://host:port;
  const varMap = {};
  const setRe = /\bset\s+\$([A-Za-z0-9_\-]+)\s+([^;]+);/g;
  let m;
  while ((m = setRe.exec(text)) !== null) {
    varMap[`$${m[1]}`] = m[2].trim();
  }

  // Roughly capture location blocks. We'll do a naive brace-matching scan.
  const locations = extractLocationBlocks(text);
  const entries = [];

  for (const loc of locations) {
    const route = normalizeLocationPath(loc.path);
    if (!route) continue;
    if (shouldIgnoreRoute(route)) continue;

    // Find proxy_pass within the block
    const proxyPassMatch = loc.body.match(/\bproxy_pass\s+([^;]+);/);
    if (!proxyPassMatch) continue;
    let upstream = proxyPassMatch[1].trim();

    // Resolve variable indirection
    if (upstream.startsWith('$') && varMap[upstream]) {
      upstream = varMap[upstream];
    }

    // In patterns like http://host:port$rest or http://host:port$var
    upstream = upstream.replace(/\$[A-Za-z0-9_\-]+$/, '');
    upstream = upstream.replace(/\/$/, '');

    entries.push({
      sourceFile: meta.file,
      rawLocation: loc.path,
      route,
      upstream,
    });
  }

  return entries;
}

function extractLocationBlocks(text) {
  const blocks = [];
  const locRe = /location\s+([^\{]+)\{/g;
  let match;
  while ((match = locRe.exec(text)) !== null) {
    const startIdx = match.index + match[0].length;
    const pathSpec = match[1].trim();

    // Find matching closing brace for this block
    let depth = 1;
    let i = startIdx;
    while (i < text.length && depth > 0) {
      const ch = text[i++];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const endIdx = i;
    const body = text.slice(startIdx, endIdx - 1);
    blocks.push({ path: pathSpec, body });
  }
  return blocks;
}

function normalizeLocationPath(pathSpec) {
  // pathSpec examples:
  // - /impact/
  // - = / (exact)
  // - ~* ^/mxtk(?<rest>/.*)?$
  // - ^~ /_next/
  // We want a testable public route prefix.

  const trimmed = pathSpec.trim();
  // Strip modifiers like =, ~, ~*, ^~ at start
  const noMod = trimmed.replace(/^([=~\^~]+)\s+/, '');

  // If regex-style beginning with ^/, try to extract the first literal segment
  if (noMod.startsWith('^/')) {
    // Common pattern: ^/mxtk(?<rest>/.*)?$
    const m = noMod.match(/^\^\/(\w+)/);
    if (m) return `/${m[1]}/`;
    return null;
  }

  // If exact "= /" or narrow internals, skip
  if (noMod === '/' || noMod === '/_next' || noMod === '/_next/' || noMod.startsWith('/__next')) {
    return null;
  }

  // If standard path, ensure trailing slash for directory-like routes
  if (noMod.startsWith('/')) {
    // If it looks like a file extension, skip (favicon, etc.)
    if (/\.[A-Za-z0-9]+$/.test(noMod)) return null;
    return noMod.endsWith('/') ? noMod : `${noMod}/`;
  }

  return null;
}

function shouldIgnoreRoute(route) {
  // Ignore common internal or asset buckets by default
  if (route.startsWith('/_next')) return true;
  if (route.startsWith('/__next')) return true;
  if (route.startsWith('/favicon')) return true;
  if (route.startsWith('/logo-')) return true;
  const assetBuckets = ['/art/', '/icons/', '/organizations/', '/minerals/', '/media/'];
  if (assetBuckets.some(p => route.startsWith(p))) return true;
  return false;
}

module.exports = {
  parseAppsDirectory,
};


