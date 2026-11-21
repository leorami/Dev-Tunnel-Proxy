'use strict';
/**
 * Server-owned, short-lived HEAD-observation cache for Calliope.
 * Pure process-local data: no network, persistence, Docker, routes or write authority.
 * Historical observations are not live health or authorization evidence.
 */
const {normalizeObservation} = require('./rc2-calliope-grounded-followup.cjs');

const OBSERVATION_TTL_MS = 5 * 60 * 1000;
const MAX_OBSERVATION_SESSIONS = 32;

function createTrustedObservationCache({now = Date.now} = {}) {
  if (typeof now !== 'function') throw new TypeError('TRUSTED_OBSERVATION_CLOCK_REQUIRED');
  const entries = new Map();
  const validKey = (key) => typeof key === 'string' && /^[0-9a-f]{40}$/.test(key);

  function timestamp() {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function expire(current) {
    for (const [key, observation] of entries) {
      if (!observation || !Number.isSafeInteger(observation.at) ||
          observation.at > current || current - observation.at >= OBSERVATION_TTL_MS) {
        entries.delete(key);
      }
    }
  }

  function record(sessionKey, candidate) {
    if (!validKey(sessionKey)) return false;
    const current = timestamp();
    if (current === null) {
      entries.delete(sessionKey);
      return false;
    }
    expire(current);
    // Every attempted observation replaces previous evidence. A failed,
    // unverified, or malformed audit must never leave an older 503 active.
    const verified = normalizeObservation(candidate);
    entries.delete(sessionKey);
    if (!verified) return false;
    // Ignore candidate.at: the trusted server clock is the only freshness source.
    entries.set(sessionKey, Object.freeze({...verified, at: current}));
    while (entries.size > MAX_OBSERVATION_SESSIONS) {
      entries.delete(entries.keys().next().value);
    }
    return true;
  }

  function read(sessionKey) {
    if (!validKey(sessionKey)) return null;
    const current = timestamp();
    if (current === null) {
      entries.clear();
      return null;
    }
    expire(current);
    return entries.get(sessionKey) || null;
  }

  function invalidate(sessionKey) {
    if (validKey(sessionKey)) entries.delete(sessionKey);
  }

  return Object.freeze({record, read, invalidate});
}

module.exports = Object.freeze({
  createTrustedObservationCache,
  OBSERVATION_TTL_MS,
  MAX_OBSERVATION_SESSIONS,
});
