'use strict';
/**
 * V185 source-only integrity on the GENERATED installed-API overlay.
 * Disposable fixture only: Git blobs + injectable fake local model.
 * No owner-host access, Docker, live recycle, Status edits, or authority grants.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {buildCalliopeInstalledApiOverlay} = require('../../utils/rc2-v185-calliope-api-overlay.cjs');
const {createCalliopeAskRuntime} = require('../../utils/calliope-owner-session-runtime.cjs');
const {classifyManagementRequest} = require('../../utils/managementAuthPolicy.cjs');

const INSTALLED = '7a22ec61531ac7b39c01370e41196775904c274f';
const MAIN_COMMIT = '590bcf2a980b434f533ddacac43a24a777a933e7';
const EXPECTED_OVERLAY_BLOB = 'f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528';
const GROUNDED_FOLLOWUP = '78a511dd8e5d7a2dc24a8487cfd80e1c58f70e78';
const ROOT = path.resolve(__dirname, '../..');

function blobSha(s){
  const buf = Buffer.from(s, 'utf8');
  return crypto.createHash('sha1').update('blob ' + buf.length + '\0').update(buf).digest('hex');
}
function git(args){
  return execFileSync('git', args, {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
}

const overlay = buildCalliopeInstalledApiOverlay({
  installedSource: git(['cat-file', 'blob', INSTALLED]),
  mainSource: git(['show', MAIN_COMMIT + ':utils/proxyConfigAPI.js']),
  reviewedSource: fs.readFileSync(path.join(ROOT, 'utils/proxyConfigAPI.js'), 'utf8'),
});

test('generated overlay is the exact 29-add proposal with no host authority', () => {
  assert.equal(overlay.ok, true, JSON.stringify(overlay));
  assert.equal(overlay.sourceGitBlobSha1, EXPECTED_OVERLAY_BLOB);
  assert.equal(overlay.totalInsertions, 29);
  assert.deepEqual(overlay.insertedLineCounts, [1, 5, 1, 16, 6]);
  assert.equal(overlay.productionChangeAuthorized, false);
  assert.equal(overlay.apiRestartAuthorized, false);
  assert.equal(overlay.hostAttested, false);
  assert.equal(overlay.deployed, false);
  assert.doesNotThrow(() => new vm.Script(overlay.source, {filename: 'v185-overlay-proxyConfigAPI.js'}));
});

test('overlay keeps auth + trusted-Origin gate before secure Ask/Audit and wires logout invalidation', () => {
  const src = overlay.source;
  const auth = src.indexOf('const authBoundary = classifyManagementRequest(');
  const ask = src.indexOf("if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())");
  const audit = src.indexOf("if (req.method==='POST' && u.pathname===apiPath('ai/audit') && inlineHostDockerUnavailable())");
  const logout = src.indexOf("if (req.method === 'POST' && u.pathname === '/admin/logout')");
  const deny = src.indexOf('const controlGate=classifySecureManagementOperation(', ask);
  const legacy = src.indexOf("if (req.method === 'POST' && u.pathname === apiPath('ai/ask'))", deny);
  assert.ok(auth > 0 && ask > auth && audit > ask && deny > audit && legacy > deny);
  assert.ok(logout > 0 && logout < ask);
  assert.equal(classifyManagementRequest('POST', '/devproxy/api/ai/ask').requiresAuth, true);
  assert.equal(classifyManagementRequest('POST', '/devproxy/api/ai/audit').requiresAuth, true);
  assert.match(src.slice(auth, ask), /requireAuth\(req, res, u\)/);
  const askHandler = src.slice(ask, audit);
  assert.match(askHandler, /calliopeAskRuntime\(\)\.ask\(/);
  assert.match(askHandler, /mode:'local_model_readonly'/);
  assert.match(askHandler, /healingPerformed:false/);
  assert.match(askHandler, /productionChangeAuthorized:false/);
  assert.doesNotMatch(askHandler, /\b(?:spawnSync|execSync|fetch)\s*\(/);
  assert.match(src.slice(audit, deny), /calliopeAskRuntime\(\)\.rememberAudit\(/);
  assert.match(src.slice(logout, ask), /calliopeAskRuntime\(\)\.invalidate\(/);
  // Unrelated installed Create Route / reports semantics must survive.
  assert.equal(src.includes("require('./reports-list-catalog.cjs')"), false);
  assert.equal(src.includes("require('./create-route-install-intent.cjs')"), false);
  assert.equal(src.includes('const shouldInstall = options.install !== false;'), true);
});

test('future stage module closure: five Calliope modules + grounded-followup exact blob; runtime Ask/Audit/logout integrity', async () => {
  const required = [
    'utils/calliope-owner-session-runtime.cjs',
    'utils/calliope-owner-session-brain.cjs',
    'utils/calliope-local-model-complete.cjs',
    'utils/calliope-grounded-local-turn.cjs',
    'utils/calliope-trusted-observation-cache.cjs',
    'utils/rc2-calliope-grounded-followup.cjs',
  ];
  for (const rel of required) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
  }
  assert.equal(git(['rev-parse', 'HEAD:utils/rc2-calliope-grounded-followup.cjs']).trim(), GROUNDED_FOLLOWUP);

  const token = 'v185-disposable-session-token';
  const delivered = [];
  const runtime = createCalliopeAskRuntime({
    root: ROOT,
    complete: async ({messages}) => {
      const data = JSON.parse(messages[1].content);
      delivered.push(data);
      // Cite only evidence the server actually supplied — never invent heal authority.
      const ids = (data.evidence || []).map((e) => e.id).slice(0, 2);
      return JSON.stringify({
        answer: 'Trusted evidence was considered; cause is not established and no repair ran.',
        evidenceIds: ids,
        hypotheses: ['Upstream may be unhealthy.'],
        nextStep: 'Offer one new authenticated read-only HEAD.',
      });
    },
  });
  const ownerSessionId = runtime.sessionKey(token);
  assert.equal(ownerSessionId.length, 40);
  assert.notEqual(ownerSessionId, token);

  runtime.rememberAudit(ownerSessionId, {
    code: 'LOCAL_HTTP_NOT_GREEN',
    healingPerformed: false,
    routeModified: false,
    summary: {
      route: '/demo/', status: 503, mode: 'LOCAL_HTTP_HEAD_ONLY',
      redirectFollowed: false, healingPerformed: false,
    },
  });
  const first = await runtime.ask({ownerSessionId, query: 'Why did /demo/ return 503?'});
  assert.equal(first.ok, true);
  assert.equal(first.usedAI, true);
  assert.equal(first.mode, 'local_model_readonly');
  for (const k of ['healingPerformed', 'executionAuthorized', 'productionChangeAuthorized', 'liveAttested', 'networkTransferAuthorized']) {
    assert.equal(first[k], false, k);
  }
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].evidence.some((e) => e.id === 'obs:last-fixed-host-head'), true);
  const presented = runtime.present(first);
  assert.match(presented, /cause is not established/i);
  assert.doesNotMatch(presented, /I fixed|healed the route/i);

  // Logout-equivalent invalidation must clear session brain + observation cache.
  runtime.invalidate(ownerSessionId);
  const afterLogout = await runtime.ask({ownerSessionId, query: 'Is that still broken?'});
  assert.equal(afterLogout.ok, true);
  assert.equal(afterLogout.usedAI, true);
  assert.equal(afterLogout.mode, 'local_model_readonly');
  assert.equal(delivered[1].evidence.some((e) => e.id === 'obs:last-fixed-host-head'), false);
  assert.equal(delivered[1].history.length, 0);

  // Empty session key must fail closed without model use.
  let modelCalls = 0;
  const locked = createCalliopeAskRuntime({
    root: ROOT,
    complete: async () => { modelCalls += 1; return '{}'; },
  });
  const denied = await locked.ask({ownerSessionId: '', query: 'repair it'});
  assert.equal(denied.ok, false);
  assert.equal(modelCalls, 0);
});

test('Health/Reports shared Ask path already posts authenticated ai/ask (Status HTML untouched by V185)', () => {
  const common = fs.readFileSync(path.join(ROOT, 'status/common.js'), 'utf8');
  assert.match(common, /fetch\('\/devproxy\/api\/ai\/ask'/);
  assert.match(common, /JSON\.stringify\(\{query:q\}\)/);
  // This assignment must not rewrite dirty-mounted status.html.
  assert.equal(overlay.source.includes('status.html'), false);
});
