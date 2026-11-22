'use strict';
/**
 * V187 narrow disposable integrity: recognized repair/observation language
 * prefers a successful local-model reply (usedAI:true); when the model fails,
 * the existing deterministic explain template remains available (usedAI:false).
 * SOURCE-ONLY — injectable fake completion; no host, Docker, network, or credentials.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {buildCalliopeInstalledApiOverlay} = require('../../utils/rc2-v185-calliope-api-overlay.cjs');
const {compileModelFirstApi} = require('../../utils/rc2-v187-calliope-model-first.cjs');
const {explainLocalCalliopeCapability} = require('../../utils/rc2-local-calliope-observe-explain.cjs');
const {createCalliopeAskRuntime} = require('../../utils/calliope-owner-session-runtime.cjs');

const ROOT = path.resolve(__dirname, '../..');
const MAIN = '590bcf2a980b434f533ddacac43a24a777a933e7';
const Q_REPAIR = 'How can you fix a Next.js redirect loop?';
const Q_HEAD = 'What does the fixed-host HTTP HEAD observation prove?';

const deployed = buildCalliopeInstalledApiOverlay({
  installedSource: execFileSync('git', ['cat-file', 'blob', '7a22ec61531ac7b39c01370e41196775904c274f'], {encoding: 'utf8'}),
  mainSource: execFileSync('git', ['show', MAIN + ':utils/proxyConfigAPI.js'], {encoding: 'utf8'}),
  reviewedSource: fs.readFileSync(path.join(ROOT, 'utils/proxyConfigAPI.js'), 'utf8'),
});
const proposed = compileModelFirstApi({deployedSource: deployed.source});

function handlerOrder(src) {
  const begin = src.indexOf("if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())");
  const end = src.indexOf("if (req.method==='POST' && u.pathname===apiPath('ai/audit') && inlineHostDockerUnavailable())", begin);
  const h = src.slice(begin, end);
  return {
    model: h.indexOf('calliopeAskRuntime().ask('),
    explain: h.indexOf('explainLocalCalliopeCapability(request.query)'),
    docs: h.indexOf('answerFromLocalProjectDocs('),
  };
}

test('proposed secure Ask source attempts local model before deterministic explain and docs', () => {
  assert.equal(deployed.ok, true);
  assert.equal(proposed.ok, true, JSON.stringify(proposed));
  assert.equal(proposed.productionChangeAuthorized, false);
  assert.equal(proposed.apiRestartAuthorized, false);
  assert.equal(proposed.hostAttested, false);
  const before = handlerOrder(deployed.source);
  const after = handlerOrder(proposed.source);
  assert.ok(before.explain >= 0 && before.explain < before.model, 'V186 baseline intercepts first');
  assert.ok(after.model >= 0 && after.model < after.explain && after.explain < after.docs,
    'V187 candidate: model → explain → docs');
});

test('recognized repair/observation questions: successful fake local model yields usedAI:true readonly flags', async () => {
  for (const query of [Q_REPAIR, Q_HEAD]) {
    const explained = explainLocalCalliopeCapability(query);
    assert.equal(explained.ok, true, query);
    assert.equal(explained.usedAI, false, 'templates remain available as fallback material');

    const runtime = createCalliopeAskRuntime({
      root: ROOT,
      complete: async () => JSON.stringify({
        answer: 'I can describe the redirect pattern from evidence, but I cannot repair or mutate anything.',
        evidenceIds: [],
        hypotheses: ['A rewrite may be incorrect.'],
        nextStep: 'Offer one authenticated read-only observation.',
      }),
    });
    const ownerSessionId = runtime.sessionKey('v187-disposable-token');
    const local = await runtime.ask({ownerSessionId, query});
    assert.equal(local.ok, true, query);
    assert.equal(local.usedAI, true, query);
    assert.equal(local.mode, 'local_model_readonly', query);
    for (const k of ['healingPerformed', 'executionAuthorized', 'productionChangeAuthorized', 'liveAttested', 'networkTransferAuthorized']) {
      assert.equal(local[k], false, k);
    }
    // Source contract: successful model reply is preferred over explained.ok template.
    assert.ok(handlerOrder(proposed.source).model < handlerOrder(proposed.source).explain);
  }
});

test('when local model is unavailable, deterministic explain still answers usedAI:false without heal authority', async () => {
  let calls = 0;
  const runtime = createCalliopeAskRuntime({
    root: ROOT,
    complete: async () => { calls += 1; throw new Error('offline'); },
  });
  const ownerSessionId = runtime.sessionKey('v187-offline-token');
  const local = await runtime.ask({ownerSessionId, query: Q_REPAIR});
  assert.equal(calls, 1);
  assert.equal(local.usedAI, false);
  assert.equal(local.healingPerformed, false);
  assert.equal(local.liveAttested, false);

  const explained = explainLocalCalliopeCapability(Q_REPAIR);
  assert.equal(explained.ok, true);
  assert.equal(explained.usedAI, false);
  assert.equal(explained.healingPerformed, false);
  assert.equal(explained.productionChangeAuthorized, false);
  assert.equal(explained.liveAttested, false);
  // Proposed source still keeps explain ahead of docs after model failure path.
  const ord = handlerOrder(proposed.source);
  assert.ok(ord.explain < ord.docs);
});
