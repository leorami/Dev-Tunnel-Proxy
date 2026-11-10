'use strict';
/**
 * Bounded, async, read-only reports directory catalog for GET reports/list.
 * Keeps the public response shape { ok, items, pagination } while avoiding
 * unbounded synchronous readdir/stat work on the shared Node event loop.
 *
 * V138 corrective: stop scheduling after metadata timeout, admit one catalog
 * at a time (or REPORTS_LIST_BUSY), bound access/readdir, and never leak
 * filesystem paths in public error strings.
 *
 * V138 residual / lease quarantine (CTO #6763783037 + contract #6763946937):
 * - Register each underlying filesystem Promise BEFORE it executes.
 * - Promise.race deadlines stop waiting only; they do NOT cancel or release
 *   the underlying filesystem operation.
 * - Process-level admission stays owned until the request has finished AND
 *   every tracked original operation has truly resolved or rejected.
 * - Sequential retries fail closed with REPORTS_LIST_BUSY while unresolved
 *   work remains; admission restores automatically after real settlement.
 */
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const DEFAULTS = Object.freeze({
  maxEntries: 5000,
  concurrency: 8,
  metaTimeoutMs: 2000,
  dirTimeoutMs: 2000,
  yieldEvery: 32,
  maxConcurrentCatalogs: 1,
});

/** Process-local admission for concurrent listReportsCatalog callers. */
const admissionState = {
  active: 0,
  outstandingIo: 0,
  generation: 0,
};

function resetCatalogAdmissionForTests() {
  admissionState.generation += 1;
  admissionState.active = 0;
  admissionState.outstandingIo = 0;
}

function getCatalogAdmissionStateForTests() {
  return {
    active: admissionState.active,
    outstandingIo: admissionState.outstandingIo,
  };
}

function createIoTracker() {
  return {
    outstanding: 0,
    requestDone: false,
    generation: admissionState.generation,
  };
}

function settleTrackedIo(tracker, gen) {
  if (admissionState.generation === gen) {
    admissionState.outstandingIo = Math.max(0, admissionState.outstandingIo - 1);
  }
  tracker.outstanding = Math.max(0, tracker.outstanding - 1);
  maybeReleaseAdmission(tracker);
}

/**
 * Register the FS lease slot FIRST, then start the operation.
 * Timeout via Promise.race is not cancellation — the returned promise may
 * remain pending after the API response returns.
 */
function startTrackedFs(tracker, startFn) {
  const gen = tracker.generation;
  admissionState.outstandingIo += 1;
  tracker.outstanding += 1;

  let started;
  try {
    started = startFn();
  } catch (err) {
    settleTrackedIo(tracker, gen);
    return Promise.reject(err);
  }

  const underlying = Promise.resolve(started);
  underlying.then(
    () => {},
    () => {}
  ).finally(() => settleTrackedIo(tracker, gen));
  return underlying;
}

/**
 * Release admission only after BOTH:
 * 1) the catalog request has completed (including timed-out responses), and
 * 2) all original tracked filesystem operations have settled.
 * Must not await from the request path (would delay the timed-out response).
 */
function maybeReleaseAdmission(tracker) {
  if (!tracker.requestDone) return;
  if (tracker.outstanding > 0) return;
  if (admissionState.generation !== tracker.generation) return;
  admissionState.active = Math.max(0, admissionState.active - 1);
  // Prevent double-release if called again after settle.
  tracker.requestDone = false;
}

function markRequestDoneAndReleaseWhenIdle(tracker) {
  tracker.requestDone = true;
  maybeReleaseAdmission(tracker);
}

function parsePageLimit(query) {
  const pageRaw = Number.parseInt(String(query && query.page != null ? query.page : '1'), 10);
  const limitRaw = Number.parseInt(String(query && query.limit != null ? query.limit : '10'), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
  return { page, limit };
}

function messageLooksPathy(msg) {
  if (!msg || typeof msg !== 'string') return false;
  if (/[/\\]/.test(msg)) return true;
  if (/\b(?:Volumes|Users|private|home|tmp|var|mnt|opt|etc)\b/i.test(msg)) return true;
  if (/[A-Za-z]:\\/.test(msg)) return true;
  return false;
}

/**
 * Public error strings are fixed / nonsecret. Prefer codes over raw fs messages.
 * Never return absolute host paths (including unrecognized roots like /Volumes/...).
 */
function sanitizeErrorMessage(err, fallback = 'reports_catalog_failed') {
  if (err && typeof err.publicMessage === 'string' && err.publicMessage) {
    return String(err.publicMessage).slice(0, 180);
  }
  const code = err && err.code != null ? String(err.code) : '';
  const byCode = {
    REPORTS_META_TIMEOUT: 'reports_metadata_timeout',
    REPORTS_DIR_TIMEOUT: 'reports_directory_timeout',
    REPORTS_READDIR_TIMEOUT: 'reports_readdir_timeout',
    REPORTS_LIST_BUSY: 'reports_list_busy',
    REPORTS_META_FAILED: 'reports_metadata_failed',
    REPORTS_DIR_UNREADABLE: 'reports_directory_unreadable',
    REPORTS_READDIR_FAILED: 'reports_readdir_failed',
    EACCES: 'reports_permission_denied',
    EPERM: 'reports_permission_denied',
    ENOENT: 'reports_not_found',
    ENOTDIR: 'reports_not_directory',
    ETIMEDOUT: 'reports_operation_timeout',
  };
  if (byCode[code]) return byCode[code];
  const msg = err && typeof err.message === 'string' ? err.message : '';
  if (!msg || messageLooksPathy(msg)) return fallback;
  return msg.slice(0, 180);
}

function normalizeReportsListPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, items: [], total: 0, error: 'invalid_payload' };
  }
  if (data.ok === false) {
    return {
      ok: false,
      items: [],
      total: 0,
      error: typeof data.error === 'string' ? data.error : 'reports_error',
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }
  const items = Array.isArray(data.items) ? data.items : null;
  const total = data.pagination && Number.isFinite(Number(data.pagination.total))
    ? Number(data.pagination.total)
    : (items ? items.length : 0);
  if (!items) {
    return { ok: false, items: [], total: 0, error: 'contract_mismatch' };
  }
  return { ok: true, items, total, pagination: data.pagination || null };
}

/**
 * Race a tracked filesystem startFn against a deadline.
 * Does not cancel the underlying operation when the deadline wins.
 */
function withTimeoutFs(tracker, startFn, ms, code) {
  let timer;
  const underlying = tracker
    ? startTrackedFs(tracker, startFn)
    : Promise.resolve().then(startFn);
  if (!tracker) {
    underlying.catch(() => {});
  }
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(code || 'REPORTS_META_TIMEOUT');
      err.code = code || 'REPORTS_META_TIMEOUT';
      err.publicMessage = sanitizeErrorMessage(err);
      reject(err);
    }, ms);
  });
  return Promise.race([underlying, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Bounded worker pool. When shouldSchedule() becomes false, no further items
 * are launched; in-flight workers may still settle.
 */
async function mapPool(items, concurrency, worker, options) {
  const shouldSchedule = (options && options.shouldSchedule) || (() => true);
  const results = new Array(items.length);
  let next = 0;
  let active = 0;
  let maxActive = 0;
  let launched = 0;
  let settle;
  let settled = false;
  const done = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  const finish = (err) => {
    if (settled) return;
    settled = true;
    if (err) settle.reject(err);
    else settle.resolve();
  };

  const pump = () => {
    if (settled) return;
    while (active < concurrency && next < items.length && shouldSchedule()) {
      const idx = next++;
      active++;
      launched++;
      if (active > maxActive) maxActive = active;
      Promise.resolve()
        .then(() => worker(items[idx], idx))
        .then((value) => {
          results[idx] = value;
          active--;
          if (!shouldSchedule()) {
            if (active === 0) finish();
            return;
          }
          if (next >= items.length && active === 0) finish();
          else pump();
        })
        .catch((err) => finish(err));
    }
    if (!settled && !shouldSchedule() && active === 0) finish();
    if (!settled && next >= items.length && active === 0) finish();
  };

  if (items.length === 0) finish();
  else pump();

  await done;
  return { results, maxActive, launched };
}

/**
 * Exact current (pre-fix) synchronous algorithm — for RED proofs only.
 * Mirrors utils/proxyConfigAPI.js reports/list branch at tip 796b4c82…
 * Synthetic helper — not the live route handler.
 */
function listReportsCatalogSyncCurrent(reportsDir, query, io = fs) {
  const stats = { statCalls: 0, mkdirCalled: false };
  const wrapped = {
    mkdirSync(...args) { stats.mkdirCalled = true; return io.mkdirSync(...args); },
    readdirSync(...args) { return io.readdirSync(...args); },
    statSync(...args) { stats.statCalls += 1; return io.statSync(...args); },
  };
  wrapped.mkdirSync(reportsDir, { recursive: true });
  const allItems = wrapped.readdirSync(reportsDir).map((name) => {
    const p = path.join(reportsDir, name);
    const st = wrapped.statSync(p);
    return { name, size: st.size, mtimeMs: st.mtimeMs };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const { page, limit } = parsePageLimit(query);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const items = allItems.slice(startIndex, endIndex);
  return {
    body: {
      ok: true,
      items,
      pagination: {
        page,
        limit,
        total: allItems.length,
        totalPages: Math.ceil(allItems.length / limit) || 0,
        hasMore: endIndex < allItems.length,
      },
    },
    stats,
  };
}

async function listReportsCatalog(options) {
  const opts = { ...DEFAULTS, ...(options || {}) };
  const reportsDir = opts.reportsDir;
  if (typeof reportsDir !== 'string' || !reportsDir) {
    return { ok: false, error: 'reports_dir_required', code: 'REPORTS_DIR_REQUIRED' };
  }

  const maxConcurrent = Math.max(1, opts.maxConcurrentCatalogs || DEFAULTS.maxConcurrentCatalogs);
  const bypassAdmission = opts.bypassAdmission === true;
  const tracker = createIoTracker();

  if (!bypassAdmission) {
    // Fail closed while a prior catalog still owns the slot (including unresolved IO).
    if (admissionState.active >= maxConcurrent) {
      return {
        ok: false,
        error: sanitizeErrorMessage({ code: 'REPORTS_LIST_BUSY' }),
        code: 'REPORTS_LIST_BUSY',
      };
    }
    admissionState.active += 1;
  }

  try {
    return await listReportsCatalogAdmitted(opts, reportsDir, tracker);
  } finally {
    if (!bypassAdmission) {
      // Do not await: timeout responses must return promptly.
      markRequestDoneAndReleaseWhenIdle(tracker);
    }
  }
}

async function listReportsCatalogAdmitted(opts, reportsDir, tracker) {
  const io = opts.fs || {
    readdir: fsp.readdir.bind(fsp),
    lstat: fsp.lstat.bind(fsp),
    access: fsp.access.bind(fsp),
  };
  const { page, limit } = parsePageLimit(opts.query || {});
  const maxEntries = opts.maxEntries;
  const concurrency = Math.max(1, Math.min(32, opts.concurrency || DEFAULTS.concurrency));
  const metaTimeoutMs = opts.metaTimeoutMs || DEFAULTS.metaTimeoutMs;
  const dirTimeoutMs = opts.dirTimeoutMs || DEFAULTS.dirTimeoutMs;

  // Read-only: missing directory => empty catalog (no mkdir on GET).
  try {
    await withTimeoutFs(
      tracker,
      () => io.access(reportsDir, fs.constants.F_OK),
      dirTimeoutMs,
      'REPORTS_DIR_TIMEOUT'
    );
  } catch (err) {
    if (err && err.code === 'REPORTS_DIR_TIMEOUT') {
      return {
        ok: false,
        error: sanitizeErrorMessage(err),
        code: 'REPORTS_DIR_TIMEOUT',
      };
    }
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return {
        ok: true,
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
      };
    }
    return {
      ok: false,
      error: sanitizeErrorMessage(err, 'reports_directory_unreadable'),
      code: 'REPORTS_DIR_UNREADABLE',
    };
  }

  let names;
  try {
    names = await withTimeoutFs(
      tracker,
      () => io.readdir(reportsDir),
      dirTimeoutMs,
      'REPORTS_READDIR_TIMEOUT'
    );
  } catch (err) {
    if (err && err.code === 'REPORTS_READDIR_TIMEOUT') {
      return {
        ok: false,
        error: sanitizeErrorMessage(err),
        code: 'REPORTS_READDIR_TIMEOUT',
      };
    }
    return {
      ok: false,
      error: sanitizeErrorMessage(err, 'reports_readdir_failed'),
      code: 'REPORTS_READDIR_FAILED',
    };
  }
  if (!Array.isArray(names)) names = [];
  if (names.length > maxEntries) {
    return {
      ok: false,
      error: 'reports_directory_exceeds_scan_ceiling',
      code: 'REPORTS_TOO_MANY_ENTRIES',
      pagination: { page, limit, total: names.length, totalPages: 0, hasMore: false },
    };
  }

  const yieldEvery = opts.yieldEvery || DEFAULTS.yieldEvery;
  let stopScheduling = false;
  const meta = await mapPool(
    names,
    concurrency,
    async (name, index) => {
      if (stopScheduling) return { skip: true, reason: 'aborted' };
      if (yieldEvery > 0 && index > 0 && index % yieldEvery === 0) {
        await new Promise((r) => setImmediate(r));
      }
      if (stopScheduling) return { skip: true, reason: 'aborted' };
      const full = path.join(reportsDir, name);
      try {
        const st = await withTimeoutFs(
          tracker,
          () => io.lstat(full),
          metaTimeoutMs,
          'REPORTS_META_TIMEOUT'
        );
        if (stopScheduling) return { skip: true, reason: 'aborted' };
        if (!st || !st.isFile || !st.isFile()) {
          return { skip: true, reason: 'non_file' };
        }
        return { name, size: st.size, mtimeMs: st.mtimeMs };
      } catch (err) {
        const code = err && err.code ? String(err.code) : 'REPORTS_META_FAILED';
        if (code === 'REPORTS_META_TIMEOUT') {
          stopScheduling = true;
          return {
            failed: true,
            code: 'REPORTS_META_TIMEOUT',
            error: sanitizeErrorMessage(err),
          };
        }
        return {
          failed: true,
          code: 'REPORTS_META_FAILED',
          error: sanitizeErrorMessage(err, 'reports_metadata_failed'),
        };
      }
    },
    { shouldSchedule: () => !stopScheduling }
  );

  const failures = meta.results.filter((r) => r && r.failed);
  if (failures.length) {
    const first = failures.find((f) => f.code === 'REPORTS_META_TIMEOUT') || failures[0];
    return {
      ok: false,
      error: first.error || 'reports_metadata_incomplete',
      code: first.code || 'REPORTS_META_FAILED',
      incomplete: true,
      failedCount: failures.length,
      _debug: opts.includeDebug
        ? { maxActive: meta.maxActive, launched: meta.launched, scanned: names.length }
        : undefined,
    };
  }

  const allItems = meta.results
    .filter((r) => r && !r.skip && !r.failed)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const items = allItems.slice(startIndex, endIndex);
  return {
    ok: true,
    items,
    pagination: {
      page,
      limit,
      total: allItems.length,
      totalPages: Math.ceil(allItems.length / limit) || 0,
      hasMore: endIndex < allItems.length,
    },
    _debug: opts.includeDebug
      ? { maxActive: meta.maxActive, launched: meta.launched, scanned: names.length }
      : undefined,
  };
}

module.exports = {
  DEFAULTS,
  parsePageLimit,
  sanitizeErrorMessage,
  normalizeReportsListPayload,
  listReportsCatalogSyncCurrent,
  listReportsCatalog,
  resetCatalogAdmissionForTests,
  getCatalogAdmissionStateForTests,
};
