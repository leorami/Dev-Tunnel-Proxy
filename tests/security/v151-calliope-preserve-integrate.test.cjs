'use strict';
/**
 * V151: preserved local Calliope composer/layout + security invariants on reviewed V149 base.
 * Source-only; no browser/network.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const statusHtml = fs.readFileSync(path.join(ROOT, 'status', 'status.html'), 'utf8');
const commonJs = fs.readFileSync(path.join(ROOT, 'status', 'common.js'), 'utf8');
const commonCss = fs.readFileSync(path.join(ROOT, 'status', 'common.css'), 'utf8');
const reportsHtml = fs.readFileSync(path.join(ROOT, 'status', 'reports.html'), 'utf8');

test('preserves local composer send UX on Status and shared Calliope drawer', () => {
  assert.match(statusHtml, /class="ai-composer"/);
  assert.match(statusHtml, /id="aiSendBtn"/);
  assert.match(commonJs, /ai-composer/);
  assert.match(commonJs, /id="aiSendBtn"/);
  assert.match(commonCss, /\.ai-composer\s*\{/);
  assert.match(commonCss, /\.ai-send-btn\s*\{/);
});

test('does not reintroduce unsolicited greeting or CDN script trust boundary', () => {
  assert.equal(commonJs.includes('ensureGreeting'), false);
  assert.equal(/unpkg\.com|cdn\.jsdelivr|cdnjs\.cloudflare/.test(statusHtml), false);
  assert.match(statusHtml, /\/status\/vendor\/lucide\.min\.js/);
  assert.match(statusHtml, /\/status\/vendor\/marked\.min\.js/);
  assert.match(statusHtml, /\/status\/vendor\/purify\.min\.js/);
});

test('keeps #136 safe summary/modal DOM and does not restore sinks', () => {
  assert.match(statusHtml, /appendLabeledSummaryChip/);
  assert.equal(statusHtml.includes('summaryWrap.lastChild.innerHTML'), false);
  assert.equal(statusHtml.includes('JSON Data for ${sourceFile}'), false);
  assert.match(statusHtml, /pre\.textContent\s*=\s*jsonText/);
});

test('diagnose/self-check stay observational; no audit-and-heal network calls', () => {
  assert.equal(statusHtml.includes("apiPath('ai/audit-and-heal')"), false);
  assert.equal(commonJs.includes('audit-and-heal'), false);
  assert.match(statusHtml, /apiPath\('ai\/audit'\)/);
  assert.match(commonJs, /self-check\?http=1/);
  assert.match(commonJs, /heal:\s*false/);
});

test('ports secure heal-follow-up Ask guard without dropping single-flight Ask', () => {
  assert.match(statusHtml, /function looksLikeHealFollowUp/);
  assert.match(statusHtml, /function recentSecureHealBlock/);
  assert.match(statusHtml, /function secureHealBlockedReply/);
  assert.match(statusHtml, /activeAskSeq !== 0/);
  assert.match(statusHtml, /looksLikeHealFollowUp\(q\)\s*\?\s*recentSecureHealBlock/);
});

test('Reports UI consumes reviewed items/pagination contract with textContent-safe rendering bias', () => {
  assert.match(reportsHtml, /data\.items/);
  assert.match(reportsHtml, /pagination\.total/);
  assert.equal(reportsHtml.includes('data.reports'), false);
  // V138 reports path prefers textContent assignments over raw innerHTML name sinks.
  assert.match(reportsHtml, /\.textContent\s*=/);
});
