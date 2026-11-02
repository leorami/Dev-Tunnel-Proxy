/** RED-first: anonymous /health.json must not leak detailed health-latest.json.
 * Preserves missing-report failure via existence check (503) while returning
 * only minimal public JSON. Authenticated /status.json stays on the detailed file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function healthBlock(source) {
  const start = source.indexOf('location = /health.json {');
  assert.notEqual(start, -1, 'missing /health.json location');
  const end = source.indexOf('\n  location ', start + 1);
  assert.notEqual(end, -1, 'unterminated /health.json location');
  return source.slice(start, end);
}

function statusBlock(source) {
  const start = source.indexOf('location = /status.json {');
  assert.notEqual(start, -1, 'missing /status.json location');
  const end = source.indexOf('\n  location ', start + 1);
  assert.notEqual(end, -1, 'unterminated /status.json location');
  return source.slice(start, end);
}

for (const name of ['config/default.conf', 'config/default.production.conf']) {
  test(name + ' public /health.json is minimal and fails closed when the report file is missing', () => {
    const source = fs.readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
    const health = healthBlock(source);
    // Must not alias/serve the detailed private report to anonymous Docker/public clients.
    // The path may appear only inside an existence check (`!-f`), never as an alias/root/try_files body.
    assert.doesNotMatch(health, /alias\s+\/usr\/share\/nginx\/html\/\.artifacts\/reports\/health-latest\.json/);
    assert.doesNotMatch(health, /\b(?:root|try_files)\b[\s\S]*health-latest\.json/);
    // Existence-preserving semantics: missing report => unavailable, present => minimal ok.
    assert.match(
      health,
      /if\s*\(\s*!-f\s+\/usr\/share\/nginx\/html\/\.artifacts\/reports\/health-latest\.json\s*\)\s*\{\s*return\s+503\s+'\{"status":"unavailable"\}'\s*;/s,
    );
    assert.match(health, /return\s+200\s+'\{"status":"ok"\}'\s*;/);
    assert.match(health, /default_type\s+application\/json\s*;/);
    assert.match(health, /Cache-Control\s+"no-store"/);

    const status = statusBlock(source);
    assert.match(status, /auth_request\s+\/admin\/check\s*;/);
    assert.match(status, /alias\s+\/usr\/share\/nginx\/html\/\.artifacts\/reports\/health-latest\.json\s*;/);
  });
}
