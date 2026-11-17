'use strict';
/**
 * Issue #160 RED→GREEN: Status + Calliope one-send, truthful semantic badges,
 * and route-first hierarchy. Source/unit only — no production, Docker, credentials.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const statusHtml = fs.readFileSync(path.join(ROOT, 'status', 'status.html'), 'utf8');
const commonJs = fs.readFileSync(path.join(ROOT, 'status', 'common.js'), 'utf8');
const commonCss = fs.readFileSync(path.join(ROOT, 'status', 'common.css'), 'utf8');

function section(src, start, end) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, 'missing source section: ' + start);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to > from, 'missing section terminator: ' + end);
  return src.slice(from, to);
}

function extractMarkup(html, id) {
  const re = new RegExp(`<[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</[^>]+>`, 'i');
  const m = html.match(re);
  return m ? m[0] : '';
}

test('exactly one user-visible in-composer Send; #aiAskBtn retained for programmatic click', () => {
  const composer = section(statusHtml, '<div class="ai-composer">', '<div class="ai-actions">');
  assert.equal([...composer.matchAll(/id="aiSendBtn"/g)].length, 1);
  assert.equal([...composer.matchAll(/aria-label="Send"/g)].length, 1);
  // Ask remains in the page (conflict Help Me still does askBtn.click()) but is not a second visible composer CTA.
  assert.match(statusHtml, /id="aiAskBtn"/);
  assert.match(statusHtml, /ai-ask-programmatic|visually-hidden-ask/);
  const askBtnTag = statusHtml.match(/<button[^>]*id="aiAskBtn"[^>]*>/);
  assert.ok(askBtnTag, 'aiAskBtn tag present');
  assert.match(askBtnTag[0], /ai-ask-programmatic|visually-hidden|aria-hidden="true"/);
  // Shared Health/Reports drawer mirrors the same one-visible-Send contract.
  assert.match(commonJs, /id="aiSendBtn"/);
  assert.match(commonJs, /id="aiAskBtn"/);
  assert.match(commonJs, /ai-ask-programmatic|visually-hidden-ask/);
  assert.match(commonCss, /\.ai-ask-programmatic|\.visually-hidden-ask/);
});

test('Enter submits once via canonical seam; Shift+Enter stays newline; dual handlers share onAsk/submitQuery', () => {
  const init = section(statusHtml, 'async function initAiAssistant(){', '// ========================================\n      // AUTO-SCAN SETTINGS MANAGEMENT');
  assert.match(init, /queryEl(?:\s*&&\s*queryEl)?\.addEventListener\(['"]keydown['"]/);
  assert.match(init, /e\.key===['"]Enter['"]\s*&&\s*!e\.shiftKey/);
  assert.match(init, /askBtn\s*&&\s*askBtn\.addEventListener\(['"]click['"],\s*onAsk\)/);
  assert.match(init, /sendBtn\s*&&\s*sendBtn\.addEventListener\(['"]click['"],\s*onAsk\)/);
  assert.match(init, /activeAskSeq !== 0/);
  // Programmatic route-card / conflict Help Me path must keep .click() on #aiAskBtn.
  assert.match(statusHtml, /getElementById\(['"]aiAskBtn['"]\)[\s\S]{0,120}\.click\(/);
  assert.match(commonJs, /submitQuery/);
  assert.match(commonJs, /sendBtnEl\)\s*sendBtnEl\.addEventListener\(['"]click['"],\s*submitQuery\)/);
  assert.match(commonJs, /ask\)\s*ask\.addEventListener\(['"]click['"],\s*submitQuery\)/);
});

test('idle Calliope badge is Local-only — never idle Healing / Happy', () => {
  const statusLabel = statusHtml.match(/id="aiHealingStatusLabel"[^>]*>[\s\S]*?</);
  assert.ok(statusLabel, 'status label present');
  assert.match(statusLabel[0], />Local-only</);
  assert.doesNotMatch(statusLabel[0], />Healing</);
  assert.doesNotMatch(statusLabel[0], /Happy/);
  assert.match(commonJs, /id="aiHealingStatusLabel"[^>]*>Local-only</);
  // Truthful vocabulary must appear in status chip setters.
  assert.match(statusHtml, /Needs attention/);
  assert.match(statusHtml, /Review available/);
  assert.match(statusHtml, /['"]Checking['"]/);
  assert.match(statusHtml, /['"]Local-only['"]/);
});

test('Diagnose chip maps typed evidence: Checking → Needs attention / Local-only; Clear resets', () => {
  const diagnosis = section(statusHtml, 'async function runCalliopeHealth(routeKey){', '// Expose for inline handlers');
  assert.match(diagnosis, /label:\s*['"]Checking['"]/);
  assert.match(diagnosis, /label:\s*['"]Needs attention['"]/);
  assert.match(diagnosis, /label:\s*['"]Local-only['"]/);
  assert.match(diagnosis, /terminalKind\s*=\s*['"]not_green['"]/);
  assert.match(diagnosis, /terminalKind\s*=\s*['"]idle['"]/);
  assert.doesNotMatch(diagnosis, /😊 Happy|💖 Healing/);
  assert.doesNotMatch(diagnosis, /Observed(?! evidence)/);
  const clear = section(statusHtml, 'function clearChat(){', '// Persisted chat history loader');
  assert.match(clear, /Local-only/);
  assert.match(clear, /lastVerifiedRouteObservation\s*=\s*null/);
});

test('forbidden legacy heal/reindex network shortcuts stay disabled', () => {
  assert.equal(statusHtml.includes("apiPath('ai/audit-and-heal')"), false);
  assert.equal(commonJs.includes('audit-and-heal'), false);
  // Reindex UI may exist historically; Ask path must not auto-enable heal:true.
  assert.doesNotMatch(statusHtml, /heal\s*:\s*true/);
  assert.match(commonJs, /heal:\s*false/);
});

test('hierarchy: Status overview and routes precede Settings/Auto-Scan progressive disclosure', () => {
  const overviewAt = statusHtml.indexOf('id="summaryChips"');
  const appsAt = statusHtml.indexOf('id="appsCard"');
  const settingsAt = statusHtml.indexOf('id="settingsCard"');
  const autoScanAt = statusHtml.indexOf('id="autoScanSubcard"');
  assert.ok(overviewAt > 0 && appsAt > overviewAt, 'apps after overview');
  assert.ok(settingsAt > appsAt, 'settings after configured apps');
  assert.ok(autoScanAt > settingsAt, 'auto-scan inside settings');
  assert.match(statusHtml, /<(details|section)[^>]*id="settingsCard"|id="settingsCard"[^>]*class="[^"]*settings-disclosure/);
  assert.match(statusHtml, /settings-disclosure|<details[^>]*id="settingsCard"/);
});

test('shared Status vs common drawer never contradict idle Local-only label', () => {
  assert.match(statusHtml, /aiHealingStatusLabel"[^>]*>\s*Local-only/);
  assert.match(commonJs, /aiHealingStatusLabel"[^>]*>Local-only</);
  assert.doesNotMatch(commonJs, /aiHealingStatusLabel"[^>]*>Healing</);
});

test('accessible composer + reduced-motion / semantic focus tokens present', () => {
  assert.match(commonCss, /prefers-reduced-motion/);
  assert.match(statusHtml, /--sea-glass|--pacific|sea-glass|pacific/i);
  assert.match(commonCss, /--sea-glass|--pacific|sea-glass|pacific/i);
  assert.match(statusHtml, /aiSendBtn[^>]*(aria-label="Send")/);
  // Focus-visible styling for interactive controls
  assert.match(commonCss + statusHtml, /:focus-visible/);
});

test('semantic status helper rejects idle Healing and Happy without typed evidence', () => {
  const src = fs.readFileSync(path.join(ROOT, 'status', 'status.html'), 'utf8');
  assert.match(src, /SEMANTIC_CALLIOPE_STATUS/);
  assert.match(src, /function\s+semanticCalliopeStatus\s*\(/);
  const from = src.indexOf('const SEMANTIC_CALLIOPE_STATUS');
  const to = src.indexOf('function applySemanticCalliopeStatus');
  assert.ok(from >= 0 && to > from, 'semantic status block markers present');
  const block = src.slice(from, to);
  const fn = vm.runInNewContext(`${block}\nsemanticCalliopeStatus`);
  const expect = (kind, label, className) => {
    const got = fn({ kind });
    assert.equal(got.label, label);
    assert.equal(got.className, className);
  };
  expect('idle', 'Local-only', 'status-ready');
  expect('checking', 'Checking', 'status-auditing');
  expect('not_green', 'Needs attention', 'status-healing');
  expect('review', 'Review available', 'status-coding');
  assert.notEqual(fn({ kind: 'idle' }).label, 'Healing');
  assert.notEqual(fn({ kind: 'idle' }).label, 'Happy');
});
