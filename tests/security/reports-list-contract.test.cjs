'use strict';
/**
 * V138 RED→GREEN: Reports API/UI contract + bounded async catalog.
 * Runs in an isolated scratch tree only; does not touch the live status mount.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../..');
const CATALOG = path.join(ROOT, 'utils/reports-list-catalog.cjs');
const API_JS = path.join(ROOT, 'utils/proxyConfigAPI.js');
const REPORTS_HTML = path.join(ROOT, 'status/reports.html');

function loadCatalog() {
  delete require.cache[require.resolve(CATALOG)];
  const mod = require(CATALOG);
  if (typeof mod.resetCatalogAdmissionForTests === 'function') {
    mod.resetCatalogAdmissionForTests();
  }
  return mod;
}

async function withTempDir(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'v138-reports-'));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('RED: current sync reports/list stats every entry before pagination (1000 names, limit=10)', async () => {
  const { listReportsCatalogSyncCurrent } = loadCatalog();
  await withTempDir(async (dir) => {
    for (let i = 0; i < 1000; i++) {
      await fsp.writeFile(path.join(dir, `report-${String(i).padStart(4, '0')}.json`), '{}');
    }
    const { body, stats } = listReportsCatalogSyncCurrent(dir, { page: 1, limit: 10 });
    assert.equal(body.ok, true);
    assert.equal(body.items.length, 10);
    assert.equal(body.pagination.total, 1000);
    assert.equal(stats.statCalls, 1000, 'paginated response must not hide unbounded sync stat work');
    assert.equal(stats.mkdirCalled, true, 'current GET path mutates via mkdirSync');
  });
});

test('RED: current Reports UI treats nonempty API items as empty (contract mismatch)', () => {
  const { normalizeReportsListPayload } = loadCatalog();
  const apiBody = {
    ok: true,
    items: [{ name: 'a.json', size: 1, mtimeMs: 1000 }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasMore: false },
  };
  // Exact frontend predicate from status/reports.html before fix:
  const legacyEmpty = !apiBody.reports || apiBody.reports.length === 0;
  assert.equal(legacyEmpty, true, 'legacy UI looks for data.reports and falsely empties');
  const normalized = normalizeReportsListPayload(apiBody);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.total, 1);
});

test('RED/synthetic: sync metadata work starves a short timer (event-loop risk)', async () => {
  const { listReportsCatalogSyncCurrent } = loadCatalog();
  await withTempDir(async (dir) => {
    for (let i = 0; i < 120; i++) {
      await fsp.writeFile(path.join(dir, `slow-${i}.json`), '{}');
    }
    const io = {
      mkdirSync() {},
      readdirSync: () => fs.readdirSync(dir),
      statSync: (p) => {
        const end = Date.now() + 2;
        while (Date.now() < end) { /* busy */ }
        return fs.statSync(p);
      },
    };
    let timerFiredAt = null;
    const started = Date.now();
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerFiredAt = Date.now() - started;
        resolve();
      }, 15);
    });
    listReportsCatalogSyncCurrent(dir, { page: 1, limit: 5 }, io);
    await timer;
    assert.ok(timerFiredAt != null);
    assert.ok(
      timerFiredAt >= 100,
      `expected sync scan to delay 15ms timer substantially, saw ${timerFiredAt}ms`
    );
  });
});

test('GREEN: async catalog pages 10 of 1000 without sync mkdir and with bounded concurrency', async () => {
  const { listReportsCatalog } = loadCatalog();
  await withTempDir(async (dir) => {
    for (let i = 0; i < 1000; i++) {
      await fsp.writeFile(path.join(dir, `report-${String(i).padStart(4, '0')}.json`), '{}');
    }
    let maxActive = 0;
    let active = 0;
    let lstatCalls = 0;
    const fsMock = {
      access: async () => {},
      readdir: async () => fs.readdirSync(dir),
      lstat: async (p) => {
        active++;
        if (active > maxActive) maxActive = active;
        lstatCalls++;
        try {
          await new Promise((r) => setTimeout(r, 1));
          return fs.lstatSync(p);
        } finally {
          active--;
        }
      },
    };
    const body = await listReportsCatalog({
      reportsDir: dir,
      query: { page: 1, limit: 10 },
      concurrency: 8,
      fs: fsMock,
      includeDebug: true,
    });
    assert.equal(body.ok, true);
    assert.equal(body.items.length, 10);
    assert.equal(body.pagination.total, 1000);
    assert.equal(lstatCalls, 1000);
    assert.ok(maxActive <= 8, `concurrency exceeded: ${maxActive}`);
    assert.ok((body._debug && body._debug.maxActive || maxActive) <= 8);
  });
});

test('GREEN: missing reports directory is empty and read-only (no mkdir)', async () => {
  const { listReportsCatalog } = loadCatalog();
  const missing = path.join(os.tmpdir(), `v138-missing-${Date.now()}`);
  const body = await listReportsCatalog({ reportsDir: missing, query: { page: 1, limit: 10 } });
  assert.equal(body.ok, true);
  assert.deepEqual(body.items, []);
  assert.equal(body.pagination.total, 0);
  assert.equal(fs.existsSync(missing), false);
});

test('GREEN: symlink / non-file entries are not traversed as report files', async () => {
  const { listReportsCatalog } = loadCatalog();
  await withTempDir(async (dir) => {
    await fsp.writeFile(path.join(dir, 'real.json'), '{"ok":1}');
    await fsp.mkdir(path.join(dir, 'subdir'));
    await fsp.symlink(path.join(dir, 'real.json'), path.join(dir, 'link.json'));
    const body = await listReportsCatalog({ reportsDir: dir, query: { page: 1, limit: 10 } });
    assert.equal(body.ok, true);
    assert.equal(body.pagination.total, 1);
    assert.equal(body.items[0].name, 'real.json');
    assert.equal(body.items.some((i) => i.name === 'link.json'), false);
  });
});

test('GREEN: metadata failure is an explicit incomplete error (not silent omit)', async () => {
  const { listReportsCatalog } = loadCatalog();
  await withTempDir(async (dir) => {
    await fsp.writeFile(path.join(dir, 'good.json'), '{}');
    await fsp.writeFile(path.join(dir, 'bad.json'), '{}');
    const fsMock = {
      access: async () => {},
      readdir: async () => ['good.json', 'bad.json'],
      lstat: async (p) => {
        if (String(p).endsWith('bad.json')) {
          const err = new Error('EACCES simulated');
          err.code = 'EACCES';
          throw err;
        }
        return fs.lstatSync(p);
      },
    };
    const body = await listReportsCatalog({ reportsDir: dir, query: { page: 1, limit: 10 }, fs: fsMock });
    assert.equal(body.ok, false);
    assert.equal(body.incomplete, true);
    assert.equal(body.code, 'REPORTS_META_FAILED');
    assert.match(String(body.error), /EACCES|simulated|reports/i);
    assert.equal(String(body.error).includes(dir), false, 'no raw host path in error');
  });
});

test('GREEN: hung async lstat yields bounded timeout error', async () => {
  const { listReportsCatalog } = loadCatalog();
  let releaseHung;
  const hung = new Promise((resolve) => { releaseHung = resolve; });
  const fsMock = {
    access: async () => {},
    readdir: async () => ['hung.json'],
    // Stays pending until we explicitly release after the catalog timeout path returns.
    lstat: async () => hung.then(() => ({ isFile: () => true, size: 1, mtimeMs: 1 })),
  };
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 10 },
    fs: fsMock,
    metaTimeoutMs: 50,
  });
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORTS_META_TIMEOUT');
  assert.equal(body.incomplete, true);
  releaseHung();
  await hung;
});

test('GREEN: overlarge directory and invalid page/limit are honest', async () => {
  const { listReportsCatalog, parsePageLimit } = loadCatalog();
  assert.deepEqual(parsePageLimit({ page: '0', limit: '-3' }), { page: 1, limit: 10 });
  assert.deepEqual(parsePageLimit({ page: '2', limit: '5' }), { page: 2, limit: 5 });
  const fsMock = {
    access: async () => {},
    readdir: async () => Array.from({ length: 12 }, (_, i) => `f${i}.json`),
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused',
    query: { page: 1, limit: 10 },
    maxEntries: 10,
    fs: fsMock,
  });
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORTS_TOO_MANY_ENTRIES');
});

test('GREEN: async catalog yields so a concurrent health timer can fire', async () => {
  const { listReportsCatalog } = loadCatalog();
  await withTempDir(async (dir) => {
    for (let i = 0; i < 120; i++) {
      await fsp.writeFile(path.join(dir, `n-${i}.json`), '{}');
    }
    const fsMock = {
      access: async () => {},
      readdir: async () => fs.readdirSync(dir),
      lstat: async (p) => {
        await new Promise((r) => setTimeout(r, 2));
        return fs.lstatSync(p);
      },
    };
    let timerMs = null;
    const started = Date.now();
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerMs = Date.now() - started;
        resolve();
      }, 15);
    });
    const listing = listReportsCatalog({
      reportsDir: dir,
      query: { page: 1, limit: 5 },
      concurrency: 8,
      yieldEvery: 8,
      fs: fsMock,
    });
    await timer;
    const body = await listing;
    assert.equal(body.ok, true);
    assert.ok(timerMs != null && timerMs < 120, `timer starved: ${timerMs}ms`);
  });
});

test('GREEN: disposable server keeps /admin/check responsive during slow reports/list', async () => {
  const { listReportsCatalog } = loadCatalog();
  await withTempDir(async (dir) => {
    for (let i = 0; i < 40; i++) {
      await fsp.writeFile(path.join(dir, `r-${i}.json`), '{}');
    }
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/admin/check') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ authenticated: false }));
        return;
      }
      if (u.pathname === '/devproxy/api/reports/list') {
        const body = await listReportsCatalog({
          reportsDir: dir,
          query: Object.fromEntries(u.searchParams),
          concurrency: 4,
          fs: {
            access: async () => {},
            readdir: async () => fs.readdirSync(dir),
            lstat: async (p) => {
              await new Promise((r) => setTimeout(r, 15));
              return fs.lstatSync(p);
            },
          },
        });
        res.writeHead(body.ok ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const listReq = http.get(`http://127.0.0.1:${port}/devproxy/api/reports/list?page=1&limit=5`);
    const checks = [];
    for (let i = 0; i < 5; i++) {
      checks.push(
        new Promise((resolve, reject) => {
          const t0 = Date.now();
          http
            .get(`http://127.0.0.1:${port}/admin/check`, (res) => {
              res.resume();
              resolve({ status: res.statusCode, ms: Date.now() - t0 });
            })
            .on('error', reject);
        })
      );
      await new Promise((r) => setTimeout(r, 10));
    }
    const checkResults = await Promise.all(checks);
    const listBody = await new Promise((resolve, reject) => {
      listReq.on('response', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      });
      listReq.on('error', reject);
    });
    server.close();
    assert.equal(listBody.status, 200);
    assert.equal(listBody.body.ok, true);
    for (const c of checkResults) {
      assert.equal(c.status, 401);
      assert.ok(c.ms < 100, `admin/check too slow under load: ${c.ms}ms`);
    }
  });
});

test('GREEN: proxyConfigAPI.js reports/list uses async catalog (no sync mkdir/readdir/stat in branch)', () => {
  const src = fs.readFileSync(API_JS, 'utf8');
  const start = src.indexOf("apiPath('reports/list')");
  assert.ok(start > 0);
  const branch = src.slice(start, start + 1200);
  assert.match(branch, /reports-list-catalog|listReportsCatalog/);
  assert.doesNotMatch(branch, /mkdirSync\(/);
  assert.doesNotMatch(branch, /readdirSync\(/);
  assert.doesNotMatch(branch, /statSync\(/);
});

test('GREEN: reports.html consumes items/pagination.total/mtimeMs with safe text nodes', () => {
  const html = fs.readFileSync(REPORTS_HTML, 'utf8');
  assert.match(html, /data\.items/);
  assert.match(html, /pagination\.total|Number\(data\.pagination\.total\)/);
  assert.match(html, /mtimeMs/);
  assert.equal(/\bdata\.reports\b/.test(html), false);
  assert.equal(/\blastModified\b/.test(html), false);
  // name must not be interpolated into innerHTML
  assert.doesNotMatch(html, /innerHTML\s*=\s*`[\s\S]*\$\{r\.name\}/);
  assert.match(html, /nameTd\.textContent/);
});

test('SYNTHETIC: malicious-shaped report names stay inert under textContent assignment contract', () => {
  const { normalizeReportsListPayload } = loadCatalog();
  const evil = '<img src=x onerror=alert(1)>.json';
  const normalized = normalizeReportsListPayload({
    ok: true,
    items: [{ name: evil, size: 3, mtimeMs: Date.now() }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasMore: false },
  });
  assert.equal(normalized.items[0].name, evil);
  // Synthetic DOM stand-in (not a live browser / jsdom Reports page).
  function safeCell(text) {
    const td = { textContent: '' };
    td.textContent = String(text);
    return td.textContent;
  }
  assert.equal(safeCell(evil), evil);
  assert.equal(safeCell(evil).includes('<img'), true); // textual, not parsed HTML
  // Source-exact UI still assigns via nameTd.textContent (see reports.html static check).
  const html = fs.readFileSync(REPORTS_HTML, 'utf8');
  assert.match(html, /nameTd\.textContent\s*=/);
  void pathToFileURL;
});

test('RED→GREEN: nonsettling lstat stops scheduling after first timeout (<= concurrency launched)', async () => {
  const { listReportsCatalog } = loadCatalog();
  let underlyingLaunched = 0;
  const never = new Promise(() => {});
  const names = Array.from({ length: 96 }, (_, i) => `hang-${i}.json`);
  const fsMock = {
    access: async () => {},
    readdir: async () => names,
    lstat: async () => {
      underlyingLaunched += 1;
      return never;
    },
  };
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 10 },
    concurrency: 8,
    metaTimeoutMs: 10,
    fs: fsMock,
    includeDebug: true,
  });
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORTS_META_TIMEOUT');
  assert.ok(
    underlyingLaunched <= 8,
    `timeout must not fan out work: launched ${underlyingLaunched}`
  );
  assert.ok(
    (body._debug && body._debug.launched || underlyingLaunched) <= 8,
    'debug launched must stay within concurrency'
  );
});

test('RED→GREEN: hung access returns bounded public timeout (no hang past deadline)', async () => {
  const { listReportsCatalog } = loadCatalog();
  const fsMock = {
    access: () => new Promise(() => {}),
    readdir: async () => ['a.json'],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const t0 = Date.now();
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 25,
    fs: fsMock,
  });
  const elapsed = Date.now() - t0;
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORTS_DIR_TIMEOUT');
  assert.equal(String(body.error).includes('/'), false);
  assert.ok(elapsed < 200, `access hung past bound: ${elapsed}ms`);
});

test('RED→GREEN: hung readdir returns bounded public timeout', async () => {
  const { listReportsCatalog } = loadCatalog();
  const fsMock = {
    access: async () => {},
    readdir: () => new Promise(() => {}),
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const t0 = Date.now();
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 25,
    fs: fsMock,
  });
  const elapsed = Date.now() - t0;
  assert.equal(body.ok, false);
  assert.equal(body.code, 'REPORTS_READDIR_TIMEOUT');
  assert.equal(String(body.error).includes('/'), false);
  assert.ok(elapsed < 200, `readdir hung past bound: ${elapsed}ms`);
});

test('RED→GREEN: concurrent callers share admission (BUSY) without unbounded fs fan-out', async () => {
  const { listReportsCatalog, resetCatalogAdmissionForTests } = loadCatalog();
  resetCatalogAdmissionForTests();
  let underlying = 0;
  let maxUnderlying = 0;
  const never = new Promise(() => {});
  const fsMock = {
    access: async () => {},
    readdir: async () => ['only.json'],
    lstat: async () => {
      underlying += 1;
      maxUnderlying = Math.max(maxUnderlying, underlying);
      return never;
    },
  };
  const calls = Array.from({ length: 20 }, () =>
    listReportsCatalog({
      reportsDir: '/tmp/unused-reports-dir',
      query: { page: 1, limit: 1 },
      concurrency: 8,
      metaTimeoutMs: 40,
      fs: fsMock,
    })
  );
  const results = await Promise.all(calls);
  const busy = results.filter((r) => r && r.code === 'REPORTS_LIST_BUSY');
  const timed = results.filter((r) => r && r.code === 'REPORTS_META_TIMEOUT');
  assert.equal(busy.length + timed.length, 20);
  assert.ok(busy.length >= 19, `expected admission BUSY for excess callers, got busy=${busy.length}`);
  assert.ok(timed.length >= 1, 'at least one admitted caller must time out');
  assert.ok(maxUnderlying <= 8, `unbounded fs fan-out: maxUnderlying=${maxUnderlying}`);
  assert.ok(underlying <= 8, `total underlying launched ${underlying} exceeds concurrency`);
  resetCatalogAdmissionForTests();
});

test('RED: underlying filesystem ops must register before they execute', async () => {
  // CTO contract #6763946937: register each original FS Promise before it runs.
  // Sync-starting mocks observe outstandingIo at the first moment of execution.
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  const outstandingAtStart = [];
  const fsMock = {
    access: () => {
      outstandingAtStart.push(getCatalogAdmissionStateForTests().outstandingIo);
      return new Promise(() => {});
    },
    readdir: async () => ['x.json'],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const body = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 20,
    fs: fsMock,
  });
  assert.equal(body.code, 'REPORTS_DIR_TIMEOUT');
  assert.equal(outstandingAtStart.length, 1);
  assert.ok(
    outstandingAtStart[0] >= 1,
    `FS op started before registration: outstandingIo@start=${outstandingAtStart[0]}`
  );
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: sequential metadata timeouts must not accumulate unresolved lstat work', async () => {
  // CTO residual #6763783037 / contract #6763946937: Promise.race timeout must not free
  // global capacity while underlying lstat promises remain unresolved.
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let underlyingLaunched = 0;
  const never = new Promise(() => {});
  const names = Array.from({ length: 96 }, (_, i) => `hang-${i}.json`);
  const fsMock = {
    access: async () => {},
    readdir: async () => names,
    lstat: async () => {
      underlyingLaunched += 1;
      return never;
    },
  };
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await listReportsCatalog({
        reportsDir: '/tmp/unused-reports-dir',
        query: { page: 1, limit: 10 },
        concurrency: 8,
        metaTimeoutMs: 10,
        fs: fsMock,
        includeDebug: true,
      })
    );
  }
  const timed = results.filter((r) => r && r.code === 'REPORTS_META_TIMEOUT');
  const busy = results.filter((r) => r && r.code === 'REPORTS_LIST_BUSY');
  assert.equal(timed.length, 1, `expected one META_TIMEOUT, got ${timed.length}`);
  assert.equal(busy.length, 5, `expected five BUSY fail-closed, got ${busy.length}`);
  assert.ok(
    underlyingLaunched <= 8,
    `sequential timeouts accumulated unresolved lstats: launched=${underlyingLaunched}`
  );
  const snap = getCatalogAdmissionStateForTests();
  assert.ok(snap.outstandingIo >= 1, 'admission must account for unresolved underlying IO');
  assert.ok(snap.active >= 1, 'quarantine slot must remain held while IO is unresolved');
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: sequential directory access timeouts must not accumulate unresolved access work', async () => {
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let accessLaunched = 0;
  const fsMock = {
    access: () => {
      accessLaunched += 1;
      return new Promise(() => {});
    },
    readdir: async () => ['a.json'],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await listReportsCatalog({
        reportsDir: '/tmp/unused-reports-dir',
        query: { page: 1, limit: 1 },
        dirTimeoutMs: 15,
        fs: fsMock,
      })
    );
  }
  const timed = results.filter((r) => r && r.code === 'REPORTS_DIR_TIMEOUT');
  const busy = results.filter((r) => r && r.code === 'REPORTS_LIST_BUSY');
  assert.equal(timed.length, 1, `expected one DIR_TIMEOUT, got ${timed.length}`);
  assert.equal(busy.length, 5, `expected five BUSY fail-closed, got ${busy.length}`);
  assert.equal(accessLaunched, 1, `accumulated unresolved access calls: ${accessLaunched}`);
  const snap = getCatalogAdmissionStateForTests();
  assert.ok(snap.outstandingIo >= 1, 'outstanding access must remain visible to admission');
  assert.ok(snap.active >= 1, 'quarantine slot must remain held after dir timeout');
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: sequential readdir timeouts must not accumulate unresolved readdir work', async () => {
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let readdirLaunched = 0;
  const fsMock = {
    access: async () => {},
    readdir: () => {
      readdirLaunched += 1;
      return new Promise(() => {});
    },
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await listReportsCatalog({
        reportsDir: '/tmp/unused-reports-dir',
        query: { page: 1, limit: 1 },
        dirTimeoutMs: 15,
        fs: fsMock,
      })
    );
  }
  const timed = results.filter((r) => r && r.code === 'REPORTS_READDIR_TIMEOUT');
  const busy = results.filter((r) => r && r.code === 'REPORTS_LIST_BUSY');
  assert.equal(timed.length, 1, `expected one READDIR_TIMEOUT, got ${timed.length}`);
  assert.equal(busy.length, 5, `expected five BUSY fail-closed, got ${busy.length}`);
  assert.equal(readdirLaunched, 1, `accumulated unresolved readdir calls: ${readdirLaunched}`);
  const snap = getCatalogAdmissionStateForTests();
  assert.ok(snap.outstandingIo >= 1, 'outstanding readdir must remain visible to admission');
  assert.ok(snap.active >= 1, 'quarantine slot must remain held after readdir timeout');
  resetCatalogAdmissionForTests();
});

test('GREEN: admission releases after timed-out underlying IO eventually settles', async () => {
  // Promise.race does not cancel; once the underlying op settles, capacity must reopen.
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let resolveHung;
  const hung = new Promise((resolve) => { resolveHung = resolve; });
  let accessCalls = 0;
  const fsMock = {
    access: () => {
      accessCalls += 1;
      if (accessCalls === 1) return hung;
      return Promise.resolve();
    },
    readdir: async () => [],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const first = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 20,
    fs: fsMock,
  });
  assert.equal(first.code, 'REPORTS_DIR_TIMEOUT');
  const blocked = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 20,
    fs: fsMock,
  });
  assert.equal(blocked.code, 'REPORTS_LIST_BUSY');
  resolveHung();
  await hung;
  await new Promise((r) => setImmediate(r));
  const snap = getCatalogAdmissionStateForTests();
  assert.equal(snap.outstandingIo, 0);
  assert.equal(snap.active, 0);
  const after = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 50,
    fs: fsMock,
  });
  assert.equal(after.ok, true);
  assert.equal(after.pagination.total, 0);
  resetCatalogAdmissionForTests();
});

test('GREEN: late rejection of timed-out IO also restores admission (fire-and-forget lifetime)', async () => {
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let rejectHung;
  const hung = new Promise((_, reject) => { rejectHung = reject; });
  // Prevent unhandled rejection noise from the fire-and-forget underlying op.
  hung.catch(() => {});
  let accessCalls = 0;
  const fsMock = {
    access: () => {
      accessCalls += 1;
      if (accessCalls === 1) return hung;
      return Promise.resolve();
    },
    readdir: async () => [],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const first = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 15,
    fs: fsMock,
  });
  assert.equal(first.code, 'REPORTS_DIR_TIMEOUT');
  assert.equal(
    (await listReportsCatalog({
      reportsDir: '/tmp/unused-reports-dir',
      query: { page: 1, limit: 1 },
      fs: fsMock,
    })).code,
    'REPORTS_LIST_BUSY'
  );
  rejectHung(Object.assign(new Error('late'), { code: 'EIO' }));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const snap = getCatalogAdmissionStateForTests();
  assert.equal(snap.outstandingIo, 0);
  assert.equal(snap.active, 0);
  const after = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    fs: fsMock,
  });
  assert.equal(after.ok, true);
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: eight stuck metadata ops + twelve retries stay bounded (no extra IO)', async () => {
  // CTO contract #6763946937: permit pool bounds actual ops; retries reject BUSY.
  const { listReportsCatalog, resetCatalogAdmissionForTests } = loadCatalog();
  resetCatalogAdmissionForTests();
  let underlying = 0;
  const never = new Promise(() => {});
  const names = Array.from({ length: 64 }, (_, i) => `n-${i}.json`);
  const fsMock = {
    access: async () => {},
    readdir: async () => names,
    lstat: async () => {
      underlying += 1;
      return never;
    },
  };
  const first = listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    concurrency: 8,
    metaTimeoutMs: 25,
    fs: fsMock,
  });
  // Let the admitted request launch its bounded workers before flooding retries.
  await new Promise((r) => setTimeout(r, 5));
  const retries = await Promise.all(
    Array.from({ length: 12 }, () =>
      listReportsCatalog({
        reportsDir: '/tmp/unused-reports-dir',
        query: { page: 1, limit: 1 },
        concurrency: 8,
        metaTimeoutMs: 25,
        fs: fsMock,
      })
    )
  );
  const timed = await first;
  assert.equal(timed.code, 'REPORTS_META_TIMEOUT');
  assert.equal(retries.every((r) => r.code === 'REPORTS_LIST_BUSY'), true);
  assert.ok(underlying <= 8, `permit pool exceeded: underlying=${underlying}`);
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: 1000 sequential retries while quarantined launch no additional FS work', async () => {
  const {
    listReportsCatalog,
    resetCatalogAdmissionForTests,
    getCatalogAdmissionStateForTests,
  } = loadCatalog();
  resetCatalogAdmissionForTests();
  let accessLaunched = 0;
  const fsMock = {
    access: () => {
      accessLaunched += 1;
      return new Promise(() => {});
    },
    readdir: async () => [],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const first = await listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    dirTimeoutMs: 10,
    fs: fsMock,
  });
  assert.equal(first.code, 'REPORTS_DIR_TIMEOUT');
  assert.equal(accessLaunched, 1);
  let busy = 0;
  for (let i = 0; i < 1000; i++) {
    const body = await listReportsCatalog({
      reportsDir: '/tmp/unused-reports-dir',
      query: { page: 1, limit: 1 },
      dirTimeoutMs: 10,
      fs: fsMock,
    });
    if (body.code === 'REPORTS_LIST_BUSY') busy += 1;
  }
  assert.equal(busy, 1000);
  assert.equal(accessLaunched, 1, 'quarantine must not launch additional access calls');
  const snap = getCatalogAdmissionStateForTests();
  assert.ok(snap.active >= 1 && snap.outstandingIo >= 1);
  resetCatalogAdmissionForTests();
});

test('GREEN: disposable /admin/check stays responsive while Reports list is BUSY-quarantined', async () => {
  // Synthetic localhost only — not the production Dev Proxy handler.
  const { listReportsCatalog, resetCatalogAdmissionForTests } = loadCatalog();
  resetCatalogAdmissionForTests();
  let resolveHung;
  const hung = new Promise((resolve) => { resolveHung = resolve; });
  const fsMock = {
    access: () => hung,
    readdir: async () => [],
    lstat: async () => ({ isFile: () => true, size: 1, mtimeMs: 1 }),
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname === '/admin/check') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false }));
      return;
    }
    if (u.pathname === '/devproxy/api/reports/list') {
      const body = await listReportsCatalog({
        reportsDir: '/tmp/unused-reports-dir',
        query: Object.fromEntries(u.searchParams),
        dirTimeoutMs: 30,
        fs: fsMock,
      });
      const status = body.code === 'REPORTS_LIST_BUSY' ? 503 : body.ok ? 200 : 500;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const getJson = (pathname) =>
    new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}${pathname}`, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: res.statusCode,
              body: raw ? JSON.parse(raw) : null,
            });
          });
        })
        .on('error', reject);
    });

  const listing = getJson('/devproxy/api/reports/list?page=1&limit=1');
  await new Promise((r) => setTimeout(r, 5));
  const checkDuring = await getJson('/admin/check');
  const busy = await getJson('/devproxy/api/reports/list?page=1&limit=1');
  const timed = await listing;
  assert.equal(checkDuring.status, 401);
  assert.equal(timed.body.code, 'REPORTS_DIR_TIMEOUT');
  assert.equal(busy.status, 503);
  assert.equal(busy.body.code, 'REPORTS_LIST_BUSY');

  resolveHung();
  await hung;
  await new Promise((r) => setImmediate(r));
  const recovered = await getJson('/devproxy/api/reports/list?page=1&limit=1');
  server.close();
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.ok, true);
  resetCatalogAdmissionForTests();
});

test('RED→GREEN: unrecognized absolute filesystem paths never appear in public errors', () => {
  const { sanitizeErrorMessage, listReportsCatalog } = loadCatalog();
  const leaked = "lstat '/Volumes/ExternalDisk/user-private/report-1234.json'";
  const sanitized = sanitizeErrorMessage(new Error(leaked));
  assert.equal(sanitized.includes('/Volumes'), false);
  assert.equal(sanitized.includes('ExternalDisk'), false);
  assert.equal(sanitized.includes('user-private'), false);
  assert.equal(sanitized.includes('report-1234'), false);
  assert.equal(sanitized.includes('/'), false);
  assert.match(sanitized, /reports_/);

  // Through catalog failure path (synthetic fs stub; not live host reports).
  return listReportsCatalog({
    reportsDir: '/tmp/unused-reports-dir',
    query: { page: 1, limit: 1 },
    fs: {
      access: async () => {},
      readdir: async () => ['x.json'],
      lstat: async () => {
        const err = new Error(leaked);
        err.code = 'EIO';
        throw err;
      },
    },
  }).then((body) => {
    assert.equal(body.ok, false);
    assert.equal(body.code, 'REPORTS_META_FAILED');
    assert.equal(String(body.error).includes('/Volumes'), false);
    assert.equal(String(body.error).includes('ExternalDisk'), false);
    assert.equal(String(body.error).includes('/'), false);
  });
});

test('SOURCE-EXACT static: proxyConfigAPI reports/list catch uses fixed nonsecret error', () => {
  const src = fs.readFileSync(API_JS, 'utf8');
  const start = src.indexOf("apiPath('reports/list')");
  assert.ok(start > 0);
  const branch = src.slice(start, start + 1600);
  assert.match(branch, /REPORTS_LIST_EXCEPTION|reports_list_failed/);
  assert.doesNotMatch(branch, /e\.message\)\s*\?\s*String\(e\.message\)\.replace/);
  assert.match(branch, /REPORTS_LIST_BUSY/);
});
