'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function conf(name) {
  return fs.readFileSync(path.join(ROOT, 'config', name), 'utf8');
}

function nginxBlock(src, declaration) {
  const start = src.indexOf(declaration + ' {');
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 1;
  for (let i = open + 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

test('default and production expose CTO observer endpoints and dual visual gate', () => {
  for (const name of ['default.conf', 'default.production.conf']) {
    const text = conf(name);
    for (const page of ['status', 'reports', 'health', 'dashboard']) {
      const b = nginxBlock(text, 'location ^~ /' + page);
      assert.ok(b, name + ' ^~ /' + page);
      assert.match(b, /auth_request\s+\/admin\/visual-access-check;/);
    }
    const vac = nginxBlock(text, 'location = /admin/visual-access-check');
    assert.match(vac, /\binternal\s*;/);
    assert.match(text, /location\s+\^~\s+\/admin\/cto-observer\/projection\//);
    assert.match(text, /location\s+\^~\s+\/observer\//);
  }
});

test('sensitive JSON and management routes remain on admin/check, not observer-only', () => {
  const text = conf('default.conf');
  assert.match(text, /location = \/\.artifacts\/calliope\/healing-log\.json \{\s*auth_request \/admin\/check;/);
  assert.match(text, /location = \/devproxy\/api\/notifications \{\s*auth_request \/admin\/check;/);
});

test('snippet candidate exists for review without implying live include', () => {
  const snippet = fs.readFileSync(
    path.join(ROOT, 'config/snippets/cto-observer-visual-access.conf'),
    'utf8',
  );
  assert.match(snippet, /SOURCE CANDIDATE ONLY/);
  assert.match(snippet, /cto_observer_session/);
});
