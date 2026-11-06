'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the public repo declares a project-local AGENTS contract and coordination canon', () => {
  assert.match(read('AGENTS.md'), /one primary Cursor Engineer-I/i);
  assert.match(read('docs/architecture/DEVPROXY_PRIMARY_AGENT_COORDINATION_V1.md'), /single primary integration owner/i);
});

test('source identity and genuine lifecycle evidence precede every CTO dispatch', () => {
  const a = read('AGENTS.md');
  assert.match(a, /before every CTO response/i);
  assert.match(a, /40.character.*SHA/i);
  assert.match(a, /STARTED/);
  assert.match(a, /RETURNED/);
  assert.match(a, /committed diff/i);
  assert.match(a, /comment.*(does not|never).*launch/i);
});

test('parallel specialists are optional, independently owned and honestly reported', () => {
  const d = read('docs/architecture/DEVPROXY_PRIMARY_AGENT_COORDINATION_V1.md');
  for (const marker of ['SPAWNED', 'NOT_SPAWNED_PROVIDER_UNAVAILABLE',
    'NOT_SPAWNED_AUTHORITY_BOUNDARY', 'NOT_SPAWNED_NOT_BENEFICIAL']) {
    assert.ok(d.includes(marker), marker);
  }
  assert.match(d, /provider.*run (ID|identity)/i);
  assert.match(d, /nonoverlapping/i);
  assert.match(d, /one consolidated/i);
});

test('specialists do not broker owner actions or expand authority', () => {
  const a = read('AGENTS.md');
  assert.match(a, /primary.*owner.only decisions/i);
  assert.match(a, /no credentials.*GitHub/i);
  assert.match(a, /no.*(merge|deploy).*without.*owner/i);
  assert.match(a, /\b\.cursorrules\b/);
});

test('public policy remains a local overlay, not an unauthorized copy of private Origin', () => {
  const d = read('docs/architecture/DEVPROXY_PRIMARY_AGENT_COORDINATION_V1.md');
  assert.match(d, /canonical.*leorami\/project-template/i);
  assert.match(d, /not.*(mirrored|merged)/i);
  assert.match(d, /CORE_PROTOCOL_LOCK\.json/);
  assert.match(d, /master.*(unchanged|no writes)/i);
});
