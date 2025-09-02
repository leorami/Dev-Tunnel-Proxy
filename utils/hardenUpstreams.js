#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const appsDir = path.resolve(__dirname, '..', 'apps');

function transformFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split(/\r?\n/);
  let out = [];
  let changed = false;
  let locDepth = 0;
  let pendingInsertIdx = -1;
  let varCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openLoc = line.match(/\blocation\b[^\{]*\{/);
    if (openLoc) {
      locDepth++;
      pendingInsertIdx = -1;
      out.push(line);
      continue;
    }
    if (locDepth > 0 && line.includes('{')) locDepth++;
    if (locDepth > 0 && line.includes('}')) locDepth--;

    // Only operate inside location blocks
    if (locDepth > 0) {
      // Match proxy_pass http://service:port[optional path][optional $var]
      const m = line.match(/\bproxy_pass\s+http:\/\/([a-zA-Z0-9_-]+:[0-9]+)([^;]*);/);
      if (m) {
        const target = m[1];
        const rest = m[2] || '';
        const safeName = target.replace(/[^a-zA-Z0-9]/g, '_');
        const varName = `$up_${safeName}_${++varCounter}`;
        // Insert set before proxy_pass line
        out.push(`  set ${varName} http://${target}${rest};`);
        out.push(line.replace(m[0], `proxy_pass ${varName};`));
        changed = true;
        continue;
      }
    }

    out.push(line);
  }

  if (changed) {
    fs.writeFileSync(filePath, out.join('\n'));
  }
  return changed;
}

function main() {
  const files = fs.readdirSync(appsDir).filter(f => f.endsWith('.conf'));
  let changedAny = false;
  for (const f of files) {
    const p = path.join(appsDir, f);
    const c = transformFile(p);
    if (c) {
      console.log(`hardened: ${f}`);
      changedAny = true;
    }
  }
  if (!changedAny) console.log('No changes needed.');
}

if (require.main === module) main();


