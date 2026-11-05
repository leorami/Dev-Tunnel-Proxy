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
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv92-heal-')));
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
  root,mutation,generateBundle,
  readApp:name=>fs.readFile(path.join(root,'apps',name),'utf8'),
  writeApp:(name,body)=>fs.writeFile(path.join(root,'apps',name),body),
  bundlePath:path.join(root,'build/sites-enabled/apps.generated.conf'),
  close:()=>fs.rm(root,{recursive:true,force:true})
 };
}

function sampleBrowserPair(route='lyra'){
 const asset=`/${route}/_next/static/chunks/webpack.js`;
 const alt=`/${route}/_next/static/chunks/webpack-alt.js`;
 return {
  before:{
   captureId:'a'.repeat(32),assetPath:asset,browserError:'ERR_TOO_MANY_REDIRECTS',consoleErrors:[],
   responses:[
    {path:asset,status:308,location:alt,contentType:null},
    {path:alt,status:308,location:asset,contentType:null},
    {path:asset,status:308,location:alt,contentType:null},
    {path:alt,status:308,location:asset,contentType:null}
   ]
  },
  after:{
   captureId:'b'.repeat(32),assetPath:asset,browserError:null,consoleErrors:[],
   responses:[{path:asset,status:200,location:null,contentType:'application/javascript; charset=utf-8'}]
  }
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

test('RED: observe -> propose -> approve -> CAS editApp+HMAC apply; synthetic verify is not heal',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 assert.equal(proposed.status,HEAL_STATUS.PROPOSED);
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 const fx=await disposableMutationRoot({'lyra.conf':source});
 try{
  const applied=await applyApprovedRepair(approved,{
   mutation:fx.mutation,readCurrentSource:()=>fx.readApp('lyra.conf')
  });
  assert.equal(applied.status,HEAL_STATUS.APPLIED,JSON.stringify(applied));
  assert.equal(applied.casEnforced,true);
  assert.equal(await fx.readApp('lyra.conf'),proposed.candidateConfig);

  const synth=await verifyAppliedRepair(applied,{evidence:{evidenceClass:'SYNTHETIC_UNIT'}});
  assert.equal(synth.status,HEAL_STATUS.UNIT_SYNTHETIC_ONLY);
  assert.equal(synth.healingPerformed,false);
  assert.equal(synth.liveAttested,false);

  const pair=sampleBrowserPair();
  const verified=await verifyAppliedRepair(applied,{evidence:{
   evidenceClass:'DISPOSABLE_REAL_BROWSER',
   nginxSyntaxTest:{ok:true,exitCode:0,engine:'nginx-t-disposable'},
   browserBefore:pair.before,browserAfter:pair.after,unrelatedRoutesIntact:true
  }});
  assert.equal(verified.status,HEAL_STATUS.VERIFIED);
  assert.equal(verified.healingPerformed,true);
  assert.equal(verified.liveAttested,false);
 }finally{await fx.close();}
});

test('RED: CAS race — intervening writer after approved read, before lock, yields 409 and no overwrite',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route:'lyra',appName:'lyra.conf',
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256
 }});
 const fx=await disposableMutationRoot({'lyra.conf':source});
 try{
  const bundleBefore=await fs.readFile(fx.bundlePath);
  const drifted=source+'\n# intervening-writer\n';
  let hmacCalls=0;
  const wrapped={
   editApp:async(name,content,opts)=>{
    // Intervening writer AFTER caller readCurrentSource succeeded, BEFORE mutation lock/CAS.
    await fx.writeApp('lyra.conf',drifted);
    hmacCalls+=1;
    return fx.mutation.editApp(name,content,opts);
   }
  };
  const r=await applyApprovedRepair(approved,{
   mutation:wrapped,readCurrentSource:()=>fx.readApp('lyra.conf')
  });
  assert.equal(r.status,HEAL_STATUS.FAILED);
  assert.equal(r.code,'CAS_STALE_APPROVED_PREIMAGE');
  assert.equal(r.httpStatus,409);
  assert.equal(await fx.readApp('lyra.conf'),drifted);
  assert.deepEqual(await fs.readFile(fx.bundlePath),bundleBefore);
  // editApp was invoked once; inner CAS rejected before journal/HMAC success path.
  assert.equal(hmacCalls,1);
  assert.equal(r.healingPerformed,false);
 }finally{await fx.close();}
});

test('RED: legacy editApp(name,content) without CAS option still works',async()=>{
 const fx=await disposableMutationRoot({'lyra.conf':'location /lyra/ { return 200; }\n'});
 try{
  const r=await fx.mutation.editApp('lyra.conf','location /lyra/ { return 201; }\n');
  assert.equal(r.httpStatus,200);
  assert.match(await fx.readApp('lyra.conf'),/201/);
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
 }finally{await fx.close();}
});

test('RED: unmatched / healthy / unsafe targets never claim healed',async()=>{
 assert.equal(observeRedirectLoop({
  source:'location /lyra/ { proxy_pass http://lyra-dev:4000; }\n',route:'lyra'
 }).status,HEAL_STATUS.NOT_AVAILABLE);
 const fixed=proposeRepair({source:disposableBrokenLyraSource(),route:'lyra'}).candidateConfig;
 assert.equal(proposeRepair({source:fixed,route:'lyra'}).status,HEAL_STATUS.NOT_AVAILABLE);
 const premature=await verifyAppliedRepair({status:HEAL_STATUS.PROPOSED},{
  evidence:{evidenceClass:'SYNTHETIC_UNIT'}
 });
 assert.equal(premature.status,HEAL_STATUS.FAILED);
 assert.equal(premature.healingPerformed,false);
});

test('RED: client-provided boolean verify callback cannot set healing',async()=>{
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
  const legacy=await verifyAppliedRepair(applied,{
   verify:async()=>({ok:true,nginxSyntaxOk:true,assetStatus:200,redirectLoop:false,unrelatedRoutesIntact:true})
  });
  assert.equal(legacy.status,HEAL_STATUS.FAILED);
  assert.equal(legacy.code,'EVIDENCE_REQUIRED');
  assert.equal(legacy.healingPerformed,false);
  assert.equal(legacy.liveAttested,false);
 }finally{await fx.close();}
});

test('RED: missing ability is an explicit NEW_ABILITY_REQUESTED, not runnable heal',()=>{
 const r=requestNewAbility('nginx.x_forwarded_proto.propose');
 assert.equal(r.status,HEAL_STATUS.NEW_ABILITY_REQUESTED);
 assert.equal(r.runnable,false);
 assert.equal(r.healingPerformed,false);
});
