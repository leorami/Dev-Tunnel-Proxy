'use strict';
/** V177 CTO-first docs truth contracts. Intentionally RED on protected main at
 * de163771106b5c3f8ab1fbdac39d8e615147b6d1.
 * These tests check public capability claims, not whether actual repairs work. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}
test('README does not promise unattended repair in secure mode', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /she actually fixes problems herself/i,
    'Unqualified self-healing claim contradicts secure observational mode');
  assert.doesNotMatch(readme, /proactively monitors, diagnoses, and heals routing issues/i,
    'Do not promise universal automatic healing absent confirmed authorization');
});
test('Calliope documentation labels historic autonomous-heal examples before the first claim', () => {
  const guide = read('docs/CALLIOPE_ASSISTANT.md');
  const firstClaim = guide.search(/proactively monitors, diagnoses, and fixes routing issues/i);
  assert.ok(firstClaim >= 0, 'Historic claim remains contextualized, not erased');
  const heading = guide.slice(0, firstClaim);
  assert.match(heading, /secure mode/i, 'Explicit secure-mode caveat must precede historical claims');
  assert.match(heading, /read-only|observation-only/i, 'Distinguish observation from repair before first historical claim');
});
test('one current operational-state entrypoint exists and is indexed', () => {
  const current = read('docs/CURRENT_OPERATIONAL_STATE.md');
  const index = read('docs/DOCUMENTATION_INDEX.md');
  assert.match(index, /CURRENT_OPERATIONAL_STATE\.md/, 'Make current truth discoverable');
  assert.match(current, /secure mode/i);
  assert.match(current, /owner authorization|owner-approved/i);
  assert.match(current, /repair|healing/i);
  assert.match(current, /verification|verified|evidence/i);
});
test('current-state docs distinguish source, installed runtime, and blocked visual access', () => {
  const state = read('docs/CURRENT_OPERATIONAL_STATE.md');
  assert.match(state, /source[- ]only|unmerged|not deployed/i,
    'Source acceptance is not production activation');
  assert.match(state, /screenshot|browser|visual/i,
    'Browser/UI evidence limits must be explicit');
  assert.doesNotMatch(state, /V153 pending/i,
    'V153 already RETURNED; do not copy 2026-11-16 status as current');
});
