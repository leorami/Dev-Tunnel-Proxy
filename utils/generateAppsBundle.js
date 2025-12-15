#!/usr/bin/env node
/*
  Compose app configs with proxy-owned overrides into a single generated file
  used by Nginx. Precedence: overrides > apps. No app names are hardcoded.

  Inputs:
    - appsDir:   ./apps/*.conf           (ignored in git; provided by engineers)
    - overrides: ./overrides/*.conf      (generic proxy-owned snippets)

  Output:
    - build/sites-enabled/apps.generated.conf

  Notes:
    - We only emit location blocks and related directives expected inside the
      main server block defined in config/default.conf.
    - Duplicate routes are resolved by keeping the override version and
      skipping conflicting app blocks.
*/

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT_DIR, 'apps');
const OVERRIDES_DIR = path.join(ROOT_DIR, 'overrides');
const OUTPUT_DIR = path.join(ROOT_DIR, 'build', 'sites-enabled');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'apps.generated.conf');
const ARTIFACTS_DIR = path.join(ROOT_DIR, '.artifacts');
const CONFLICTS_FILE = path.join(ARTIFACTS_DIR, 'override-conflicts.json');

function readTextFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return null;
  }
}

function listConfFiles(dir) {
  try {
    const entries = fs.readdirSync(dir);
    return entries
      .filter((f) => f.endsWith('.conf') && !f.startsWith('.'))
      .map((f) => path.join(dir, f))
      .sort();
  } catch (_err) {
    return [];
  }
}

// Determine if a pathSpec represents a root-level dev-helper route that should not be exposed
function isRootLevelDevHelper(pathSpec) {
  try {
    const ps = String(pathSpec || '').trim();
    // Drop root catch-alls that conflict with server-level routes
    if (/^=\s*\/(?:$|index\.html$|iframe\.html$)/.test(ps)) {
      return true;
    }
    // Allow only /<prefix>/..., disallow direct root helpers
    const disallowedRoots = [
      '/@vite/', '/@id/', '/@fs/', '/node_modules/', '/.storybook/', '/vite-inject-mocker-entry.js'
    ];
    for (const root of disallowedRoots) {
      const rx = new RegExp(String.raw`^([=~\^~*]+\s+)?` + root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (rx.test(ps)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function extractLocationBlocksWithText(text) {
  const blocks = [];
  if (!text) return blocks;

  // Find each "location" start and capture until its matching closing brace
  const re = /(^|\n)\s*location\s+([^\{]+)\{/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    // Start at the exact 'l' of the 'location' token
    const locStart = text.indexOf('location', match.index);
    if (locStart === -1) continue;
    // Find the first '{' after 'location'
    const braceOpen = text.indexOf('{', locStart);
    if (braceOpen === -1) continue;
    const pathSpec = match[2].trim();
    // Brace matching starting just after '{'
    let depth = 1;
    let i = braceOpen + 1;
    while (i < text.length && depth > 0) {
      const ch = text[i++];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const bodyEnd = i; // position after the closing brace
    const fullText = text.slice(locStart, bodyEnd);
    const body = text.slice(braceOpen + 1, bodyEnd - 1);
    blocks.push({ pathSpec, body, fullText });
  }
  return blocks;
}

function normalizeLocationPath(pathSpec) {
  const trimmed = pathSpec.trim();
  const noMod = trimmed.replace(/^([=~\^~*]+)\s+/, '');

  if (noMod.startsWith('^/')) {
    if (noMod.match(/\^\/.+\.+/)) return null; // too broad
    const pathMatch = noMod.match(/^\^\/([^\/\(\?\$\*\+\.]+(?:\/[^\/\(\?\$\*\+\.]+)*)/);
    if (pathMatch) {
      const p = pathMatch[1];
      return p.endsWith('/') ? `/${p}` : `/${p}/`;
    }
    return null;
  }

  if (noMod === '/' || noMod === '/_next' || noMod === '/_next/' || noMod.startsWith('/__next')) {
    return null;
  }
  if (noMod.startsWith('/')) {
    if (/\.[A-Za-z0-9]+$/.test(noMod)) return null;
    return noMod.endsWith('/') ? noMod : `${noMod}/`;
  }
  return null;
}

function buildKeySetFromBlocks(blocks) {
  const keys = new Set();
  for (const b of blocks) {
    const exactKey = `raw:${b.pathSpec.trim()}`;
    keys.add(exactKey);
    const normalized = normalizeLocationPath(b.pathSpec);
    if (normalized) keys.add(`norm:${normalized}`);
  }
  return keys;
}

// Remove duplicate location blocks by exact pathSpec, keeping the first occurrence
function removeDuplicateLocationBlocksFromText(text) {
  try {
    const blocks = extractLocationBlocksWithText(text);
    // First pass: choose best block per normalized path using priority
    const byNormBest = new Map(); // norm -> {idx, priority}
    function modPriority(pathSpec) {
      const spec = pathSpec.trim();
      if (/^~\*?\s+\^\//.test(spec) || /^~\s+\^\//.test(spec) || /^\^\//.test(spec)) return 3; // regex
      if (/^=\s+\//.test(spec)) return 2; // exact
      if (/^\^~\s+\//.test(spec)) return 1; // prefix
      if (/^\//.test(spec)) return 0; // plain prefix
      return 0;
    }
    blocks.forEach((b, idx) => {
      const spec = b.pathSpec.trim();
      const isExact = /^=\s+\//.test(spec);
      // Important: Do NOT consider exact matches (e.g. "= /sdk") as duplicates of their
      // corresponding prefix routes (e.g. "/sdk/"). We want both to coexist.
      if (isExact) return;
      const norm = normalizeLocationPath(b.pathSpec);
      if (!norm) return;
      const key = `norm:${norm}`;
      const pr = modPriority(b.pathSpec);
      const cur = byNormBest.get(key);
      if (!cur || pr > cur.priority) {
        byNormBest.set(key, { idx, priority: pr });
      }
    });

    // Second pass: remove duplicates not selected as best for their normalized path, and raw duplicates
    const seenRaw = new Set();
    let out = text;
    blocks.forEach((b, idx) => {
      const spec = b.pathSpec.trim();
      const rawKey = spec.replace(/^([=~\^~*]+)\s+/, '');
      const isExact = /^=\s+\//.test(spec);
      const norm = normalizeLocationPath(b.pathSpec);
      const normKey = norm ? `norm:${norm}` : null;
      const best = normKey ? byNormBest.get(normKey) : null;
      // Keep all exact-match blocks; only dedupe among non-exact blocks for the same normalized path
      const keepForNorm = isExact ? true : (best ? best.idx === idx : true);
      if (!keepForNorm || seenRaw.has(rawKey)) {
        out = out.replace(b.fullText, `# removed duplicate location ${rawKey}`);
        return;
      }
      seenRaw.add(rawKey);
    });
    return out;
  } catch {
    return text;
  }
}

function collectBlocksFromFiles(files) {
  const allBlocks = [];
  for (const file of files) {
    const text = readTextFileSafe(file);
    if (!text) continue;
    const blocks = extractLocationBlocksWithText(text);
    for (const b of blocks) {
      allBlocks.push({ ...b, sourceFile: file });
    }
  }
  return allBlocks;
}

function extractRegexProtectedPrefixes(blocks) {
  const prefixes = new Set();
  for (const b of blocks) {
    const ps = String(b.pathSpec || '').trim();
    // Look for caret-regex starting with ^/something
    const m = ps.match(/\^\/([^\s\{]+)/);
    if (!m) continue;
    const pathPart = `/${m[1]}`;
    // Reduce to a stable prefix end at a slash boundary
    const parts = pathPart.split('/').filter(Boolean);
    if (parts.length >= 2) {
      prefixes.add(`/${parts[0]}/${parts[1]}/`);
    } else if (parts.length === 1) {
      prefixes.add(`/${parts[0]}/`);
    }
  }
  return prefixes;
}

// Rewrite proxy_pass http://host:port[/path] to variable-based form to defer DNS resolution
// and ensure a resolver is present in the block. Avoid double-hardening if already variable-based.
// Also adds graceful error handling for unavailable upstreams.
function hardenLocationFullText(fullText) {
  // Find body range between the first '{' after 'location' and its matching '}'
  const locIdx = fullText.indexOf('location');
  if (locIdx === -1) return fullText;
  const braceOpen = fullText.indexOf('{', locIdx);
  if (braceOpen === -1) return fullText;

  let depth = 1;
  let i = braceOpen + 1;
  while (i < fullText.length && depth > 0) {
    const ch = fullText[i++];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  const bodyStart = braceOpen + 1;
  const bodyEnd = i - 1;
  const before = fullText.slice(0, bodyStart);
  const body = fullText.slice(bodyStart, bodyEnd);
  const after = fullText.slice(bodyEnd);

  // If already uses variable-based proxy_pass, leave as-is (but still ensure resolver)
  let changed = false;
  const lines = body.split(/\r?\n/);
  let varCounter = 0;
  let hasResolver = /(^|\n)\s*resolver\b/.test(body);
  let insertedResolver = false;
  // Track local $var definitions so we can normalize variable-based proxy_pass usage
  const localVars = new Map(); // varName -> { hostPort: string, path: string }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\bset\s+\$([A-Za-z0-9_]+)\s+http:\/\/([^;\s]+);/);
    if (!m) continue;
    const v = `$${m[1]}`;
    const target = m[2]; // may include path
    const hostPort = target.replace(/\/.*/, '');
    const pathPart = target.includes('/') ? target.slice(target.indexOf('/')) : '';
    localVars.set(v, { hostPort, path: pathPart });
    // Normalize var to NOT include http:// or path; keep only host:port
    const indent = (lines[i].match(/^\s*/)||[''])[0];
    lines[i] = `${indent}set ${v} ${hostPort};`;
  }
  
  // Also track variables without http:// prefix
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\bset\s+\$([A-Za-z0-9_]+)\s+([a-zA-Z0-9_.-]+:[0-9]+)\s*;/);
    if (!m) continue;
    const v = `$${m[1]}`;
    if (!localVars.has(v)) {
      localVars.set(v, { hostPort: m[2], path: '' });
    }
  }

  const proxyRegex = /(\s*)proxy_pass\s+http:\/\/([a-zA-Z0-9_.-]+:[0-9]+)([^;]*);/;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // Normalize variable-based proxy_pass to include scheme on directive (not inside var) and avoid URI replacement
    const varPass = line.match(/^(\s*)proxy_pass\s+\$([A-Za-z0-9_]+)([^;]*);/);
    if (varPass) {
      const indent = varPass[1] || '';
      const v = `$${varPass[2]}`;
      const suffix = varPass[3] || ''; // may include path like /admin/
      if (localVars.has(v)) {
        // Ensure a resolver exists for runtime DNS
        if (!hasResolver && !insertedResolver) {
          lines.splice(idx, 0, `${indent}resolver 127.0.0.11 ipv6=off;`, `${indent}resolver_timeout 5s;`);
          idx += 2;
          insertedResolver = true;
          hasResolver = true;
        }
        // Ensure scheme is present on directive; preserve any path suffix
        lines[idx] = `${indent}proxy_pass http://${v}${suffix};`;
        changed = true;
        continue;
      }
      // If var not defined locally, leave as-is
    }
    const m = line.match(proxyRegex);
    if (!m) continue;
    const indent = m[1] || '';
    const target = m[2]; // host:port
    const restPath = m[3] || '';
    const safeName = target.replace(/[^a-zA-Z0-9]/g, '_');
    const varName = `$up_${safeName}_${++varCounter}`;

    // Insert resolver if missing (before the set/proxy lines)
    if (!hasResolver && !insertedResolver) {
      lines.splice(idx, 0, `${indent}resolver 127.0.0.11 ipv6=off;`, `${indent}resolver_timeout 5s;`);
      idx += 2;
      insertedResolver = true;
      hasResolver = true;
    }

    // Insert set line immediately before proxy_pass
    lines.splice(idx, 0, `${indent}set ${varName} ${target};`);
    idx += 1;

    // Replace proxy_pass with variable form, preserving any path suffix
    // Preserve original restPath semantics so prefix mappings like /sb-common-assets/ continue to work
    lines[idx] = `${indent}proxy_pass http://${varName}${restPath};`;
    changed = true;
  }

  // If no proxy_pass rewrites happened but there is a variable-based proxy_pass, ensure resolver exists
  if (!hasResolver && lines.some(l => /\bproxy_pass\s+\$[A-Za-z0-9_]+/.test(l))) {
    const insertAt = Math.max(0, lines.findIndex(l => /\S/.test(l)));
    const indent = (lines[insertAt] && (lines[insertAt].match(/^\s*/)[0] || '')) || '';
    lines.splice(insertAt, 0, `${indent}resolver 127.0.0.11 ipv6=off;`, `${indent}resolver_timeout 5s;`);
    changed = true;
    hasResolver = true;
  }

  // Add graceful error handling for unavailable upstreams
  // Only add if there's a proxy_pass and no existing error_page for 502/503/504
  const hasProxyPass = lines.some(l => /\bproxy_pass\b/.test(l));
  const hasErrorPage = lines.some(l => /\berror_page\s+(502|503|504)/.test(l));
  const hasProxyIntercept = lines.some(l => /\bproxy_intercept_errors\s+on/.test(l));
  
  if (hasProxyPass && !hasErrorPage && !hasProxyIntercept) {
    // Find a good place to insert (after resolver, before proxy_pass)
    const proxyPassIdx = lines.findIndex(l => /\bproxy_pass\b/.test(l));
    if (proxyPassIdx > 0) {
      const indent = (lines[proxyPassIdx].match(/^\s*/)||[''])[0];
      // Insert error handling before proxy_pass
      lines.splice(proxyPassIdx, 0, 
        `${indent}# Graceful error handling for unavailable upstream`,
        `${indent}proxy_intercept_errors on;`,
        `${indent}error_page 502 503 504 = @upstream_unavailable;`
      );
      changed = true;
    }
  }

  // Dedupe noisy directives that can trigger nginx warnings when repeated across locations
  // Remove redundant 'sub_filter_types text/html;' since text/html is default for sub_filter
  const filtered = [];
  for (let ln of lines) {
    if (/^\s*sub_filter_types\s+text\/html\s*;\s*$/.test(ln)) {
      changed = true; // drop it
      continue;
    }
    // Repair malformed rewrite lines that lost their capture substitution
    // e.g., "rewrite ^/mxtk/(.*)$ /location ^~ /mxtk/ { break" → "rewrite ^/mxtk/(.*)$ /$1 break;"
    if (/^\s*rewrite\s+\^\/mxtk\/\(\.\*\)\$\s+\/location\s+\^~\s+\/mxtk\//.test(ln)) {
      ln = ln.replace(/\/location\s+\^~\s+\/mxtk\/\s*\{\s*break;?\s*$/, '/$1 break;');
      changed = true;
    }
    // Ensure rewrite lines are properly terminated with ';'
    if (/^\s*rewrite\b/.test(ln) && !/;\s*$/.test(ln)) {
      ln = ln.replace(/\s*$/, ';');
      changed = true;
    }
    filtered.push(ln);
  }

  if (!changed) return fullText;
  const newBody = filtered.join('\n');
  return before + newBody + after;
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  let appFiles = listConfFiles(APPS_DIR);
  const overrideFiles = listConfFiles(OVERRIDES_DIR);

  // Prefer newest app configs first so latest install wins when duplicates exist
  try {
    appFiles = appFiles
      .map(p => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .map(x => x.p);
  } catch {}

  // Detect basename conflicts (same filename present in both dirs)
  const conflicts = [];
  if (overrideFiles.length && appFiles.length) {
    const overrideNames = new Set(overrideFiles.map((p) => path.basename(p)));
    for (const a of appFiles) {
      const base = path.basename(a);
      if (overrideNames.has(base)) {
        conflicts.push({ filename: base, appPath: a, overridePath: path.join(OVERRIDES_DIR, base) });
      }
    }
  }

  // Do NOT drop app files when an override with the same basename exists.
  // Keep both and let block-level precedence be handled by keys (overrides first).

  const overrideBlocks = collectBlocksFromFiles(overrideFiles);
  const appBlocks = collectBlocksFromFiles(appFiles);

  // Determine if a given app source file suggests Storybook/Vite dev helpers
  // If the same source file declares /sdk or sb-* routes, allow its root helpers
  const allowRootBySource = new Map(); // sourceFile -> boolean
  try {
    const bySourceTmp = new Map();
    for (const b of appBlocks) {
      const list = bySourceTmp.get(b.sourceFile) || [];
      list.push(b);
      bySourceTmp.set(b.sourceFile, list);
    }
    const isSbSignal = (spec) => {
      const s = String(spec||'');
      return /(^|\s)\^?~?\s*\/sdk\//.test(s) || /\/(sb-manager|sb-addons|sb-common-assets)\//.test(s) || /storybook-server-channel/.test(s);
    };
    bySourceTmp.forEach((blocks, src) => {
      const allow = blocks.some(b => isSbSignal(b.pathSpec));
      allowRootBySource.set(src, allow);
    });
  } catch {}
  const overrideRegexPrefixes = extractRegexProtectedPrefixes(overrideBlocks);

  // Track override keys (raw and normalized) to let overrides win
  const seen = buildKeySetFromBlocks(overrideBlocks);

  // Start composing output
  ensureDirSync(OUTPUT_DIR);

  const lines = [];
  lines.push('# GENERATED FILE - DO NOT EDIT');
  lines.push('# This file is generated by utils/generateAppsBundle.js');
  lines.push(`# Generated at: ${new Date().toISOString()}`);
  lines.push('# Precedence: overrides > apps');
  if (overrideFiles.length > 0) {
    lines.push(`# Overrides: ${overrideFiles.map((f) => path.relative(ROOT_DIR, f)).join(', ')}`);
  }
  if (appFiles.length > 0) {
    lines.push(`# Apps: ${appFiles.map((f) => path.relative(ROOT_DIR, f)).join(', ')}`);
  }
  lines.push('');
  
  // Add global error handler for unavailable upstreams
  lines.push('# Global error handler for unavailable app upstreams');
  lines.push('location @upstream_unavailable {');
  lines.push('  add_header Content-Type application/json;');
  lines.push('  add_header Cache-Control "no-cache, no-store, must-revalidate";');
  lines.push('  return 503 \'{"error":"Service Unavailable","message":"The requested application is not currently running. Please start the service and try again.","status":503}\';');
  lines.push('}');
  lines.push('');

  // Build diagnostics payload
  const diagnostics = { generatedAt: new Date().toISOString(), overrides: overrideFiles.map(f=>path.relative(ROOT_DIR,f)), apps: appFiles.map(f=>path.relative(ROOT_DIR,f)), included: [], skipped: [] };

  // Emit overrides first, in file order, but dedupe identical raw path specs to avoid nginx duplicate location errors
  const emittedOverrideRaw = new Map(); // rawKey -> source
  for (const b of overrideBlocks) {
    const rawKey = `raw:${b.pathSpec.trim()}`;
    if (emittedOverrideRaw.has(rawKey)) continue; // skip duplicate exact location re-declarations
    emittedOverrideRaw.set(rawKey, b.sourceFile);
    lines.push(`# source: ${path.relative(ROOT_DIR, b.sourceFile)}`);
    lines.push(hardenLocationFullText(b.fullText).trimEnd());
    lines.push('');
    diagnostics.included.push({ kind: 'override', pathSpec: b.pathSpec.trim(), source: path.relative(ROOT_DIR, b.sourceFile) });
  }

  // Emit app blocks unless a conflicting key (raw or normalized) already exists
  const emittedRawAny = new Set(Array.from(emittedOverrideRaw.keys()));
  for (const b of appBlocks) {
    const pathSpecTrim = b.pathSpec.trim();
    const rawKey = `raw:${pathSpecTrim}`;
    const norm = normalizeLocationPath(b.pathSpec);
    const normKey = norm ? `norm:${norm}` : null;
    const relSrc = path.relative(ROOT_DIR, b.sourceFile);
    // Global policy: allow root dev-helper routes. We still emit lint warnings later for visibility.
    // If an override declared a regex that protects a prefix, skip app blocks under that prefix
    if (norm && overrideRegexPrefixes.has(norm)) {
      diagnostics.skipped.push({ kind: 'app', pathSpec: pathSpecTrim, source: relSrc, reason: 'protected_by_override_regex' });
      continue;
    }
    // Allow both exact and prefix blocks for same normalized route.
    // Skip if an override already claimed this exact raw path, or an override claimed the normalized path
    // and this is NOT an exact match block.
    if (seen.has(rawKey) || (normKey && seen.has(normKey) && !pathSpecTrim.startsWith('='))) {
      diagnostics.skipped.push({ kind: 'app', pathSpec: pathSpecTrim, source: relSrc, reason: 'overridden_by_override' });
      continue;
    }
    // Avoid exact duplicate raws among app blocks and previously emitted
    if (emittedRawAny.has(rawKey)) { diagnostics.skipped.push({ kind: 'app', pathSpec: pathSpecTrim, source: relSrc, reason: 'duplicate_app_raw' }); continue; }
    emittedRawAny.add(rawKey);
    lines.push(`# source: ${relSrc}`);
    lines.push(hardenLocationFullText(b.fullText).trimEnd());
    lines.push('');
    diagnostics.included.push({ kind: 'app', pathSpec: pathSpecTrim, source: relSrc });
  }

  const composed = lines.join('\n');
  const deduped = removeDuplicateLocationBlocksFromText(composed);
  fs.writeFileSync(OUTPUT_FILE, deduped, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

  // Write diagnostics for UI/API
  try {
    ensureDirSync(ARTIFACTS_DIR);
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'bundle-diagnostics.json'), JSON.stringify(diagnostics, null, 2), 'utf8');
  } catch (e) {
    try { console.warn('Could not write bundle-diagnostics.json:', e.message); } catch {}
  }

  // Lint: warn if any app routes are declared at proxy root (non-prefixed dev helpers)
  const badRoots = appBlocks
    .map(b => normalizeLocationPath(b.pathSpec))
    .filter(Boolean)
    .filter(r => [/^\/@vite\//, /^\/@id\//, /^\/@fs\//, /^\/node_modules\//, /^\/sb-(?:manager|addons|common-assets)\//, /^\/src\//]
      .some(re => re.test(r)));
  if (badRoots.length) {
    console.warn('Lint: Detected root-level dev-helper routes in app configs (should live under an app prefix):');
    Array.from(new Set(badRoots)).sort().forEach(r => console.warn(' -', r));
  }

  // Persist conflicts artifact for UI/API consumption
  try {
    ensureDirSync(ARTIFACTS_DIR);
    const payload = {
      generatedAt: new Date().toISOString(),
      conflicts
    };
    fs.writeFileSync(CONFLICTS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Could not write override-conflicts.json:', e.message);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('generateAppsBundle failed:', err);
    process.exit(1);
  }
}


