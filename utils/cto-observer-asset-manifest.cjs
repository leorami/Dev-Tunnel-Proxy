'use strict';
/**
 * Exact inert asset allowlist for CTO observer sessions.
 * Wildcards are intentionally unsupported — add paths one-by-one.
 */
const EXACT_STATIC_ASSET_MANIFEST = Object.freeze([
  '/status/assets/favicon.png',
  '/status/assets/favicon.svg',
  '/status/assets/logo.svg',
  '/status/assets/calliope_heart_stethoscope.svg',
  '/status/assets/login-redirect-policy.js',
  '/status/common.css',
  '/status/common.js',
  '/status/config.js',
  '/status/global.css',
  '/status/vendor/lucide.min.js',
  '/status/vendor/marked.min.js',
  '/status/vendor/purify.min.js',
]);

function getCtoObserverAssetManifest() {
  return EXACT_STATIC_ASSET_MANIFEST;
}

module.exports = Object.freeze({
  getCtoObserverAssetManifest,
  EXACT_STATIC_ASSET_MANIFEST,
});
