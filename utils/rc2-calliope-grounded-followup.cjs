'use strict';
/**
 * V153: session-local grounded repair follow-ups after a verified fixed-host
 * HTTP HEAD observation. Pure helpers for Status Ask continuity — no network,
 * Docker, docs retrieval, heal execution, or standing server memory.
 */
const FORBIDDEN_DOC_MARKERS = Object.freeze([
  'CALLIOPE_ASSISTANT.md',
  'ARCHITECTURE.md',
  'CONFIGURATION.md',
  'Local project documentation excerpts',
  'could not find a grounded answer'
]);

const FLAGS = Object.freeze({
  healingPerformed: false,
  executionAuthorized: false,
  productionChangeAuthorized: false,
  liveAttested: false,
  usedAI: false
});

const BLOCKED_TOP = new Set([
  'admin', 'devproxy', 'api', 'config', 'status', 'dashboard',
  '.artifacts', 'nginx_status', 'server-status', '_internal'
]);

function isAllowlistedRoute(route) {
  if (typeof route !== 'string' || route.length < 2 || route.length > 256) return false;
  if (route[0] !== '/' || route.startsWith('//')) return false;
  if (!/^\/[a-zA-Z0-9._~/-]*$/.test(route)) return false;
  if (route.includes('//') || route.includes('/./') || route.includes('/../')) return false;
  if (route.endsWith('/.') || route.endsWith('/..')) return false;
  if (route.split('/').some((p) => p.startsWith('.'))) return false;
  const top = (route.split('/')[1] || '').toLowerCase();
  if (BLOCKED_TOP.has(top)) return false;
  return true;
}

function isRepairIntentFollowUp(query) {
  const s = String(query || '').trim();
  if (!s || Buffer.byteLength(s, 'utf8') > 512) return false;
  if (/\b(you have my authority|i (give you|grant you) (my )?authority|i (authorize|consent|approve)|go ahead( and heal)?|owner (go|authority|consent)|you('re| are) authorized|permission granted|authorized to (heal|fix|proceed))\b/i.test(s)) {
    return true;
  }
  if (/^(please\s+)?(fix|heal|repair|resolve|unbreak)(\s+(this|it|that|the\s+route|the\s+issue|the\s+problem))?[.!?]*$/i.test(s)) {
    return true;
  }
  if (/\b(please\s+)?(fix|heal|repair)\s+(this|it|that)\b/i.test(s)) return true;
  if (/\b(can you|could you|try to|just)\s+(fix|heal|repair)\b/i.test(s)) return true;
  if (/\b(make it work|do the heal|run heal|audit and heal|try again|do it anyway|try anyway)\b/i.test(s)) {
    return true;
  }
  return false;
}

function normalizeObservation(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const route = candidate.route;
  const status = candidate.status;
  const code = candidate.code;
  const mode = candidate.mode;
  if (!isAllowlistedRoute(route)) return null;
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  if (code !== 'LOCAL_HTTP_OK' && code !== 'LOCAL_HTTP_NOT_GREEN') return null;
  if (mode !== 'LOCAL_HTTP_HEAD_ONLY') return null;
  if (candidate.healingPerformed === true || candidate.routeModified === true) return null;
  if (candidate.redirectFollowed === true) return null;
  return Object.freeze({
    route,
    status,
    code,
    mode: 'LOCAL_HTTP_HEAD_ONLY',
    redirectFollowed: false,
    healingPerformed: false,
    browserAudited: candidate.browserAudited === true,
    at: Number.isFinite(candidate.at) ? candidate.at : Date.now()
  });
}

function parseVerifiedAuditObservation(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  if (result.healingPerformed === true || result.routeModified === true) return null;
  if (result.code !== 'LOCAL_HTTP_OK' && result.code !== 'LOCAL_HTTP_NOT_GREEN') return null;
  const summary = result.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  if (summary.mode !== 'LOCAL_HTTP_HEAD_ONLY') return null;
  if (summary.redirectFollowed === true || summary.healingPerformed === true) return null;
  return normalizeObservation({
    route: summary.route,
    status: summary.status,
    code: result.code,
    mode: summary.mode,
    redirectFollowed: false,
    healingPerformed: false,
    browserAudited: summary.browserAudited === true,
    at: Date.now()
  });
}

function retainVerifiedObservation(previous, next) {
  const normalized = normalizeObservation(next);
  if (!normalized) return null;
  return normalized;
}

function clearRouteObservation() {
  return null;
}

function unknownRouteReply(query) {
  const q = String(query || '').slice(0, 80);
  return Object.freeze({
    ok: true,
    mode: 'unknown_route_followup',
    answer: [
      'I don\'t know which route you\'re asking about—use Diagnose on a route card first.',
      '',
      'Saying "' + q + '" does not select a route, does not run a repair, and will not quote historical heal documentation as a substitute.',
      '',
      'Evidence vs assumption: without a verified local HTTP HEAD observation in this Status session, I have no route identity or status code to reason from.'
    ].join('\n'),
    ...FLAGS
  });
}

function groundedReply(observation, query) {
  const q = String(query || '').slice(0, 80);
  const green = observation.code === 'LOCAL_HTTP_OK';
  const reachability = green
    ? ('reachable via HEAD (' + observation.status + ')')
    : ('not green via HEAD (' + observation.status + ')');
  return Object.freeze({
    ok: true,
    mode: 'grounded_route_followup',
    answer: [
      'Grounded on the last verified Status observation for `' + observation.route + '` (session-local; not a standing memory).',
      '',
      'Observed evidence:',
      '- mode: LOCAL_HTTP_HEAD_ONLY',
      '- code: ' + observation.code,
      '- HTTP HEAD status: ' + observation.status + ' (' + reachability + ')',
      '- redirectFollowed: false (redirects were not followed)',
      '- healingPerformed: false / browserAudited: ' + (observation.browserAudited ? 'true' : 'false'),
      '',
      'Assumptions I will not make from that HEAD alone:',
      '- root cause (upstream down vs wrong upstream name vs proxy mismatch vs method-only quirk)',
      '- GET/browser rendering parity',
      '- that a repair is authorized or possible from chat',
      '',
      'Saying "' + q + '" does not unlock Docker-backed healing or an automatic fix. Repair is not currently permitted from this Ask path, and no repair was attempted.',
      '',
      'Next diagnostic (owner-approved, still non-mutating unless separately granted): re-run Diagnose on `' + observation.route + '` after checking whether the configured upstream hostname is the process that is actually running; if you need a change applied, use an owner-reviewed control for that specific repair type (for example Fix /_next/ loop when that defect applies)—do not treat docs excerpts as authority to heal.'
    ].join('\n'),
    route: observation.route,
    status: observation.status,
    observationCode: observation.code,
    ...FLAGS
  });
}

function replyForRepairFollowUp({ observation, query } = {}) {
  if (!isRepairIntentFollowUp(query)) {
    return Object.freeze({ ok: false, code: 'NOT_REPAIR_FOLLOWUP', ...FLAGS });
  }
  const normalized = normalizeObservation(observation);
  if (!normalized) return unknownRouteReply(query);
  return groundedReply(normalized, query);
}

module.exports = {
  FORBIDDEN_DOC_MARKERS,
  isRepairIntentFollowUp,
  isAllowlistedRoute,
  normalizeObservation,
  parseVerifiedAuditObservation,
  retainVerifiedObservation,
  clearRouteObservation,
  replyForRepairFollowUp
};
