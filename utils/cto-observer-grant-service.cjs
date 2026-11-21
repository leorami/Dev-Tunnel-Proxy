'use strict';
/**
 * Server-held CTO observer grant lifecycle (issue / one-use redeem / revoke).
 * Pure in-memory store helper — does not open sockets, log secrets, or deploy.
 * Caller must authenticate the owner before issue/revoke and verify transport
 * before treating a redeemed session as live visual access.
 */
const crypto = require('node:crypto');
const { evaluateObserverAccess } = require('./cto-observer-access-policy.cjs');

const HEX_SHA = /^[a-f0-9]{40}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const MAX_TTL_MS = 10 * 60 * 1000;
const AUDIENCE = 'devproxy-cto-observer';
const SCOPE = 'visual-readonly';

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createCtoObserverGrantStore({ nowFn = () => Date.now() } = {}) {
  /** @type {Map<string, object>} */
  const grants = new Map();
  /** @type {Map<string, object>} */
  const sessions = new Map();

  function auditOf(grant) {
    return Object.freeze({
      grantId: grant.grantId,
      audience: grant.audience,
      scope: grant.scope,
      sourceSha: grant.sourceSha,
      observerPrincipal: grant.observerPrincipal,
      issuedAtMs: grant.issuedAtMs,
      expiresAtMs: grant.expiresAtMs,
      revoked: grant.revoked,
      redeemed: grant.redeemed,
      // Never include redemptionToken or session tokens.
    });
  }

  function issueGrant(input) {
    if (!plain(input)) return { ok: false, code: 'INVALID_INPUT' };
    const {
      ownerAuthenticated,
      trustedOriginOk,
      csrfOk,
      sourceSha,
      observerPrincipal,
      ttlMs = MAX_TTL_MS,
    } = input;
    if (ownerAuthenticated !== true) return { ok: false, code: 'OWNER_AUTH_REQUIRED' };
    if (trustedOriginOk !== true) return { ok: false, code: 'ORIGIN_DENIED' };
    if (csrfOk !== true) return { ok: false, code: 'CSRF_DENIED' };
    if (!HEX_SHA.test(sourceSha)) return { ok: false, code: 'SOURCE_SHA_INVALID' };
    if (typeof observerPrincipal !== 'string'
      || observerPrincipal.length < 3
      || observerPrincipal.length > 256
      || /[\x00-\x1f\x7f]/.test(observerPrincipal)) {
      return { ok: false, code: 'OBSERVER_PRINCIPAL_INVALID' };
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
      return { ok: false, code: 'TTL_INVALID' };
    }
    const now = nowFn();
    const grantId = newToken();
    const redemptionToken = newToken();
    const grant = {
      grantId,
      redemptionToken,
      audience: AUDIENCE,
      scope: SCOPE,
      ownerApproved: true,
      sourceSha,
      observerPrincipal,
      issuedAtMs: now,
      expiresAtMs: now + ttlMs,
      revoked: false,
      redeemed: false,
    };
    grants.set(grantId, grant);
    return {
      ok: true,
      // Secret returned once to the authenticated owner HTTP response only.
      redemptionToken,
      audit: auditOf(grant),
    };
  }

  function revokeGrant(input) {
    if (!plain(input)) return { ok: false, code: 'INVALID_INPUT' };
    if (input.ownerAuthenticated !== true) return { ok: false, code: 'OWNER_AUTH_REQUIRED' };
    if (input.trustedOriginOk !== true) return { ok: false, code: 'ORIGIN_DENIED' };
    if (input.csrfOk !== true) return { ok: false, code: 'CSRF_DENIED' };
    if (!TOKEN.test(input.grantId)) return { ok: false, code: 'GRANT_NOT_FOUND' };
    const grant = grants.get(input.grantId);
    if (!grant) return { ok: false, code: 'GRANT_NOT_FOUND' };
    grant.revoked = true;
    for (const [sid, session] of sessions) {
      if (session.grantId === grant.grantId) sessions.delete(sid);
    }
    return { ok: true, audit: auditOf(grant) };
  }

  function redeemGrant(input) {
    if (!plain(input)) return { ok: false, code: 'INVALID_INPUT' };
    const {
      grantId,
      redemptionToken,
      observerPrincipal,
      ownerAdminSessionPresent = false,
      adminAuthorizationHeaderPresent = false,
    } = input;
    if (ownerAdminSessionPresent === true || adminAuthorizationHeaderPresent === true) {
      return { ok: false, code: 'ADMIN_CREDENTIAL_REUSE_DENIED' };
    }
    if (!TOKEN.test(grantId) || !TOKEN.test(redemptionToken)) {
      return { ok: false, code: 'REDEMPTION_DENIED' };
    }
    const grant = grants.get(grantId);
    if (!grant) return { ok: false, code: 'REDEMPTION_DENIED' };
    const now = nowFn();
    if (grant.revoked || grant.redeemed || grant.expiresAtMs <= now) {
      return { ok: false, code: 'REDEMPTION_DENIED' };
    }
    if (grant.observerPrincipal !== observerPrincipal) {
      return { ok: false, code: 'REDEMPTION_DENIED' };
    }
    const expected = Buffer.from(grant.redemptionToken, 'utf8');
    const provided = Buffer.from(redemptionToken, 'utf8');
    if (expected.length !== provided.length
      || !crypto.timingSafeEqual(expected, provided)) {
      return { ok: false, code: 'REDEMPTION_DENIED' };
    }
    grant.redeemed = true;
    // Burn the secret after one successful use.
    grant.redemptionToken = '';
    const sessionToken = newToken();
    const session = {
      sessionToken,
      grantId: grant.grantId,
      audience: grant.audience,
      scope: grant.scope,
      sourceSha: grant.sourceSha,
      observerPrincipal: grant.observerPrincipal,
      issuedAtMs: now,
      expiresAtMs: grant.expiresAtMs,
      revoked: false,
      ownerApproved: true,
      sessionValidatedByServer: true,
    };
    sessions.set(sessionToken, session);
    return {
      ok: true,
      sessionToken,
      expiresAtMs: session.expiresAtMs,
      audit: auditOf(grant),
    };
  }

  function getSession(sessionToken) {
    if (!TOKEN.test(sessionToken)) return null;
    const session = sessions.get(sessionToken);
    if (!session) return null;
    const now = nowFn();
    if (session.revoked || session.expiresAtMs <= now) {
      sessions.delete(sessionToken);
      return null;
    }
    const grant = grants.get(session.grantId);
    if (!grant || grant.revoked) {
      sessions.delete(sessionToken);
      return null;
    }
    return session;
  }

  function revokeSession(sessionToken) {
    if (!TOKEN.test(sessionToken)) return false;
    return sessions.delete(sessionToken);
  }

  function accessDecision({
    sessionToken,
    pathname,
    method,
    sourceSha,
    exactStaticAssetManifest,
    ownerAdminSessionPresent = false,
    adminAuthorizationHeaderPresent = false,
  }) {
    const session = getSession(sessionToken);
    if (!session) {
      return { allowed: false, classification: 'denied', code: 'SESSION_INVALID' };
    }
    const decision = evaluateObserverAccess({
      grant: {
        audience: session.audience,
        scope: session.scope,
        ownerApproved: session.ownerApproved,
        sessionValidatedByServer: session.sessionValidatedByServer,
        revoked: false,
        issuedAtMs: session.issuedAtMs,
        expiresAtMs: session.expiresAtMs,
        sourceSha: session.sourceSha,
      },
      nowMs: nowFn(),
      sourceSha,
      pathname,
      method,
      exactStaticAssetManifest,
      ownerAdminSessionPresent,
      adminAuthorizationHeaderPresent,
    });
    return { ...decision, code: decision.allowed ? 'ALLOWED' : 'POLICY_DENIED' };
  }

  return Object.freeze({
    issueGrant,
    revokeGrant,
    redeemGrant,
    getSession,
    revokeSession,
    accessDecision,
    MAX_TTL_MS,
    AUDIENCE,
    SCOPE,
  });
}

module.exports = Object.freeze({ createCtoObserverGrantStore, MAX_TTL_MS, AUDIENCE, SCOPE });
