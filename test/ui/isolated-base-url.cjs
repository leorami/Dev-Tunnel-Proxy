'use strict';

// The UI lane must not fall back to the owner's server.
function assertIsolatedBaseUrl(value) {
  if (!value) throw new Error('UI_BASE_URL is required. Refusing the owner host default.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('UI_BASE_URL is not a URL');
  }
  if (url.hostname !== '127.0.0.1') {
    throw new Error('UI_BASE_URL must be an explicit isolated 127.0.0.1 origin, not the owner host');
  }
  return value;
}

module.exports = { assertIsolatedBaseUrl };
