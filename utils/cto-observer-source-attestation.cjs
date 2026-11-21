'use strict';
/**
 * Fail-closed loaded-source attestation for CTO observer grants.
 * Never trusts a caller-supplied SHA as authority.
 */
const HEX_SHA = /^[a-f0-9]{40}$/;

function resolveAttestedSourceSha(env = process.env) {
  const candidates = [
    env.DEVPROXY_SOURCE_SHA,
    env.DEVPROXY_GIT_SHA,
    env.DEVPROXY_ATTESTED_SOURCE_SHA,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && HEX_SHA.test(value)) return value;
  }
  return null;
}

/**
 * Decide which SHA may be used for grant issuance.
 * @returns {{ok:true,sourceSha:string}|{ok:false,code:string}}
 */
function selectGrantSourceSha({ attestedSourceSha, requestedSourceSha } = {}) {
  if (typeof attestedSourceSha !== 'string' || !HEX_SHA.test(attestedSourceSha)) {
    return { ok: false, code: 'SOURCE_SHA_UNAVAILABLE' };
  }
  if (requestedSourceSha === undefined || requestedSourceSha === null || requestedSourceSha === '') {
    return { ok: true, sourceSha: attestedSourceSha };
  }
  if (typeof requestedSourceSha !== 'string' || !HEX_SHA.test(requestedSourceSha)) {
    return { ok: false, code: 'SOURCE_SHA_INVALID' };
  }
  if (requestedSourceSha !== attestedSourceSha) {
    return { ok: false, code: 'SOURCE_SHA_MISMATCH' };
  }
  return { ok: true, sourceSha: attestedSourceSha };
}

module.exports = Object.freeze({
  resolveAttestedSourceSha,
  selectGrantSourceSha,
});
