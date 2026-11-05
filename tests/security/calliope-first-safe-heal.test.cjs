'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createTwoPhaseHostSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const {createNonliveSettlementActivation}=require('../../utils/rc1-v12-nonlive-settlement-activation.cjs');
const {createProductionRouteMutationService}=require('../../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../../utils/exclusive-route-mutation-lock.cjs');
const {
 HEAL_STATUS,observeRedirectLoop,proposeRepair,approveProposedRepair,
 applyApprovedRepair,verifyAppliedRepair,requestNewAbility
}=require('../../utils/calliope-first-safe-heal.cjs');
const {
 disposableBrokenLyraSource,classifyNextjsUpstream,createSyntheticNextjsProbe
}=require('../../utils/calliope-nextjs-redirect-fixture.cjs');

async function disposableMutationRoot(seedApps={}){
 // macOS tmp is often /var/folders -> /private/var/folders; mutation requires canonical roots.
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv91-heal-')));
 await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','lease','lease/replay'])
  await fs.mkdir(path.join(root,d),{mode:0o700});
 for(const [p,body] of [['config/default.production.conf','server{listen 80;}\n'],
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['build/sites-enabled/apps.generated.conf','# empty\n']])
  await fs.writeFile(path.join(root,p),body);
 for(let i=1;i<=16;i++)
  await fs.writeFile(path.join(root,'apps',`synth${i}.conf`),`location /synth${i}/ { return 200; }\n`);
 for(const [name,body] of Object.entries(seedApps))
  await fs.writeFile(path.join(root,'apps',name),body);
 const generateBundle=async()=>{
  const list=(await fs.readdir(path.join(root,'apps'))).filter(x=>x.endsWith('.conf')).sort();
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),
   '# apps\n'+(await Promise.all(list.map(x=>fs.readFile(path.join(root,'apps',x),'utf8')))).join('\n'));
  await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),JSON.stringify({count:list.length}));
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
 return {
  root,mutation,
  readApp:name=>fs.readFile(path.join(root,'apps',name),'utf8'),
  close:()=>fs.rm(root,{recursive:true,force:true})
 };
}

test('RED: disposable known-bad fixture shows broken redirect loop and intact unrelated route',async()=>{
 const source=disposableBrokenLyraSource();
 assert.equal(classifyNextjsUpstream({source,route:'lyra'}).state,'BROKEN_UPSTREAM_PREFIX');
 const probe=createSyntheticNextjsProbe({source,route:'lyra'});
 const port=await probe.listen();
 try{
  const before=await probe.probe(port);
  assert.equal(before.redirectLoop,true);
  assert.notEqual(before.assetStatus,200);
  assert.equal(before.unrelatedRoutesIntact,true);
 }finally{await probe.close();}
});

test('RED: observe -> propose -> approve -> editApp+HMAC apply -> verify heals only with VERIFIED',async()=>{
 const source=disposableBrokenLyraSource();
 const observed=observeRedirectLoop({source,route:'lyra'});
 assert.equal(observed.status,HEAL_STATUS.OBSERVED);
 assert.equal(observed.healingPerformed,false);

 const proposed=proposeRepair({source,route:'lyra'});
 assert.equal(proposed.status,HEAL_STATUS.PROPOSED);
 assert.equal(proposed.executionAuthorized,false);
 assert.match(proposed.candidateConfig,/proxy_pass http:\/\/lyra-dev:4000;/);
 assert.doesNotMatch(proposed.candidateConfig,/proxy_pass http:\/\/lyra-dev:4000\/lyra\/_next\//);
 assert.match(proposed.candidateConfig,/location \/other\/ \{[\s\S]*proxy_pass http:\/\/other-dev:3000;/);

 const rejected=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:'0'.repeat(64)
 }});
 assert.equal(rejected.status,HEAL_STATUS.FAILED);
 assert.equal(rejected.code,'OWNER_APPROVAL_REJECTED');

 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 assert.equal(approved.status,HEAL_STATUS.OWNER_APPROVED);
 assert.equal(approved.ownerApprovalGranted,true);
 assert.equal(approved.healingPerformed,false);

 const fx=await disposableMutationRoot({'lyra.conf':source});
 try{
  const applied=await applyApprovedRepair(approved,{
   mutation:fx.mutation,readCurrentSource:()=>fx.readApp('lyra.conf')
  });
  assert.equal(applied.status,HEAL_STATUS.APPLIED,JSON.stringify(applied));
  assert.equal(applied.healingPerformed,false);
  const afterBytes=await fx.readApp('lyra.conf');
  assert.equal(afterBytes,proposed.candidateConfig);
  assert.equal(classifyNextjsUpstream({source:afterBytes,route:'lyra'}).state,'FIXED_BARE_UPSTREAM');
  assert.equal((await fs.readdir(path.join(fx.root,'apps'))).filter(x=>x.startsWith('synth')).length,16);

  const probe=createSyntheticNextjsProbe({source:afterBytes,route:'lyra'});
  const port=await probe.listen();
  let browser;
  try{browser=await probe.probe(port);}finally{await probe.close();}
  assert.equal(browser.redirectLoop,false);
  assert.equal(browser.assetStatus,200);
  assert.equal(browser.unrelatedRoutesIntact,true);

  const verified=await verifyAppliedRepair(applied,{verify:async()=>({
   ok:true,nginxSyntaxOk:true,assetStatus:browser.assetStatus,
   redirectLoop:browser.redirectLoop,unrelatedRoutesIntact:browser.unrelatedRoutesIntact
  })});
  assert.equal(verified.status,HEAL_STATUS.VERIFIED);
  assert.equal(verified.healingPerformed,true);
 }finally{await fx.close();}
});

test('RED: TOCTOU rejects stale before SHA before any editApp write',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 const fx=await disposableMutationRoot({'lyra.conf':source+'\n# drifted\n'});
 try{
  let edits=0;
  const mutation={editApp:async(...a)=>{edits+=1;return fx.mutation.editApp(...a);}};
  const r=await applyApprovedRepair(approved,{
   mutation,readCurrentSource:()=>fx.readApp('lyra.conf')
  });
  assert.equal(r.status,HEAL_STATUS.FAILED);
  assert.equal(r.code,'TOCTOU_BEFORE_SHA_MISMATCH');
  assert.equal(edits,0);
  assert.equal(await fx.readApp('lyra.conf'),source+'\n# drifted\n');
 }finally{await fx.close();}
});

test('RED: unmatched / healthy / unsafe targets never claim healed',async()=>{
 assert.equal(observeRedirectLoop({
  source:'location /lyra/ { proxy_pass http://lyra-dev:4000; }\n',route:'lyra'
 }).status,HEAL_STATUS.NOT_AVAILABLE);
 const fixed=proposeRepair({source:disposableBrokenLyraSource(),route:'lyra'}).candidateConfig;
 assert.equal(proposeRepair({source:fixed,route:'lyra'}).status,HEAL_STATUS.NOT_AVAILABLE);
 assert.equal(proposeRepair({source:disposableBrokenLyraSource(),route:'../x'}).status,HEAL_STATUS.FAILED);
 const premature=await verifyAppliedRepair({status:HEAL_STATUS.PROPOSED},{
  verify:async()=>({ok:true,nginxSyntaxOk:true,assetStatus:200,redirectLoop:false,unrelatedRoutesIntact:true})
 });
 assert.equal(premature.status,HEAL_STATUS.FAILED);
 assert.equal(premature.code,'APPLY_REQUIRED');
 assert.equal(premature.healingPerformed,false);
});

test('RED: verification failure keeps healingPerformed false after apply',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 const fx=await disposableMutationRoot({'lyra.conf':source});
 try{
  const applied=await applyApprovedRepair(approved,{
   mutation:fx.mutation,readCurrentSource:()=>fx.readApp('lyra.conf')
  });
  assert.equal(applied.status,HEAL_STATUS.APPLIED);
  const failed=await verifyAppliedRepair(applied,{verify:async()=>({
   ok:false,nginxSyntaxOk:true,assetStatus:308,redirectLoop:true,unrelatedRoutesIntact:true
  })});
  assert.equal(failed.status,HEAL_STATUS.FAILED);
  assert.equal(failed.healingPerformed,false);
 }finally{await fx.close();}
});

test('RED: missing ability is an explicit NEW_ABILITY_REQUESTED, not runnable heal',()=>{
 const r=requestNewAbility('nginx.x_forwarded_proto.propose');
 assert.equal(r.status,HEAL_STATUS.NEW_ABILITY_REQUESTED);
 assert.equal(r.runnable,false);
 assert.equal(r.healingPerformed,false);
 assert.equal(r.executionAuthorized,false);
});

test('RED: apply without owner approval or mutation seam fails closed',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 assert.equal((await applyApprovedRepair(proposed,{
  mutation:{editApp:async()=>({ok:true,httpStatus:200})},readCurrentSource:async()=>source
 })).code,'OWNER_APPROVAL_REQUIRED');
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 assert.equal((await applyApprovedRepair(approved,{})).code,'MUTATION_SEAM_REQUIRED');
});
