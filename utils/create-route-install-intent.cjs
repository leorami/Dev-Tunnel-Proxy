'use strict';
/**
 * Explicit installation intent for POST .../apps/create-route.
 * Default is preview (no install). Top-level or nested boolean opt-in only.
 * Conflicts / nonbooleans / malformed bodies fail closed.
 */

function decideCreateRouteInstall(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INSTALL_INTENT',
      error: 'request body must be a plain object',
    };
  }

  const hasTop = Object.prototype.hasOwnProperty.call(body, 'install');
  const top = hasTop ? body.install : undefined;

  let hasNested = false;
  let nested;
  if (Object.prototype.hasOwnProperty.call(body, 'options')) {
    const options = body.options;
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_INSTALL_INTENT',
        error: 'options must be a plain object',
      };
    }
    hasNested = Object.prototype.hasOwnProperty.call(options, 'install');
    if (hasNested) nested = options.install;
  }

  if (hasTop && typeof top !== 'boolean') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INSTALL_INTENT',
      error: 'install must be a boolean',
    };
  }
  if (hasNested && typeof nested !== 'boolean') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_INSTALL_INTENT',
      error: 'options.install must be a boolean',
    };
  }
  if (hasTop && hasNested && top !== nested) {
    return {
      ok: false,
      status: 400,
      code: 'CONFLICTING_INSTALL_INTENT',
      error: 'install and options.install conflict',
    };
  }
  if (hasTop) return { ok: true, install: top };
  if (hasNested) return { ok: true, install: nested };
  return { ok: true, install: false };
}

module.exports = { decideCreateRouteInstall };
