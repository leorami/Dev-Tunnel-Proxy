/* DevProxy login return policy: browser and Node share this pure function. */
(function (root) {
  'use strict';
  const DEFAULT_DESTINATION='/status';
  const BASE_ORIGIN='http://devproxy.login.invalid';
  function safeLoginRedirect(raw) {
    if (typeof raw!=='string' || raw.length===0 || raw.length>2048) return DEFAULT_DESTINATION;
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_DESTINATION;
    const pathnameOnly=raw.split(/[?#]/,1)[0];
    // Encoded path separators/control chars may become authority after URL
    // canonicalization or proxy rewrites. Keep normal encoded query data.
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pathnameOnly)) return DEFAULT_DESTINATION;
    try {
      const u=new URL(raw,BASE_ORIGIN);
      if(u.origin!==BASE_ORIGIN || !u.pathname.startsWith('/')) return DEFAULT_DESTINATION;
      const normalized=u.pathname+u.search+u.hash;
      if(normalized.startsWith('//') || normalized.includes('\\')) return DEFAULT_DESTINATION;
      return normalized;
    } catch {
      return DEFAULT_DESTINATION;
    }
  }
  const api=Object.freeze({safeLoginRedirect});
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  if(root)root.DevProxyRedirectPolicy=api;
})(typeof window!=='undefined' ? window : globalThis);
