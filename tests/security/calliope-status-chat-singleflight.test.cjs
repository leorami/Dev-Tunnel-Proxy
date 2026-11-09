'use strict';
/**
 * V124 CTO RED-first Calliope P1 regression contract.
 * Never contacts production, the bridge, an owner route, an external model,
 * Docker or a credential; exercises only source structure and trust invariants.
 * Browser click and live UI evidence remains the primary's separate obligation.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname, '../../status/status.html'), 'utf8');
const count = re => [...page.matchAll(re)].length;
function section(start, end) {
  const from = page.indexOf(start);
  assert.ok(from >= 0, 'missing source section: ' + start);
  const to = page.indexOf(end, from + start.length);
  assert.ok(to > from, 'missing section terminator: ' + end);
  return page.slice(from, to);
}
const init = () => section('async function initAiAssistant(){', '// ========================================\n      // AUTO-SCAN SETTINGS MANAGEMENT');
const selfCheck = () => section('async function greetAndSelfCheck(){', 'window.CalliopeUI = Object.assign');
const diagnosis = () => section('async function runCalliopeHealth(routeKey){', '// Expose for inline handlers');

test('exactly one boot invokes assistant init; re-entry is blocked', () => {
  assert.equal(count(/\b(?:await\s+)?initAiAssistant\(\)\s*;/g), 1);
  assert.match(init(), /__devproxyCalliopeInitBound/);
});
test('one Ask click handler per initialized chat', () => {
  assert.equal(count(/askBtn(?:\s*&&\s*askBtn)?\.addEventListener\(['"]click['"],\s*onAsk\)/g), 1);
});
test('one Clear click handler per initialized chat', () => {
  assert.equal(count(/clearBtn(?:\s*&&\s*clearBtn)?\.addEventListener\(['"]click['"]/g), 1);
});
test('one Copy click handler and definition', () => {
  assert.equal(count(/copyBtn(?:\s*&&\s*copyBtn)?\.addEventListener\(['"]click['"],\s*onCopy\)/g), 1);
  assert.equal(count(/async function onCopy\(\)/g), 1);
});
test('one Enter composer handler per initialized chat', () => {
  assert.equal(count(/queryEl(?:\s*&&\s*queryEl)?\.addEventListener\(['"]keydown['"]/g), 1);
});
test('self-check is single-flight and always clears progress', () => {
  assert.match(selfCheck(), /selfCheckInFlight/);
  assert.match(selfCheck(), /finally\s*\{[^}]*thinking\.remove\(\)/s);
  assert.doesNotMatch(selfCheck(), /Keep the thinking bubble visible/);
  assert.doesNotMatch(selfCheck(), /Heya! One sec/);
});
test('route diagnosis uses exactly one supported read-only audit, not blocked heal', () => {
  const s = diagnosis();
  assert.match(s, /apiPath\(['"]ai\/audit['"]\)/);
  assert.equal([...s.matchAll(/apiPath\(['"]ai\/audit['"]\)/g)].length, 1);
  assert.doesNotMatch(s, /apiPath\(['"]ai\/audit-and-heal['"]\)/);
  assert.doesNotMatch(s, /apiPath\(['"]ai\/self-check['"]\)/);
  assert.match(s, /diagnosisInFlight/);
  assert.match(s, /finally\s*\{[^}]*thinking\.remove\(\)/s);
});
test('route observations distinguish reachable, not-green, and unavailable without claiming heal', () => {
  const s = diagnosis();
  assert.match(s, /LOCAL_HTTP_OK/);
  assert.match(s, /LOCAL_HTTP_NOT_GREEN/);
  assert.match(s, /unavailable/i);
  assert.match(s, /healingPerformed/);
  assert.doesNotMatch(s, /Working my magic/);
  assert.doesNotMatch(s, /😊 Happy/);
});
test('Calliope secure local mode is not presented as external AI or live healing', () => {
  assert.match(init(), /local_documentation/);
  assert.match(init(), /Local-only|Local documentation|Local observation/);
  assert.doesNotMatch(diagnosis(), /Owner scope decision is still required for heal parity/);
});
test('single tab-toggle strategy: recovery listener only when assistant is not bound', () => {
  assert.match(page, /if\s*\(window\.__devproxyCalliopeInitBound\)\s*return;/);
  assert.equal(count(/tab\.addEventListener\(['"]click['"]/g), 0);
});
test('long route titles and action icons do not overlap on narrow cards', () => {
  assert.match(page, /\.route-title\s*\{[^}]*min-width:\s*0/s);
  assert.match(page, /\.route-name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(page, /\.action-buttons-container\s*\{[^}]*flex-wrap:\s*wrap/s);
});
test('Auto-Scan controls can wrap instead of forcing a clipped nowrap row', () => {
  assert.match(page, /#autoScanSubcard\s+\.settings-row\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(page, /\.settings-grid\s*\{[^}]*minmax\(min\(100%,\s*320px\)/s);
});
test('mobile drawer dedicates meaningful space to chat and keeps composer in view', () => {
  assert.match(page, /#aiDrawer\.ai-drawer\s*\{[^}]*88dvh/s);
  assert.match(page, /\.ai-chat\s*\{[^}]*min-height:\s*0/s);
});
