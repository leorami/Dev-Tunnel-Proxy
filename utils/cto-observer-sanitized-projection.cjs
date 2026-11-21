'use strict';
/**
 * Field-allowlisted read-only projections for CTO observer UI.
 * Never forwards admin APIs, private paths, sessions, HMAC, queues, or secrets.
 */
const ALLOWED_FIELDS = Object.freeze([
  'page',
  'sourceShaShort',
  'routeCountPublic',
  'publicHealthOk',
  'observerScope',
  'generatedAtMs',
]);

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function shortSha(sha) {
  return typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha) ? sha.slice(0, 12) : null;
}

/**
 * Build a sanitized observer projection from an explicit allowlisted input bag.
 * Unknown keys are dropped; sensitive keys are never copied even if present.
 */
function buildObserverProjection(input) {
  if (!plain(input)) return { ok: false, code: 'INVALID_INPUT' };
  const page = input.page;
  if (typeof page !== 'string'
    || !['status', 'health', 'reports', 'dashboard'].includes(page)) {
    return { ok: false, code: 'PAGE_DENIED' };
  }
  if (!Number.isSafeInteger(input.routeCountPublic)
    || input.routeCountPublic < 0
    || input.routeCountPublic > 100000) {
    return { ok: false, code: 'ROUTE_COUNT_INVALID' };
  }
  if (typeof input.publicHealthOk !== 'boolean') {
    return { ok: false, code: 'HEALTH_FLAG_INVALID' };
  }
  if (!Number.isSafeInteger(input.generatedAtMs)) {
    return { ok: false, code: 'TIMESTAMP_INVALID' };
  }
  const sourceShaShort = shortSha(input.sourceSha);
  if (!sourceShaShort) return { ok: false, code: 'SOURCE_SHA_INVALID' };

  const projection = {
    page,
    sourceShaShort,
    routeCountPublic: input.routeCountPublic,
    publicHealthOk: input.publicHealthOk,
    observerScope: 'visual-readonly',
    generatedAtMs: input.generatedAtMs,
  };
  // Adversarial: ensure no accidental pass-through of private keys.
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.includes(key) && key !== 'sourceSha') {
      // intentionally ignored
    }
  }
  return { ok: true, projection: Object.freeze(projection) };
}

function projectionLeaksSensitive(projection) {
  if (!plain(projection)) return true;
  const blob = JSON.stringify(projection);
  if (/admin_session|password|hmac|authorization|cookie|secret|private|\.artifacts|child/i.test(blob)) {
    return true;
  }
  const keys = Object.keys(projection);
  if (keys.length !== ALLOWED_FIELDS.length) return true;
  return !ALLOWED_FIELDS.every((k) => keys.includes(k));
}

module.exports = Object.freeze({
  buildObserverProjection,
  projectionLeaksSensitive,
  ALLOWED_FIELDS,
});
