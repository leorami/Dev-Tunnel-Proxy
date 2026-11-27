'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const health = fs.readFileSync(path.join(root, 'status/health.html'), 'utf8');
const reports = fs.readFileSync(path.join(root, 'status/reports.html'), 'utf8');
const status = fs.readFileSync(path.join(root, 'status/status.html'), 'utf8');
const common = fs.readFileSync(path.join(root, 'status/common.js'), 'utf8');

test('health and reports load the local icon script used by the shared header', () => {
  assert.match(health, /\/status\/vendor\/lucide\.min\.js/);
  assert.match(reports, /\/status\/vendor\/lucide\.min\.js/);
  assert.doesNotMatch(health, /unpkg\.com\/lucide/);
  assert.doesNotMatch(reports, /unpkg\.com\/lucide/);
});

test('health report-read path does not instruct a scan or invent the current time', () => {
  assert.doesNotMatch(health, /scanApps/);
  assert.doesNotMatch(health, /smart-build\.sh/);
  assert.doesNotMatch(health, /new Date\(\)/);
  assert.doesNotMatch(health, /No conflicts/);
  assert.match(health, /Last scan only; not live health/);
  assert.match(health, /id="observed-health"/);
  assert.match(health, /id="scan-conflicts"/);
  assert.match(health, /id="scan-time"/);
});

test('dismiss toast passes the message before the level', () => {
  assert.match(status, /showToast\(\s*'Historical conflict report dismissed'\s*,\s*'info'\s*\)/);
  assert.doesNotMatch(status, /showToast\(\s*'info'\s*,\s*'Historical conflict report dismissed'\s*\)/);
});

test('shared header refresh keeps feedback off the icon button', () => {
  assert.match(common, /registerHeaderRefresh/);
  assert.match(common, /id="headerRefreshStatus"/);
  assert.match(common, /aria-live="polite"/);
});
