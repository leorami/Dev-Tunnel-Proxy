'use strict';
/**
 * Pure fail-closed access boundary for an owner-approved CTO visual observer.
 * This does NOT mint a credential, authenticate a browser, proxy a request,
 * publish images, or grant permission to access the owner machine.
 * The caller MUST verify an opaque, server-held observer session before calling.
 */
const HEX_SHA = /^[a-f0-9]{40}$/;
const MAX_SESSION_MS = 10 * 60 * 1000;
const PAGES = new Set([
  '/status', '/status/', '/health', '/health/',
  '/reports', '/reports/', '/dashboard', '/dashboard/',
]);
const INERT_ASSET = /\.(?:js|css|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$/i;
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function denied() { return {allowed: false, classification: 'denied'}; }
function safePath(pathname) {
  // Input must be a *pathname*, not a URL/query, and never an encoded alias.
  if(typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.length > 2048) return false;
  if(/[\\%?#\u0000-\u001f\u007f]/.test(pathname) || pathname.includes('//')) return false;
  if(pathname.split('/').some(p => p === '..' || p === '.')) return false;
  return true;
}
function evaluateObserverAccess(input) {
  if(!plain(input)) return denied();
  const {grant,nowMs,sourceSha,pathname,method,exactStaticAssetManifest} = input;
  if(!plain(grant) || grant.audience !== 'devproxy-cto-observer'
    || grant.scope !== 'visual-readonly' || grant.ownerApproved !== true
    || grant.sessionValidatedByServer !== true || grant.revoked !== false) return denied();
  if(!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(grant.issuedAtMs)
    || !Number.isSafeInteger(grant.expiresAtMs)
    || grant.issuedAtMs > nowMs || grant.expiresAtMs <= nowMs
    || grant.expiresAtMs - grant.issuedAtMs > MAX_SESSION_MS) return denied();
  if(!HEX_SHA.test(sourceSha) || grant.sourceSha !== sourceSha) return denied();
  if(input.ownerAdminSessionPresent === true || input.adminAuthorizationHeaderPresent === true) return denied();
  if(method !== 'GET' && method !== 'HEAD') return denied();
  if(!safePath(pathname)) return denied();
  if(PAGES.has(pathname)) return {allowed:true,classification:'page'};
  if(!Array.isArray(exactStaticAssetManifest) || exactStaticAssetManifest.length > 5000)
    return denied();
  if(!INERT_ASSET.test(pathname)) return denied();
  if(!exactStaticAssetManifest.includes(pathname)) return denied();
  if(!(pathname.startsWith('/status/assets/') || pathname.startsWith('/dashboard/assets/')))
    return denied();
  return {allowed:true,classification:'asset'};
}
module.exports = Object.freeze({evaluateObserverAccess});
