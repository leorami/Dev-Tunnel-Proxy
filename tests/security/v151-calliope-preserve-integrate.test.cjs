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
  // V153: repair-intent uses isRepairIntentFollowUp; secure-block remains a fallback.
  assert.match(statusHtml, /isRepairIntentFollowUp\(q\)|looksLikeHealFollowUp\(q\)/);
  assert.match(statusHtml, /recentSecureHealBlock/);
});

test('Reports UI consumes reviewed items/pagination contract with textContent-safe rendering bias', () => {
  assert.match(reportsHtml, /data\.items/);
  assert.match(reportsHtml, /pagination\.total/);
  assert.equal(reportsHtml.includes('data.reports'), false);
  // V138 reports path prefers textContent assignments over raw innerHTML name sinks.
  assert.match(reportsHtml, /\.textContent\s*=/);
});


test('Status Clear copy truthfully describes visible-only clear (not stored-history deletion)', () => {
  const btn = statusHtml.match(/<button[^>]*id="aiClearBtn"[^>]*>[^<]*/);
  assert.ok(btn, 'aiClearBtn present');
  const tag = btn[0];
  assert.match(tag, /Clear view/);
  assert.match(tag, /title="Clear visible messages; saved history is unchanged"/);
  assert.equal(/title="Clear conversation"/.test(tag), false);
});

test('Shared Clear copy and confirm disclose browser-local only; no server delete request', () => {
  assert.match(commonJs, /id="aiClearBtn"[^']*title="Clear locally saved messages in this browser only; server chat history is unchanged"/);
  assert.match(commonJs, /title:\s*'Clear local messages'/);
  assert.match(commonJs, /Server chat history is not deleted/);
  assert.equal(/title="Clear conversation"/.test(commonJs), false);
  assert.equal(/title:\s*'Clear History'/.test(commonJs), false);
  assert.equal(/Clear Calliope chat history\?/.test(commonJs), false);
  assert.match(commonJs, /localStorage\.removeItem\(LS_KEY\)/);
  assert.equal(/method:\s*['"]DELETE['"]/.test(commonJs), false);
});

test('Status clearChat remains client-visible clear without server history deletion', () => {
  const m = statusHtml.match(/function clearChat\(\)\{[\s\S]*?\n        \}/);
  assert.ok(m, 'clearChat present');
  const body = m[0];
  assert.match(body, /replaceChildren/);
  assert.equal(/method:\s*['"]DELETE['"]/.test(body), false);
  assert.equal(/chat-history/.test(body), false);
});
