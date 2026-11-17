'use strict';
/**
 * V153 RED→GREEN: after a verified LOCAL_HTTP_HEAD_ONLY 503 observation,
 * repair-intent follow-ups ("please repair" / "try anyway") must stay
 * route-grounded instead of dumping unrelated docs or "no grounded answer".
 * Source/unit only — no production, Docker, credentials, or external AI.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const helperPath = path.join(ROOT, 'utils', 'rc2-calliope-grounded-followup.cjs');
const statusHtml = fs.readFileSync(path.join(ROOT, 'status', 'status.html'), 'utf8');
const commonJs = fs.readFileSync(path.join(ROOT, 'status', 'common.js'), 'utf8');

function section(src, start, end) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, 'missing source section: ' + start);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to > from, 'missing section terminator: ' + end);
  return src.slice(from, to);
}

const wizardObs = Object.freeze({
  route: '/wizardmaker/',
  status: 503,
  code: 'LOCAL_HTTP_NOT_GREEN',
  mode: 'LOCAL_HTTP_HEAD_ONLY',
  redirectFollowed: false,
  healingPerformed: false,
  browserAudited: false,
  at: 1
});

test('helper module exists for grounded repair follow-ups', () => {
  assert.equal(fs.existsSync(helperPath), true, 'utils/rc2-calliope-grounded-followup.cjs missing');
});

test('please repair after /wizardmaker/ 503 cites observation; no docs dump; repair not claimed', () => {
  const {
    isRepairIntentFollowUp,
    replyForRepairFollowUp,
    FORBIDDEN_DOC_MARKERS
  } = require(helperPath);
  assert.equal(isRepairIntentFollowUp('please repair'), true);
  const out = replyForRepairFollowUp({ observation: wizardObs, query: 'please repair' });
  assert.equal(out.ok, true);
  assert.equal(out.mode, 'grounded_route_followup');
  assert.match(out.answer, /\/wizardmaker\//);
  assert.match(out.answer, /503/);
  assert.match(out.answer, /LOCAL_HTTP_HEAD_ONLY|HTTP HEAD/i);
  assert.match(out.answer, /redirect(?:s)? (?:were )?not followed|redirectFollowed:\s*false/i);
  assert.match(out.answer, /not (?:currently )?permitted|was not (?:run|attempted)|no repair/i);
  assert.match(out.answer, /Diagnose|next diagnostic|owner-reviewed/i);
  assert.doesNotMatch(out.answer, /could not find a grounded answer/i);
  for (const marker of FORBIDDEN_DOC_MARKERS) {
    assert.equal(out.answer.includes(marker), false, 'leaked doc marker: ' + marker);
  }
  assert.equal(out.healingPerformed, false);
  assert.equal(out.executionAuthorized, false);
});

test('try anyway after same observation stays grounded (matcher must include try anyway)', () => {
  const { isRepairIntentFollowUp, replyForRepairFollowUp } = require(helperPath);
  assert.equal(isRepairIntentFollowUp('try anyway'), true);
  const out = replyForRepairFollowUp({ observation: wizardObs, query: 'try anyway' });
  assert.equal(out.ok, true);
  assert.match(out.answer, /\/wizardmaker\//);
  assert.match(out.answer, /503/);
  assert.doesNotMatch(out.answer, /CALLIOPE_ASSISTANT\.md|ARCHITECTURE\.md|CONFIGURATION\.md/);
  assert.doesNotMatch(out.answer, /could not find a grounded answer/i);
});

test('ordinary unrelated question is not treated as repair follow-up', () => {
  const { isRepairIntentFollowUp } = require(helperPath);
  assert.equal(isRepairIntentFollowUp('how does route precedence work?'), false);
  assert.equal(isRepairIntentFollowUp('what is Calliope?'), false);
});

test('route A then route B: follow-up grounds on B only', () => {
  const {
    retainVerifiedObservation,
    replyForRepairFollowUp
  } = require(helperPath);
  const a = retainVerifiedObservation(null, {
    route: '/alpha/', status: 502, code: 'LOCAL_HTTP_NOT_GREEN',
    mode: 'LOCAL_HTTP_HEAD_ONLY', redirectFollowed: false,
    healingPerformed: false, browserAudited: false, at: 10
  });
  const b = retainVerifiedObservation(a, {
    route: '/beta/', status: 503, code: 'LOCAL_HTTP_NOT_GREEN',
    mode: 'LOCAL_HTTP_HEAD_ONLY', redirectFollowed: false,
    healingPerformed: false, browserAudited: false, at: 20
  });
  assert.equal(b.route, '/beta/');
  const out = replyForRepairFollowUp({ observation: b, query: 'please repair' });
  assert.match(out.answer, /\/beta\//);
  assert.doesNotMatch(out.answer, /\/alpha\//);
});

test('Clear / missing observation: explicit unknown route, not docs heal prose', () => {
  const { replyForRepairFollowUp, FORBIDDEN_DOC_MARKERS } = require(helperPath);
  const out = replyForRepairFollowUp({ observation: null, query: 'please repair' });
  assert.equal(out.ok, true);
  assert.equal(out.mode, 'unknown_route_followup');
  assert.match(out.answer, /don'?t know which route|use Diagnose/i);
  for (const marker of FORBIDDEN_DOC_MARKERS) {
    assert.equal(out.answer.includes(marker), false, 'leaked doc marker: ' + marker);
  }
});

test('ambiguous / invalid observation is rejected; malicious URL never retained', () => {
  const {
    retainVerifiedObservation,
    parseVerifiedAuditObservation
  } = require(helperPath);
  assert.equal(retainVerifiedObservation(null, {
    route: 'https://evil.example/pwn', status: 503, code: 'LOCAL_HTTP_NOT_GREEN',
    mode: 'LOCAL_HTTP_HEAD_ONLY', redirectFollowed: false, healingPerformed: false
  }), null);
  assert.equal(retainVerifiedObservation(null, {
    route: '/admin/secret', status: 503, code: 'LOCAL_HTTP_NOT_GREEN',
    mode: 'LOCAL_HTTP_HEAD_ONLY', redirectFollowed: false, healingPerformed: false
  }), null);
  assert.equal(parseVerifiedAuditObservation({
    ok: true,
    code: 'LOCAL_HTTP_NOT_GREEN',
    healingPerformed: false,
    routeModified: false,
    summary: {
      mode: 'LOCAL_HTTP_HEAD_ONLY',
      route: 'http://127.0.0.1:9/wizardmaker/',
      status: 503,
      redirectFollowed: false,
      healingPerformed: false,
      browserAudited: false
    }
  }), null);
  assert.equal(parseVerifiedAuditObservation({
    ok: false,
    code: 'LOCAL_HTTP_NOT_GREEN',
    healingPerformed: false,
    routeModified: false,
    summary: {
      mode: 'LOCAL_HTTP_HEAD_ONLY',
      route: '/wizardmaker/',
      status: 503,
      redirectFollowed: false,
      healingPerformed: false,
      browserAudited: false
    }
  })?.route, '/wizardmaker/');
});

test('Status Diagnose retains typed last observation and Clear resets it', () => {
  const diagnosis = section(
    statusHtml,
    'async function runCalliopeHealth(routeKey){',
    '// Expose for inline handlers'
  );
  const clear = section(statusHtml, 'function clearChat(){', '// Persisted chat history loader');
  const ask = section(statusHtml, 'async function onAsk(){', 'async function onReindex(){');
  assert.match(statusHtml, /lastVerifiedRouteObservation/);
  assert.match(diagnosis, /retainVerifiedObservation|lastVerifiedRouteObservation\s*=/);
  assert.match(diagnosis, /parseVerifiedAuditObservation/);
  assert.match(clear, /lastVerifiedRouteObservation\s*=\s*null/);
  assert.match(ask, /calliopeReplyForRepairFollowUp|isRepairIntentFollowUp/);
  assert.match(statusHtml, /try anyway/i);
  assert.match(statusHtml, /V153.*rc2-calliope-grounded-followup|keep in sync with utils\/rc2-calliope-grounded-followup/i);
});

test('repair follow-up with observation does not POST ai/ask; ordinary ask still can', () => {
  // Source contract: grounded branch returns before fetch(ai/ask).
  const ask = section(statusHtml, 'async function onAsk(){', 'async function onReindex(){');
  assert.match(ask, /isRepairIntentFollowUp|looksLikeHealFollowUp/);
  assert.match(ask, /lastVerifiedRouteObservation/);
  assert.match(ask, /apiPath\(['"]ai\/ask['"]\)/);
  // Grounded path must short-circuit before the ask fetch when observation exists.
  const groundedIdx = ask.indexOf('calliopeReplyForRepairFollowUp');
  const askFetchIdx = ask.indexOf("apiPath('ai/ask')");
  assert.ok(groundedIdx >= 0, 'missing grounded follow-up call');
  assert.ok(askFetchIdx > groundedIdx, 'ai/ask fetch must remain after grounded short-circuit');
});

test('V152 UI invariants preserved: no audit-and-heal, heal:false observational, local vendors', () => {
  assert.equal(statusHtml.includes("apiPath('ai/audit-and-heal')"), false);
  assert.equal(commonJs.includes('audit-and-heal'), false);
  assert.match(commonJs, /heal:\s*false/);
  assert.match(statusHtml, /\/status\/vendor\/lucide\.min\.js/);
  assert.match(statusHtml, /activeAskSeq !== 0/);
  assert.doesNotMatch(statusHtml, /<textarea[^>]*id="aiQuery2"/);
});

test('behavioral: mocked diagnose 503 → please repair → try anyway (no ai/ask)', () => {
  const {
    isRepairIntentFollowUp,
    replyForRepairFollowUp,
    retainVerifiedObservation,
    parseVerifiedAuditObservation,
    clearRouteObservation
  } = require(helperPath);

  let observation = null;
  const asks = [];
  const bubbles = [];

  function diagnose(result) {
    const parsed = parseVerifiedAuditObservation(result);
    observation = retainVerifiedObservation(observation, parsed);
    bubbles.push({
      role: 'assistant',
      content: parsed
        ? ('Route ' + parsed.route + ': local HTTP HEAD returned ' + parsed.status + ' (not green).')
        : 'unavailable'
    });
  }
  function ask(q) {
    bubbles.push({ role: 'user', content: q });
    if (isRepairIntentFollowUp(q)) {
      const out = replyForRepairFollowUp({ observation, query: q });
      bubbles.push({ role: 'assistant', content: out.answer, mode: out.mode });
      return out;
    }
    asks.push(q);
    bubbles.push({ role: 'assistant', content: 'docs fallback', mode: 'local_documentation' });
    return { mode: 'local_documentation' };
  }

  diagnose({
    ok: false,
    code: 'LOCAL_HTTP_NOT_GREEN',
    healingPerformed: false,
    routeModified: false,
    summary: {
      mode: 'LOCAL_HTTP_HEAD_ONLY',
      route: '/wizardmaker/',
      status: 503,
      redirectFollowed: false,
      healingPerformed: false,
      browserAudited: false
    }
  });
  const r1 = ask('please repair');
  const r2 = ask('try anyway');
  assert.equal(asks.length, 0, 'repair follow-ups must not hit docs Ask');
  assert.equal(r1.mode, 'grounded_route_followup');
  assert.equal(r2.mode, 'grounded_route_followup');
  assert.match(r1.answer, /\/wizardmaker\//);
  assert.match(r2.answer, /503/);

  observation = clearRouteObservation();
  const r3 = ask('please repair');
  assert.equal(r3.mode, 'unknown_route_followup');
  assert.equal(asks.length, 0);

  const r4 = ask('how does nginx reload work?');
  assert.equal(r4.mode, 'local_documentation');
  assert.equal(asks.length, 1);
});

test('helper is loadable in isolation without network', () => {
  const code = fs.readFileSync(helperPath, 'utf8');
  const sandbox = { module: { exports: {} }, exports: {}, require: () => { throw new Error('no require'); } };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  assert.equal(typeof sandbox.module.exports.isRepairIntentFollowUp, 'function');
  assert.equal(typeof sandbox.module.exports.replyForRepairFollowUp, 'function');
});
