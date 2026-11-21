'use strict';
/**
 * V182 frozen integration RED on genuine V181 returned source.
 * Source-only, injectable fake completion; no local model, sockets, owner secrets,
 * Docker, production config or runtime change.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createCalliopeAskRuntime} = require('../../utils/calliope-owner-session-runtime.cjs');
const {OBSERVATION_TTL_MS, MAX_OBSERVATION_SESSIONS} = require('../../utils/calliope-trusted-observation-cache.cjs');

const root = path.resolve(__dirname, '../..');
const key = (i) => i.toString(16).padStart(40, '0');
function trustedHead(route = '/demo/', status = 503) {
  return {
    code: status === 503 ? 'LOCAL_HTTP_NOT_GREEN' : 'LOCAL_HTTP_OK',
    healingPerformed: false,
    routeModified: false,
    summary: {
      route, status, mode: 'LOCAL_HTTP_HEAD_ONLY',
      redirectFollowed: false, healingPerformed: false,
    },
  };
}
function harness(now) {
  const delivered = [];
  const runtime = createCalliopeAskRuntime({
    root,
    now: () => now.value,
    complete: async ({messages}) => {
      const data = JSON.parse(messages[1].content);
      delivered.push(data);
      return JSON.stringify({
        answer: 'A prior HTTP HEAD does not establish the current health of the route.',
        evidenceIds: [],
        hypotheses: [],
        nextStep: 'Run a new authorized, read-only HEAD check.',
      });
    },
  });
  return {runtime, delivered};
}
const hasHead = (turn) => turn.evidence.some((x) => x.id === 'obs:last-fixed-host-head');

test('fresh owner-local 503 is available but expired HEAD is removed from NEW Ask evidence', async () => {
  const now = {value: 2000000};
  const {runtime, delivered} = harness(now);
  runtime.rememberAudit(key(1), trustedHead());
  const first = await runtime.ask({ownerSessionId: key(1), query: 'Why did the demo route return 503?'});
  assert.equal(first.usedAI, true);
  assert.equal(hasHead(delivered[0]), true, 'a fresh server-verified HEAD is real evidence');
  now.value += OBSERVATION_TTL_MS + 1;
  const second = await runtime.ask({ownerSessionId: key(1), query: 'Is that route still down now?'});
  assert.equal(second.usedAI, true);
  assert.equal(hasHead(delivered[1]), false, 'a historic 503 must NOT be represented as current evidence');
});

test('a subsequent failed or malformed audit invalidates the prior 503 evidence', async () => {
  const now = {value: 2000000};
  const {runtime, delivered} = harness(now);
  runtime.rememberAudit(key(1), trustedHead());
  runtime.rememberAudit(key(1), {code: 'LOCAL_HTTP_UNAVAILABLE'});
  const reply = await runtime.ask({ownerSessionId: key(1), query: 'Is this still a 503?'});
  assert.equal(reply.usedAI, true);
  assert.equal(hasHead(delivered.at(-1)), false, 'a failed follow-up cannot preserve old 503 as latest result');
});

test('observation cache never grows independently of bounded owner-session capacity', async () => {
  const now = {value: 2000000};
  const {runtime, delivered} = harness(now);
  for (let i = 1; i <= MAX_OBSERVATION_SESSIONS + 3; i++) {
    runtime.rememberAudit(key(i), trustedHead());
  }
  const first = await runtime.ask({ownerSessionId: key(1), query: 'What is the route status?'});
  assert.equal(first.usedAI, true);
  assert.equal(hasHead(delivered[0]), false, 'oldest observation must be evicted');
  const recent = await runtime.ask({ownerSessionId: key(MAX_OBSERVATION_SESSIONS + 3), query: 'What is the route status?'});
  assert.equal(recent.usedAI, true);
  assert.equal(hasHead(delivered[1]), true, 'most recent observation is retained');
});

test('logout invalidation removes model evidence and browser cannot re-grant it', async () => {
  const now = {value: 2000000};
  const {runtime, delivered} = harness(now);
  runtime.rememberAudit(key(1), trustedHead());
  runtime.invalidate(key(1));
  const reply = await runtime.ask({ownerSessionId: key(1), query: 'Any verified current observation?'});
  assert.equal(reply.usedAI, true);
  assert.equal(hasHead(delivered.at(-1)), false);
  assert.equal(delivered.at(-1).history.length, 0);
});
