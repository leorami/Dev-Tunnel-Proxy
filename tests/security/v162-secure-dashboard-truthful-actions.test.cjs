'use strict';
/**
 * #166 / V162 RED→GREEN: secure Dashboard must not advertise enabled Heal/Reindex
 * controls that secure policy blocks; route Check must paint honest non-green
 * observations; Create Route copy must not promise install before owner intent.
 * Source-exact fixtures only — no Docker, live proxy, credentials, or Git writes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifySecureManagementOperation } = require('../../utils/rc2-management-safety-policy.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const dashboardPath = path.join(ROOT, 'dashboard', 'public', 'index.html');
const base = '/devproxy/api';

function readDashboard() {
  assert.equal(fs.existsSync(dashboardPath), true, 'dashboard/public/index.html missing');
  return fs.readFileSync(dashboardPath, 'utf8');
}

function classify(route) {
  return classifySecureManagementOperation({
    method: 'POST',
    pathname: base + route,
    base,
    spoolDirectory: '/private/spool',
    nodeEnv: 'production',
  });
}

test('policy: Audit+Heal / Advanced Heal / Reindex remain blocked in secure spool', () => {
  for (const route of ['/ai/audit-and-heal', '/ai/advanced-heal', '/ai/reindex']) {
    const r = classify(route);
    assert.equal(r.blocked, true, route);
    assert.equal(r.code, 'LEGACY_UNSETTLED_MANAGEMENT_BLOCKED', route);
    assert.equal(r.productionChangeAuthorized, false, route);
  }
});

test('policy: create-route remains permitted (auth/Origin/install still required)', () => {
  const r = classify('/apps/create-route');
  assert.equal(r.blocked, false);
  assert.equal(r.productionChangeAuthorized, false);
});

test('RED: dashboard must not enable Heal/Reindex buttons that call blocked endpoints', () => {
  const html = readDashboard();
  // No live POST callers for blocked management actions.
  assert.doesNotMatch(html, /post\(\s*['"]ai\/audit-and-heal['"]/);
  assert.doesNotMatch(html, /post\(\s*['"]ai\/advanced-heal['"]/);
  assert.doesNotMatch(html, /post\(\s*['"]ai\/reindex['"]/);

  for (const id of ['btnAuditHeal', 'btnAdvHeal', 'btnReindex']) {
    if (!html.includes(`id="${id}"`)) continue;
    // If a legacy id remains for compatibility it must be disabled and not primary/success.
    const btnRe = new RegExp(`<button[^>]*id="${id}"[^>]*>`, 'i');
    const m = html.match(btnRe);
    assert.ok(m, `expected button markup for retained id ${id}`);
    assert.match(m[0], /\bdisabled\b/i, `${id} must be disabled when retained`);
    assert.doesNotMatch(m[0], /\bsuccess\b/i, `${id} must not look like a healing primary`);
  }
});

test('RED: no enabled Audit+Heal / Advanced Heal / Reindex tool cards', () => {
  const html = readDashboard();
  // Marketing headings that previously sat above enabled action buttons.
  assert.doesNotMatch(html, /<h2[^>]*>\s*Audit\s*\+\s*Heal\s*<\/h2>/i);
  assert.doesNotMatch(html, /<h2[^>]*>\s*Advanced Heal\s*<\/h2>/i);
  assert.doesNotMatch(html, /<h2[^>]*>\s*Reindex Knowledge\s*<\/h2>/i);
  assert.doesNotMatch(html, />\s*Audit \+ Heal\s*</);
  assert.doesNotMatch(html, />\s*Advanced Heal\s*</);
  assert.doesNotMatch(html, />\s*Reindex Now\s*</);
});

test('RED: one clear Check Route action remains bound only to ai/audit', () => {
  const html = readDashboard();
  assert.match(html, /id="btnAudit"/);
  assert.match(html, /post\(\s*['"]ai\/audit['"]/);
  // Honest observation helper + btnAudit wiring (not unconditional Complete).
  const checkStart = html.indexOf('function showRouteCheckObservation');
  assert.ok(checkStart > 0, 'showRouteCheckObservation helper missing');
  const auditHandlerStart = html.indexOf("getElementById('btnAudit')");
  assert.ok(auditHandlerStart > checkStart);
  const region = html.slice(checkStart, auditHandlerStart + 900);
  assert.match(region, /healingPerformed/);
  assert.match(region, /showRouteCheckObservation\(\s*res\s*\)/);
  assert.doesNotMatch(region, /showResult\(\s*res\s*,\s*['"]success['"]\s*\)/);
  assert.match(html, /Needs attention — no repair attempted/);
});

test('RED: Create Route copy does not promise install before owner intent', () => {
  const html = readDashboard();
  // Card + modal must not say "install it" as the default workflow pitch.
  assert.doesNotMatch(html, /install it in the proxy/i);
  assert.doesNotMatch(html, /Generate a base-path friendly config, install it,/i);
  // Preview remains explicit no-install; Create still reads the checkbox.
  assert.match(html, /collectRoutePayload\(false\)/);
  assert.match(html, /collectRoutePayload\(installFlag\)/);
  assert.match(html, /id="routeInstall"/);
  assert.match(html, /id="btnPreviewRoute"/);
  assert.match(html, /id="btnCreateRoute"/);
});

test('source: Self-Check stays observation-only; no heal marketing', () => {
  const html = readDashboard();
  assert.match(html, /id="btnSelfCheck"/);
  assert.match(html, /post\(\s*['"]ai\/self-check['"]/);
  const selfStart = html.indexOf("getElementById('btnSelfCheck')");
  assert.ok(selfStart > 0);
  const selfHandler = html.slice(selfStart, selfStart + 700);
  assert.match(selfHandler, /heal:\s*false/);
  assert.match(selfHandler, /healingPerformed/);
  assert.doesNotMatch(html, /identify and fix system issues/i);
});
