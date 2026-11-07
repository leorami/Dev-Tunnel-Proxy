'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createOwnerHealReviewGate}=require('../../utils/rc2-owner-heal-review-gate.cjs');
const {runOwnerNextjsRedirectHealSkill}=require('../../utils/calliope-owner-nextjs-heal-skill.cjs');
const {proposeRepair}=require('../../utils/calliope-first-safe-heal.cjs');
const {disposableBrokenLyraSource}=require('../../utils/calliope-nextjs-redirect-fixture.cjs');
const {createTwoPhaseHostSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const {createNonliveSettlementActivation}=require('../../utils/rc1-v12-nonlive-settlement-activation.cjs');
const {createProductionRouteMutationService}=require('../../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../../utils/exclusive-route-mutation-lock.cjs');

const SESSION='a'.repeat(64);
const SESSION2='b'.repeat(64);

async function fx(source){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv94-gate-')));
 await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','lease','lease/replay'])
  await fs.mkdir(path.join(root,d),{mode:0o700});
 for(const [p,body] of [['config/default.production.conf','server{listen 80;}\n'],
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['build/sites-enabled/apps.generated.conf','# empty\n'],
  ['apps/lyra.conf',source]])await fs.writeFile(path.join(root,p),body);
 const generateBundle=async()=>{
  const list=(await fs.readdir(path.join(root,'apps'))).filter(x=>x.endsWith('.conf')).sort();
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),
   '# apps\n'+(await Promise.all(list.map(x=>fs.readFile(path.join(root,'apps',x),'utf8')))).join('\n'));
  await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),'{}');
  await fs.writeFile(path.join(root,'.artifacts/override-conflicts.json'),'[]');
 };
 await generateBundle();
 const secret=crypto.randomBytes(32);
 const host=createTwoPhaseHostSettlement({directory:path.join(root,'lease'),approvedRoot:root,
  secret,verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true});
 const activation=createNonliveSettlementActivation({approvedRoot:root,secret,host,
  simulateFixedHostAction:async()=>true});
 const lock=createExclusiveMutationLock({directory:path.join(root,'.artifacts/route-mutation-locks')});
 const mutation=createProductionRouteMutationService({root,activation,generateBundle,lock,allowConfigEdit:false});
 return {root,mutation,appsDir:path.join(root,'apps'),close:()=>fs.rm(root,{recursive:true,force:true})};
}

test('RED: pre-V94 direct apply without prior propose ticket is denied (no editApp)',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const env=await fx(source);
 try{
  // Authenticated skill call with matching hashes but NO reviewTicketConsumed.
  const r=await runOwnerNextjsRedirectHealSkill({
   authenticated:true,appsDir:env.appsDir,appName:'lyra.conf',route:'lyra',
   beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
   mutation:env.mutation
  });
  assert.equal(r.ok,false);
  assert.equal(r.httpStatus,403);
  assert.equal(r.code,'REVIEW_TICKET_REQUIRED');
  assert.equal(r.healingPerformed,false);
  assert.equal(await fs.readFile(path.join(env.appsDir,'lyra.conf'),'utf8'),source);
 }finally{await env.close();}
});

test('RED: propose→consume→apply succeeds once; replay denied without mutation',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const gate=createOwnerHealReviewGate();
 const issued=gate.issueReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 });
 assert.equal(issued.ok,true);
 assert.equal(issued.ownerApprovalGranted,false);
 assert.equal(issued.executionAuthorized,false);
 assert.ok(typeof issued.ticket==='string');

 const env=await fx(source);
 try{
  const consumed=gate.consumeReviewTicket({
   sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
   beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
   reviewTicket:issued.ticket
  });
  assert.equal(consumed.ok,true);
  assert.equal(consumed.status,'PROPOSAL_TICKET_CONSUMED');
  assert.equal(consumed.healingPerformed,false);

  const applied=await runOwnerNextjsRedirectHealSkill({
   authenticated:true,appsDir:env.appsDir,appName:'lyra.conf',route:'lyra',
   beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
   mutation:env.mutation,reviewTicketConsumed:true
  });
  assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.match(await fs.readFile(path.join(env.appsDir,'lyra.conf'),'utf8'),/proxy_pass http:\/\/lyra-dev:4000;/);

  // Replay same ticket
  const replay=gate.consumeReviewTicket({
   sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
   beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
   reviewTicket:issued.ticket
  });
  assert.equal(replay.ok,false);
 }finally{await env.close();}
});

test('RED: cross-session ticket and hash mismatch never consume valid original',()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const gate=createOwnerHealReviewGate();
 const issued=gate.issueReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 });
 assert.equal(gate.consumeReviewTicket({
  sessionBinding:SESSION2,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
  reviewTicket:issued.ticket
 }).ok,false);
 // Original still consumable by correct session
 assert.equal(gate.consumeReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
  reviewTicket:issued.ticket
 }).ok,true);
});

test('RED: missing reviewTicket field rejects before skill',()=>{
 const gate=createOwnerHealReviewGate();
 const r=gate.consumeReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:'a'.repeat(64),afterSha256:'b'.repeat(64)
 });
 assert.equal(r.ok,false);
 assert.equal(r.healingPerformed,false);
});

test('RED: logout revokeAll invalidates outstanding tickets',()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const gate=createOwnerHealReviewGate();
 const issued=gate.issueReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 });
 gate.revokeAll();
 assert.equal(gate.consumeReviewTicket({
  sessionBinding:SESSION,appName:'lyra.conf',route:'lyra',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
  reviewTicket:issued.ticket
 }).ok,false);
});
