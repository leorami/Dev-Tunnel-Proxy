'use strict';
/**
 * HTTP boundary for CTO observer grant/redeem/check (V175 fail-closed).
 * Secrets are never written into logs or audit objects.
 */
const crypto = require('node:crypto');
const {
  createCtoObserverGrantStore,
} = require('./cto-observer-grant-service.cjs');
const {
  buildObserverProjection,
  projectionLeaksSensitive,
} = require('./cto-observer-sanitized-projection.cjs');
const {
  classifyCtoBrowserTransport,
} = require('./cto-observer-browser-transport.cjs');
const {
  selectGrantSourceSha,
} = require('./cto-observer-source-attestation.cjs');

const OBSERVER_COOKIE = 'cto_observer_session';
const TOKEN = /^[a-f0-9]{64}$/;
const HEX_SHA = /^[a-f0-9]{40}$/;

function extractObserverSessionToken(req) {
  const headers = req?.headers || {};
  if (headers.authorization !== undefined) return null;
  const cookie = headers.cookie;
  if (typeof cookie !== 'string' || cookie.length > 8192) return null;
  let found = null;
  for (const part of cookie.split(';')) {
    const fragment = part.trim();
    const idx = fragment.indexOf('=');
    if (idx < 0 || fragment.slice(0, idx) !== OBSERVER_COOKIE) continue;
    if (found !== null) return null;
    found = fragment.slice(idx + 1);
  }
  return found !== null && TOKEN.test(found) ? found : null;
}

function observerSessionCookie(token, { host = '', expire = false } = {}) {
  if (!expire && !TOKEN.test(token)) throw new Error('Invalid observer session token');
  const parts = [
    OBSERVER_COOKIE + '=' + (expire ? '' : token),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + (expire ? 0 : 600),
  ];
  const loopback = typeof host === 'string'
    && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host);
  if (!loopback) parts.push('Secure');
  return parts.join('; ');
}

function headerHasAdminBearer(req) {
  const auth = req?.headers?.authorization;
  return typeof auth === 'string' && /^Bearer\s+\S+/i.test(auth);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Fail-closed original target resolution. Never invents `/status`.
 */
function resolveOriginalPathname(req) {
  const raw = req?.headers?.['x-original-uri'] || req?.headers?.['x-original-url'];
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 2048) return null;
  if (/[\\%?#\u0000-\u001f\u007f]/.test(raw) || raw.includes('//')) return null;
  const pathOnly = raw.split('?')[0].split('#')[0];
  if (!pathOnly.startsWith('/') || pathOnly.split('/').some((p) => p === '..' || p === '.')) {
    return null;
  }
  return pathOnly;
}

function createCtoObserverHttpBoundary(deps = {}) {
  const store = deps.store || createCtoObserverGrantStore({ nowFn: deps.nowFn });
  const getSourceSha = typeof deps.getSourceSha === 'function'
    ? deps.getSourceSha
    : () => null;
  const getAssetManifest = typeof deps.getAssetManifest === 'function'
    ? deps.getAssetManifest
    : () => Object.freeze([]);
  const parseBody = typeof deps.parseBody === 'function'
    ? deps.parseBody
    : async () => ({});
  const send = typeof deps.send === 'function'
    ? deps.send
    : (res, code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
  /** @type {Map<string, {token:string, expiresAtMs:number}>} */
  const ownerCsrfBySession = new Map();
  const nowFn = typeof deps.nowFn === 'function' ? deps.nowFn : () => Date.now();

  function issueOwnerCsrf(adminSessionToken) {
    if (!TOKEN.test(adminSessionToken)) return null;
    const token = newToken();
    ownerCsrfBySession.set(adminSessionToken, {
      token,
      expiresAtMs: nowFn() + 10 * 60 * 1000,
    });
    return token;
  }

  function ownerCsrfOk(adminSessionToken, req, body) {
    if (!TOKEN.test(adminSessionToken)) return false;
    const record = ownerCsrfBySession.get(adminSessionToken);
    if (!record || record.expiresAtMs <= nowFn()) {
      ownerCsrfBySession.delete(adminSessionToken);
      return false;
    }
    const header = req?.headers?.['x-devproxy-csrf'];
    const token = body && typeof body.csrfToken === 'string' ? body.csrfToken : '';
    if (typeof header !== 'string' || !TOKEN.test(header) || !TOKEN.test(token)) return false;
    const expected = Buffer.from(record.token, 'utf8');
    const a = Buffer.from(header, 'utf8');
    const b = Buffer.from(token, 'utf8');
    if (a.length !== expected.length || b.length !== expected.length) return false;
    return crypto.timingSafeEqual(a, expected) && crypto.timingSafeEqual(b, expected);
  }

  async function handle(req, res, ctx) {
    const pathname = ctx?.pathname;
    const method = String(req.method || 'GET').toUpperCase();
    if (typeof pathname !== 'string' || !pathname.startsWith('/admin/cto-observer')) {
      return false;
    }

    const ownerAuthenticated = ctx?.ownerAuthenticated === true;
    const trustedOriginOk = ctx?.trustedOriginOk === true;
    const adminSessionPresent = ctx?.adminSessionPresent === true;
    const adminBearerPresent = headerHasAdminBearer(req) || ctx?.adminBearerPresent === true;
    const adminSessionToken = typeof ctx?.adminSessionToken === 'string'
      ? ctx.adminSessionToken
      : '';

    // GET /admin/cto-observer/csrf — server-bound CSRF for authenticated owner session
    if (method === 'GET' && pathname === '/admin/cto-observer/csrf') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (!ownerAuthenticated || !TOKEN.test(adminSessionToken)) {
        return send(res, 401, { ok: false, code: 'OWNER_AUTH_REQUIRED' });
      }
      const csrfToken = issueOwnerCsrf(adminSessionToken);
      const attested = getSourceSha();
      return send(res, 200, {
        ok: true,
        csrfToken,
        attestedSourceSha: HEX_SHA.test(attested) ? attested : null,
        transport: classifyCtoBrowserTransport({
          chatgptWorkCloudBrowserCallable: false,
          devProxyObserverPluginCallable: false,
          canRetrieveOriginalPngBytes: false,
          deliversInlineToOwnerChatgpt: false,
          cursorIdeBrowserPresent: true,
        }),
      });
    }

    // GET /admin/cto-observer/check
    if (method === 'GET' && pathname === '/admin/cto-observer/check') {
      const sourceSha = getSourceSha();
      const observerToken = extractObserverSessionToken(req);
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 401, { authenticated: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      const original = resolveOriginalPathname(req);
      if (!original) {
        return send(res, 401, { authenticated: false, code: 'ORIGINAL_URI_REQUIRED' });
      }
      if (!observerToken || !HEX_SHA.test(sourceSha)) {
        return send(res, 401, { authenticated: false, code: 'SESSION_INVALID' });
      }
      const decision = store.accessDecision({
        sessionToken: observerToken,
        pathname: original,
        method: 'GET',
        sourceSha,
        exactStaticAssetManifest: getAssetManifest(),
        ownerAdminSessionPresent: false,
        adminAuthorizationHeaderPresent: false,
      });
      if (!decision.allowed) {
        return send(res, 401, { authenticated: false, code: decision.code });
      }
      return send(res, 200, { authenticated: true, classification: decision.classification });
    }

    // POST /admin/cto-observer/grants
    if (method === 'POST' && pathname === '/admin/cto-observer/grants') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (!ownerAuthenticated) return send(res, 401, { ok: false, code: 'OWNER_AUTH_REQUIRED' });
      const body = await parseBody(req);
      if (!ownerCsrfOk(adminSessionToken, req, body)) {
        return send(res, 403, { ok: false, code: 'CSRF_DENIED' });
      }
      const selected = selectGrantSourceSha({
        attestedSourceSha: getSourceSha(),
        requestedSourceSha: body.sourceSha,
      });
      if (!selected.ok) return send(res, 400, { ok: false, code: selected.code });
      const result = store.issueGrant({
        ownerAuthenticated: true,
        trustedOriginOk: true,
        csrfOk: true,
        sourceSha: selected.sourceSha,
        observerPrincipal: body.observerPrincipal,
        ttlMs: body.ttlMs,
      });
      if (!result.ok) return send(res, 400, { ok: false, code: result.code });
      // redemptionToken only in authenticated owner JSON — never log / URL / screenshot DOM helper.
      return send(res, 200, {
        ok: true,
        grantId: result.audit.grantId,
        expiresAtMs: result.audit.expiresAtMs,
        redemptionToken: result.redemptionToken,
        redeemPath: '/admin/cto-observer/redeem',
        attestedSourceSha: selected.sourceSha,
        audit: result.audit,
        deliveryNote: 'HAND_TO_TRUSTED_OBSERVER_CHANNEL_ONLY',
      });
    }

    // POST /admin/cto-observer/redeem — redemptionToken proves one-use secret; no admin CSRF
    if (method === 'POST' && pathname === '/admin/cto-observer/redeem') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 403, { ok: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      const body = await parseBody(req);
      const result = store.redeemGrant({
        grantId: body.grantId,
        redemptionToken: body.redemptionToken,
        observerPrincipal: body.observerPrincipal,
        ownerAdminSessionPresent: false,
        adminAuthorizationHeaderPresent: false,
      });
      if (!result.ok) return send(res, 401, { ok: false, code: result.code });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': observerSessionCookie(result.sessionToken, { host: req.headers.host }),
      });
      res.end(JSON.stringify({
        ok: true,
        expiresAtMs: result.expiresAtMs,
        audit: result.audit,
      }));
      return true;
    }

    // POST /admin/cto-observer/revoke
    if (method === 'POST' && pathname === '/admin/cto-observer/revoke') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (!ownerAuthenticated) return send(res, 401, { ok: false, code: 'OWNER_AUTH_REQUIRED' });
      const body = await parseBody(req);
      if (!ownerCsrfOk(adminSessionToken, req, body)) {
        return send(res, 403, { ok: false, code: 'CSRF_DENIED' });
      }
      const result = store.revokeGrant({
        ownerAuthenticated: true,
        trustedOriginOk: true,
        csrfOk: true,
        grantId: body.grantId,
      });
      if (!result.ok) return send(res, 400, { ok: false, code: result.code });
      return send(res, 200, { ok: true, audit: result.audit });
    }

    // GET /admin/cto-observer/projection/:page
    if (method === 'GET' && pathname.startsWith('/admin/cto-observer/projection/')) {
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 403, { ok: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      const page = pathname.slice('/admin/cto-observer/projection/'.length).split('/')[0];
      const sourceSha = getSourceSha();
      const observerToken = extractObserverSessionToken(req);
      const decision = store.accessDecision({
        sessionToken: observerToken,
        pathname: '/' + (page === 'dashboard' ? 'dashboard' : page),
        method: 'GET',
        sourceSha,
        exactStaticAssetManifest: getAssetManifest(),
      });
      if (!decision.allowed) return send(res, 401, { ok: false, code: decision.code });
      const built = buildObserverProjection({
        page: page === 'status' || page === 'health' || page === 'reports' || page === 'dashboard'
          ? page : null,
        sourceSha,
        routeCountPublic: Number(ctx?.routeCountPublic) || 0,
        publicHealthOk: ctx?.publicHealthOk === true,
        generatedAtMs: Date.now(),
      });
      if (!built.ok || projectionLeaksSensitive(built.projection)) {
        return send(res, 500, { ok: false, code: 'PROJECTION_DENIED' });
      }
      return send(res, 200, { ok: true, projection: built.projection });
    }

    // GET /admin/cto-observer/transport
    if (method === 'GET' && pathname === '/admin/cto-observer/transport') {
      if (!ownerAuthenticated) return send(res, 401, { ok: false, code: 'OWNER_AUTH_REQUIRED' });
      const transport = classifyCtoBrowserTransport({
        chatgptWorkCloudBrowserCallable: false,
        devProxyObserverPluginCallable: false,
        canRetrieveOriginalPngBytes: false,
        deliversInlineToOwnerChatgpt: false,
        cursorIdeBrowserPresent: true,
      });
      return send(res, 200, { ok: true, transport });
    }

    return send(res, 404, { ok: false, code: 'NOT_FOUND' });
  }

  function evaluateVisualAccessGate(req, {
    adminSessionValid = false,
    adminSessionPresent = false,
    adminBearerPresent = false,
  } = {}) {
    const observerToken = extractObserverSessionToken(req);
    if (adminSessionValid && !observerToken) {
      return { ok: true, role: 'admin' };
    }
    if (observerToken && !adminSessionPresent && !adminBearerPresent) {
      const sourceSha = getSourceSha();
      if (!HEX_SHA.test(sourceSha)) return { ok: false, code: 'SOURCE_SHA_INVALID' };
      const original = resolveOriginalPathname(req);
      if (!original) return { ok: false, code: 'ORIGINAL_URI_REQUIRED' };
      const decision = store.accessDecision({
        sessionToken: observerToken,
        pathname: original,
        method: 'GET',
        sourceSha,
        exactStaticAssetManifest: getAssetManifest(),
        ownerAdminSessionPresent: false,
        adminAuthorizationHeaderPresent: false,
      });
      return decision.allowed
        ? { ok: true, role: 'observer', classification: decision.classification }
        : { ok: false, code: decision.code };
    }
    return { ok: false, code: 'VISUAL_ACCESS_DENIED' };
  }

  return Object.freeze({
    handle,
    evaluateVisualAccessGate,
    extractObserverSessionToken,
    observerSessionCookie,
    resolveOriginalPathname,
    issueOwnerCsrf,
    store,
    OBSERVER_COOKIE,
  });
}

module.exports = Object.freeze({
  createCtoObserverHttpBoundary,
  extractObserverSessionToken,
  observerSessionCookie,
  resolveOriginalPathname,
  OBSERVER_COOKIE,
});
