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
    const seen = new Set();
    let out = text;
    for (const b of blocks) {
      const key = b.pathSpec.trim().replace(/^([=~\^~*]+)\s+/, '');
      if (seen.has(key)) {
        // Remove this duplicate block entirely
        out = out.replace(b.fullText, `# removed duplicate location ${key}`);
      } else {
        seen.add(key);
      }
    }
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

// Rewrite proxy_pass http://host:port[/path] to variable-based form to defer DNS resolution
// and ensure a resolver is present in the block. Avoid double-hardening if already variable-based.
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

  const proxyRegex = /(\s*)proxy_pass\s+http:\/\/([a-zA-Z0-9_.-]+:[0-9]+)([^;]*);/;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (/\bproxy_pass\s+\$[A-Za-z0-9_]+/.test(line)) {
      // Already variable-based; continue
      continue;
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

  // Emit overrides first, in file order, but dedupe identical raw path specs to avoid nginx duplicate location errors
  const emittedOverrideRaw = new Map(); // rawKey -> source
  for (const b of overrideBlocks) {
    const rawKey = `raw:${b.pathSpec.trim()}`;
    if (emittedOverrideRaw.has(rawKey)) continue; // skip duplicate exact location re-declarations
    emittedOverrideRaw.set(rawKey, b.sourceFile);
    lines.push(hardenLocationFullText(b.fullText).trimEnd());
    lines.push('');
  }

  // Emit app blocks unless a conflicting key (raw or normalized) already exists
  const emittedRawAny = new Set(Array.from(emittedOverrideRaw.keys()));
  for (const b of appBlocks) {
    const pathSpecTrim = b.pathSpec.trim();
    const rawKey = `raw:${pathSpecTrim}`;
    const norm = normalizeLocationPath(b.pathSpec);
    const normKey = norm ? `norm:${norm}` : null;
    // Allow both exact and prefix blocks for same normalized route.
    // Skip if an override already claimed this exact raw path, or an override claimed the normalized path
    // and this is NOT an exact match block.
    if (seen.has(rawKey) || (normKey && seen.has(normKey) && !pathSpecTrim.startsWith('='))) {
      continue;
    }
    // Avoid exact duplicate raws among app blocks and previously emitted
    if (emittedRawAny.has(rawKey)) continue;
    emittedRawAny.add(rawKey);
    lines.push(hardenLocationFullText(b.fullText).trimEnd());
    lines.push('');
  }

  const composed = lines.join('\n');
  const deduped = removeDuplicateLocationBlocksFromText(composed);
  fs.writeFileSync(OUTPUT_FILE, deduped, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

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


