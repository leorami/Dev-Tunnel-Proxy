'use strict';
/**
 * DevProxy management authorization gate.
 * Only the exact, read-only health endpoint may be used anonymously.
 * Everything else in the configured management namespace is private,
 * regardless of HTTP verb, and unknown endpoints are not exceptions.
 * Keep origin-specific browser/session checks in the calling handler.
 */
function classifyManagementRequest(method, pathname, base='/devproxy/api') {
  const isManagement = typeof pathname === 'string'
    && (pathname === base || pathname.startsWith(base + '/'));
  const isPublic = isManagement
    && method === 'GET'
    && pathname === base + '/ai/health';
  return Object.freeze({
    isManagement,
    isPublic,
    requiresAuth: isManagement && !isPublic,
  });
}
module.exports = { classifyManagementRequest };
