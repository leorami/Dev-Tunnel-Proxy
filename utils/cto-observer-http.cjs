'use strict';
/**
 * HTTP boundary for CTO observer grant/redeem/check.
 * Intended to be called from proxyConfigAPI; no listen() here.
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

const OBSERVER_COOKIE = 'cto_observer_session';
const TOKEN = /^[a-f0-9]{64}$/;
const HEX_SHA = /^[a-f0-9]{40}$/;

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function extractObserverSessionToken(req) {
  const headers = req?.headers || {};
  if (headers.authorization !== undefined) {
    // Observer must not use admin bearer; reject any Authorization for observer identity.
    return null;
  }
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

  function csrfOk(req, body) {
    // Double-submit style: trusted Origin already checked by caller; require
    // matching X-DevProxy-CSRF header equal to body.csrfToken (non-empty).
    const header = req?.headers?.['x-devproxy-csrf'];
    const token = body && typeof body.csrfToken === 'string' ? body.csrfToken : '';
    if (typeof header !== 'string' || header.length < 16 || header.length > 256) return false;
    if (!token || token.length < 16 || token.length > 256) return false;
    const a = Buffer.from(header, 'utf8');
    const b = Buffer.from(token, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function originalPathname(req) {
    const raw = req?.headers?.['x-original-uri'] || req?.headers?.['x-original-url'];
    if (typeof raw === 'string' && raw.startsWith('/')) {
      const pathOnly = raw.split('?')[0].split('#')[0];
      return pathOnly;
    }
    return typeof req?.observerPathname === 'string' ? req.observerPathname : '/status';
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

    // GET /admin/cto-observer/check — nginx auth_request for observer-or dual gate helper
    if (method === 'GET' && pathname === '/admin/cto-observer/check') {
      const sourceSha = getSourceSha();
      const observerToken = extractObserverSessionToken(req);
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 401, { authenticated: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      if (!observerToken || !HEX_SHA.test(sourceSha)) {
        return send(res, 401, { authenticated: false, code: 'SESSION_INVALID' });
      }
      const decision = store.accessDecision({
        sessionToken: observerToken,
        pathname: originalPathname(req),
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

    // POST /admin/cto-observer/grants — owner issues revocable grant
    if (method === 'POST' && pathname === '/admin/cto-observer/grants') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (!ownerAuthenticated) return send(res, 401, { ok: false, code: 'OWNER_AUTH_REQUIRED' });
      const body = await parseBody(req);
      if (!csrfOk(req, body)) return send(res, 403, { ok: false, code: 'CSRF_DENIED' });
      const sourceSha = typeof body.sourceSha === 'string' ? body.sourceSha : getSourceSha();
      const result = store.issueGrant({
        ownerAuthenticated: true,
        trustedOriginOk: true,
        csrfOk: true,
        sourceSha,
        observerPrincipal: body.observerPrincipal,
        ttlMs: body.ttlMs,
      });
      if (!result.ok) return send(res, 400, { ok: false, code: result.code });
      // redemptionToken only in this authenticated owner response — never log it.
      return send(res, 200, {
        ok: true,
        grantId: result.audit.grantId,
        expiresAtMs: result.audit.expiresAtMs,
        redemptionToken: result.redemptionToken,
        redeemPath: '/admin/cto-observer/redeem',
        audit: result.audit,
      });
    }

    // POST /admin/cto-observer/redeem — one-time observer redemption (no admin cookie)
    if (method === 'POST' && pathname === '/admin/cto-observer/redeem') {
      if (!trustedOriginOk) return send(res, 403, { ok: false, code: 'ORIGIN_DENIED' });
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 403, { ok: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      const body = await parseBody(req);
      if (!csrfOk(req, body)) return send(res, 403, { ok: false, code: 'CSRF_DENIED' });
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
      if (!csrfOk(req, body)) return send(res, 403, { ok: false, code: 'CSRF_DENIED' });
      const result = store.revokeGrant({
        ownerAuthenticated: true,
        trustedOriginOk: true,
        csrfOk: true,
        grantId: body.grantId,
      });
      if (!result.ok) return send(res, 400, { ok: false, code: result.code });
      return send(res, 200, { ok: true, audit: result.audit });
    }

    // GET /admin/cto-observer/projection/:page — sanitized read-only projection
    if (method === 'GET' && pathname.startsWith('/admin/cto-observer/projection/')) {
      if (adminSessionPresent || adminBearerPresent) {
        return send(res, 403, { ok: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' });
      }
      const page = pathname.slice('/admin/cto-observer/projection/'.length);
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

    // GET /admin/cto-observer/transport — truth gate status (no secrets)
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

  /**
   * Dual visual gate used by nginx auth_request replacement candidate:
   * owner admin session alone OR observer session+policy; never both.
   */
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
      const decision = store.accessDecision({
        sessionToken: observerToken,
        pathname: originalPathname(req),
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
    store,
    OBSERVER_COOKIE,
  });
}

module.exports = Object.freeze({
  createCtoObserverHttpBoundary,
  extractObserverSessionToken,
  observerSessionCookie,
  OBSERVER_COOKIE,
});
