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
const {proposeRepair}=require('../../utils/calliope-first-safe-heal.cjs');
const {runOwnerNextjsRedirectHealSkill}=require('../../utils/calliope-owner-nextjs-heal-skill.cjs');
const {disposableBrokenLyraSource}=require('../../utils/calliope-nextjs-redirect-fixture.cjs');

async function rootWith(source){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv92-skill-')));
 await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','lease','lease/replay'])await fs.mkdir(path.join(root,d),{mode:0o700});
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

test('RED: unauthenticated owner skill cannot apply',async()=>{
 const r=await runOwnerNextjsRedirectHealSkill({authenticated:false});
 assert.equal(r.ok,false);assert.equal(r.httpStatus,401);assert.equal(r.healingPerformed,false);
});

test('RED: authenticated owner skill applies CAS repair without claiming live heal',async()=>{
 const source=disposableBrokenLyraSource();
 const proposed=proposeRepair({source,route:'lyra'});
 const fx=await rootWith(source);
 try{
  const r=await runOwnerNextjsRedirectHealSkill({
   authenticated:true,appsDir:fx.appsDir,appName:'lyra.conf',route:'lyra',
   beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,mutation:fx.mutation
  });
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.casEnforced,true);
  assert.equal(r.healingPerformed,false);
  assert.equal(r.liveAttested,false);
  assert.equal(r.lessonVerified,'PENDING_DISPOSABLE_BROWSER_PROOF');
  assert.match(await fs.readFile(path.join(fx.appsDir,'lyra.conf'),'utf8'),/proxy_pass http:\/\/lyra-dev:4000;/);
 }finally{await fx.close();}
});
