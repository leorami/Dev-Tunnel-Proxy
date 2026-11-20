'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function conf(name) {
  return fs.readFileSync(path.join(ROOT, 'config', name), 'utf8');
}

test('default and production expose CTO observer endpoints and dual visual gate', () => {
  for (const name of ['default.conf', 'default.production.conf']) {
    const text = conf(name);
    for (const loc of [
      '/admin/cto-observer/grants',
      '/admin/cto-observer/redeem',
      '/admin/cto-observer/revoke',
      '/admin/cto-observer/check',
      '/admin/visual-access-check',
    ]) {
      assert.match(text, new RegExp('location = ' + loc.replace(/\//g, '\\/')), name + ' ' + loc);
    }
    assert.equal((text.match(/auth_request \/admin\/visual-access-check;/g) || []).length >= 4, true, name);
  }
});

test('sensitive JSON and management routes remain on admin/check, not observer-only', () => {
  const text = conf('default.conf');
  assert.match(text, /location = \/\.artifacts\/calliope\/healing-log\.json \{\s*auth_request \/admin\/check;/);
  assert.match(text, /location = \/devproxy\/api\/notifications \{\s*auth_request \/admin\/check;/);
  assert.doesNotMatch(text, /location = \/\.artifacts\/calliope\/healing-log\.json \{\s*auth_request \/admin\/visual-access-check;/);
});

test('snippet candidate exists for review without implying live include', () => {
  const snippet = fs.readFileSync(
    path.join(ROOT, 'config/snippets/cto-observer-visual-access.conf'),
    'utf8',
  );
  assert.match(snippet, /SOURCE CANDIDATE ONLY/);
  assert.match(snippet, /cto_observer_session/);
});
