'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STATUS = path.join(__dirname, '../../status');

function element() {
  const classes = new Set();
  return {
    textContent: '',
    className: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      has(name) { return classes.has(name); },
    },
  };
}

function loadHealth() {
  const html = fs.readFileSync(path.join(STATUS, 'health.html'), 'utf8');
  const start = html.indexOf('async function getJson');
  const end = html.indexOf('try{ if (window.DTP && DTP.attachCalliope)');
  assert.ok(start > 0 && end > start, 'health functions were not found');
  const elements = new Map();
  const sandbox = {
    fetch: async () => { throw new Error('fetch was not installed'); },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
    window: {},
  };
  vm.runInNewContext(`${html.slice(start, end)}\nthis.refreshHealth = refreshHealth;`, sandbox, { timeout: 1000 });
  return {
    refresh: sandbox.refreshHealth,
    element(id) { return elements.get(id); },
    setFetch(handler) { sandbox.fetch = handler; },
  };
}

function respond(map) {
  return async (url) => {
    if (!Object.prototype.hasOwnProperty.call(map, url)) throw new Error(`unexpected ${url}`);
    const body = map[url];
    return { ok: true, status: 200, json: async () => body };
  };
}

const report = { ngrok: 'https://example.test', results: { app: { ok: true } } };
const routes = {
  generatedAt: '2026-11-27T00:00:00.000Z',
  nginxConflicts: { totalConflicts: 0 },
};

function classifyCatalog() {
  const html = fs.readFileSync(path.join(STATUS, 'reports.html'), 'utf8');
  const start = html.indexOf('const itemsPerPage = 10;');
  const end = html.indexOf('function clearCatalogChrome');
  assert.ok(start > 0 && end > start, 'catalog classifier was not found');
  return vm.runInNewContext(`${html.slice(start, end)}\nclassifyCatalog`, {}, { timeout: 1000 });
}

test('a valid health read is a successful re-read and a known unavailable proxy is not a success claim', async () => {
  const page = loadHealth();
  page.setFetch(respond({ '/health.json': { status: 'ok' }, '/status.json': report, '/routes.json': routes }));
  const status = element();
  await page.refresh(status);
  assert.equal(status.textContent, 'Health re-read');
  assert.equal(status.classList.has('is-error'), false);
  assert.equal(page.element('observed-health').textContent, 'Proxy responding');
  assert.match(page.element('observed-health').className, /\bok\b/);
  assert.equal(page.element('scan-time').textContent, routes.generatedAt);
  assert.match(page.element('scan-conflicts').className, /\bok\b/);

  const unavailable = loadHealth();
  unavailable.setFetch(respond({
    '/health.json': { status: 'unavailable' },
    '/status.json': report,
    '/routes.json': routes,
  }));
  const unavailableStatus = element();
  await unavailable.refresh(unavailableStatus);
  assert.equal(unavailable.element('observed-health').textContent, 'Proxy not ok');
  assert.equal(unavailableStatus.textContent, 'Health re-read');
});

test('HTTP 200 null or array routes stay unavailable and are not a health re-read', async () => {
  for (const body of [null, ['route']]) {
    const page = loadHealth();
    page.setFetch(respond({ '/health.json': { status: 'ok' }, '/status.json': report, '/routes.json': body }));
    const status = element();
    await page.refresh(status);
    assert.equal(page.element('report-available').textContent, 'Unavailable', JSON.stringify(body));
    assert.equal(page.element('routes-json').textContent === 'Unavailable' || Array.isArray(body), true);
    assert.notEqual(status.textContent, 'Health re-read', JSON.stringify(body));
    assert.equal(status.classList.has('is-error'), true);
  }
});

test('a missing or invalid scan time never paints a green zero', async () => {
  for (const generatedAt of [undefined, '', 'not-a-time', 0]) {
    const page = loadHealth();
    const body = { nginxConflicts: { totalConflicts: 0 } };
    if (generatedAt !== undefined) body.generatedAt = generatedAt;
    page.setFetch(respond({ '/health.json': { status: 'ok' }, '/status.json': report, '/routes.json': body }));
    const status = element();
    await page.refresh(status);
    assert.equal(page.element('scan-time').textContent, 'Unknown', String(generatedAt));
    assert.doesNotMatch(page.element('scan-conflicts').className, /\bok\b/);
    assert.notEqual(status.textContent, 'Health re-read');
  }
});

test('an unknown liveness status is not a successful re-read', async () => {
  const page = loadHealth();
  page.setFetch(respond({
    '/health.json': { status: 'degraded' },
    '/status.json': report,
    '/routes.json': routes,
  }));
  const status = element();
  await page.refresh(status);
  assert.notEqual(page.element('observed-health').textContent, 'Proxy responding');
  assert.doesNotMatch(page.element('observed-health').className, /\bok\b/);
  assert.notEqual(status.textContent, 'Health re-read');
  assert.equal(status.classList.has('is-error'), true);
});

test('report classification keeps valid rows and explicit partial states, and rejects null or over-limit pages', () => {
  const classify = classifyCatalog();
  const row = { name: 'health-1.json', size: 12 };
  const populated = classify({ ok: true, items: [row], pagination: { total: 1 } }, 1);
  assert.equal(populated.kind, 'populated');
  assert.equal(populated.items[0], row);
  const lastPage = classify({
    ok: true,
    items: [{ name: 'a.json' }, { name: 'b.json' }],
    pagination: { total: 12 },
  }, 2);
  assert.equal(lastPage.kind, 'populated');
  assert.equal(classify({ ok: true, items: [], pagination: { total: 0 } }, 1).kind, 'empty');
  assert.equal(classify({ ok: true, items: [], pagination: { total: 5 } }, 2).kind, 'out-of-range');
  assert.notEqual(classify({ ok: true, items: [null], pagination: { total: 1 } }, 1).kind, 'populated');
  const overLimit = Array.from({ length: 11 }, (_, index) => ({ name: `r-${index}.json` }));
  assert.notEqual(classify({ ok: true, items: overLimit, pagination: { total: 11 } }, 1).kind, 'populated');
  assert.equal(classify({ ok: true, items: [], pagination: { total: 0 } }, 1).kind, 'empty');
});
