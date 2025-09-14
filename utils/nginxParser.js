const fs = require('fs');
const path = require('path');
const { applyResolutions } = require('./conflictResolver');

/**
 * Parse Nginx app config files under apps/ and extract testable route prefixes
 * with their upstream targets. This is a best-effort lightweight parser that
 * looks for `location` blocks and associated `proxy_pass` directives.
 * - Supports `proxy_pass http://host:port` and `proxy_pass $var` with `set $var http://...`.
 * - Ignores internal dev-only paths like Next.js internals.
 */
function parseAppsDirectory(appsDir) {
  // Include overrides/*.conf first (override precedence), then apps/*.conf
  const rootDir = path.dirname(appsDir);
  const candidates = [];

  const tryList = (dir) => {
    try { return fs.readdirSync(dir).filter(f => f.endsWith('.conf') && !f.startsWith('.')).map(f => path.join(dir, f)); }
    catch { return []; }
  };

  const overridesDir = path.join(rootDir, 'overrides');
  candidates.push(...tryList(overridesDir));
  candidates.push(...tryList(appsDir));

  const results = [];
  for (const fullPath of candidates) {
    const text = fs.readFileSync(fullPath, 'utf8').trim();
    if (!text) continue;
    const rel = path.relative(rootDir, fullPath) || path.basename(fullPath);
    const parsed = parseSingleFile(text, { file: rel });
    results.push(...parsed);
  }

  // Detect route conflicts (multiple files declaring same route)
  const routeMap = new Map();
  const conflicts = new Map();
  
  for (const r of results) {
    const key = `${r.route}`;
    if (!routeMap.has(key)) {
      routeMap.set(key, r);
    } else {
      // Conflict detected!
      if (!conflicts.has(key)) {
        conflicts.set(key, [routeMap.get(key)]);
      }
      conflicts.get(key).push(r);
    }
  }
  
  const initialRoutes = Array.from(routeMap.values());
  
  // Apply conflict resolution
  const resolution = applyResolutions(initialRoutes, conflicts);
  
  // Attach conflict information and warnings to results
  const finalRoutes = resolution.routes;
  finalRoutes.conflicts = conflicts;
  finalRoutes.conflictWarnings = resolution.warnings;
  finalRoutes.conflictSummary = resolution.conflictSummary;
  
  return finalRoutes;
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
  // - ~* ^/myapp(?<rest>/.*)?$  
  // - ^~ /_next/
  // - ~ ^/mxtk/?$
  // We want a testable public route prefix.

  const trimmed = pathSpec.trim();
  // Strip modifiers like =, ~, ~*, ^~ at start
  const noMod = trimmed.replace(/^([=~\^~*]+)\s+/, '');

  // If regex-style beginning with ^/, try to extract the first literal segment
  if (noMod.startsWith('^/')) {
    // Common patterns: 
    // ^/myapp(?<rest>/.*)?$ -> /myapp/
    // ^/mxtk/?$ -> /mxtk/
    // ^/mxtk/_next/(.+)$ -> /mxtk/_next/
    // ^/mxtk/.+ -> ignore (too broad)
    
    // First, handle patterns that should be ignored
    if (noMod.match(/\^\/.+\.\+/)) {
      // Patterns like ^/mxtk/.+ are too broad - ignore them
      return null;
    }
    
    // Extract the literal path portion
    const pathMatch = noMod.match(/^\^\/([^\/\(\?\$\*\+\.]+(?:\/[^\/\(\?\$\*\+\.]+)*)/);
    if (pathMatch) {
      const path = pathMatch[1];
      // Ensure trailing slash for directory-like routes
      return path.endsWith('/') ? `/${path}` : `/${path}/`;
    }
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
  const assetBuckets = ['/organizations/', '/minerals/', '/media/'];
  if (assetBuckets.some(p => route.startsWith(p))) return true;

  // Generic rule: root-level dev-helper routes should be ignored.
  // App routes must live under an app prefix; helpers like @vite, @id, @fs,
  // node_modules, sb-* should not appear at the proxy root.
  const devHelperRoots = [
    '/@vite/', '/@id/', '/@fs/', '/node_modules/',
    '/sb-manager/', '/sb-addons/', '/sb-common-assets/',
    '/src/'
  ];
  const isDevHelperRoot = devHelperRoots.some(p => route.startsWith(p));
  if (isDevHelperRoot) return true;
  if (route === '/storybook-server-channel/' || route === '/storybook-server-channel') return true;
  return false;
}

module.exports = {
  parseAppsDirectory,
};


