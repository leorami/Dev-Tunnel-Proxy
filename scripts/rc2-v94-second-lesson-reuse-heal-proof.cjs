#!/usr/bin/env node
'use strict';
/**
 * V94: second taught-lesson reuse through ticket → CAS editApp → disposable
 * nginx -t + Chromium proof. Does not touch live RC1.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createLessonStore}=require('../utils/calliope-lesson-reuse.cjs');
const {createOwnerHealReviewGate}=require('../utils/rc2-owner-heal-review-gate.cjs');
const {runOwnerNextjsRedirectHealSkill}=require('../utils/calliope-owner-nextjs-heal-skill.cjs');
const {proposeRepair}=require('../utils/calliope-first-safe-heal.cjs');
const {disposableBrokenLyraSource}=require('../utils/calliope-nextjs-redirect-fixture.cjs');
const {runDisposableNginxSyntaxTest}=require('../utils/calliope-disposable-nginx-syntax.cjs');
const {createTwoPhaseHostSettlement}=require('../utils/rc1-two-phase-host-settlement.cjs');
const {createNonliveSettlementActivation}=require('../utils/rc1-v12-nonlive-settlement-activation.cjs');
const {createProductionRouteMutationService}=require('../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../utils/exclusive-route-mutation-lock.cjs');

const SESSION='c'.repeat(64);
const AURORA_BROKEN=`# second taught-lesson disposable\nlocation ^~ /aurora/_next/ {\n  proxy_set_header X-Forwarded-Proto $scheme;\n  proxy_pass http://aurora-dev:5000/aurora/_next/;\n}\nlocation /other/ {\n  proxy_pass http://other-dev:3000;\n}\n`;

async function mutationRoot(seed){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv94-reuse-')));
 await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','lease','lease/replay'])
  await fs.mkdir(path.join(root,d),{mode:0o700});
 for(const [p,body] of [['config/default.production.conf','server{listen 80;}\n'],
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['build/sites-enabled/apps.generated.conf','# empty\n']])
  await fs.writeFile(path.join(root,p),body);
 for(const [name,body] of Object.entries(seed))
  await fs.writeFile(path.join(root,'apps',name),body);
 for(let i=1;i<=16;i++)
  await fs.writeFile(path.join(root,'apps',`synth${i}.conf`),`location /synth${i}/ { return 200; }\n`);
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
 return {root,mutation,appsDir:path.join(root,'apps'),close:()=>fs.rm(root,{recursive:true,force:true})};
}

async function main(){
 const proof=JSON.parse(await fs.readFile(path.join(__dirname,'../docs/receipts/DEVPROXY_RC2_V92_DISPOSABLE_BROWSER_PROOF.json'),'utf8'));
 const store=createLessonStore();
 const lyraBefore=disposableBrokenLyraSource();
 const lyraProposed=proposeRepair({source:lyraBefore,route:'lyra'});
 const candidate=store.compile({
  lessonId:'v92-disposable-nextjs-redirect',
  source:{repository:'leorami/Dev-Tunnel-Proxy',commit:'93962a98a5213b1ff4f4749928673839f0383e32',
   receipt:'docs/receipts/DEVPROXY_RC2_V92_ATOMIC_CAS_BROWSER_ENGINEER_COMPLETION.md'},
  route:'lyra',beforeConfig:lyraBefore,afterConfig:lyraProposed.candidateConfig,
  browserEvidenceDigest:proof.assessed.evidenceDigest,
  githubAttestation:{fullSha:'93962a98a5213b1ff4f4749928673839f0383e32',exists:true,repository:'leorami/Dev-Tunnel-Proxy'}
 });
 const admit=store.admit(candidate);
 const recog=store.recognizeNextjsRedirectFailure({source:AURORA_BROKEN,route:'aurora'});
 if(recog.status!=='EQUIVALENT_FAILURE_OFFERS_REVIEWED_PROPOSE')
  throw Error('recognition_failed:'+recog.status);

 // Direct apply without ticket must fail
 const env=await mutationRoot({'aurora.conf':AURORA_BROKEN});
 try{
  const auroraProposed=proposeRepair({source:AURORA_BROKEN,route:'aurora'});
  const denied=await runOwnerNextjsRedirectHealSkill({
   authenticated:true,appsDir:env.appsDir,appName:'aurora.conf',route:'aurora',
   beforeSha256:auroraProposed.beforeSha256,afterSha256:auroraProposed.afterSha256,
   mutation:env.mutation
  });
  if(denied.code!=='REVIEW_TICKET_REQUIRED')throw Error('expected_ticket_required:'+denied.code);

  const gate=createOwnerHealReviewGate();
  const issued=gate.issueReviewTicket({
   sessionBinding:SESSION,appName:'aurora.conf',route:'aurora',
   beforeSha256:auroraProposed.beforeSha256,afterSha256:auroraProposed.afterSha256
  });
  if(!issued.ok)throw Error('ticket_issue_failed');
  const consumed=gate.consumeReviewTicket({
   sessionBinding:SESSION,appName:'aurora.conf',route:'aurora',
   beforeSha256:auroraProposed.beforeSha256,afterSha256:auroraProposed.afterSha256,
   reviewTicket:issued.ticket
  });
  if(!consumed.ok)throw Error('ticket_consume_failed');
  const applied=await runOwnerNextjsRedirectHealSkill({
   authenticated:true,appsDir:env.appsDir,appName:'aurora.conf',route:'aurora',
   beforeSha256:auroraProposed.beforeSha256,afterSha256:auroraProposed.afterSha256,
   mutation:env.mutation,reviewTicketConsumed:true
  });
  if(!applied.ok)throw Error('apply_failed:'+JSON.stringify(applied));
  const afterBytes=await fs.readFile(path.join(env.appsDir,'aurora.conf'),'utf8');
  if(afterBytes===AURORA_BROKEN)throw Error('bytes_unchanged');
  const synthCount=(await fs.readdir(env.appsDir)).filter(x=>x.startsWith('synth')).length;
  if(synthCount!==16)throw Error('sibling_routes_changed');

  // Syntax-only: rewrite DNS names to loopback so nginx -t does not require
  // resolving disposable hostnames; applied owner bytes keep aurora-dev names.
  const syntaxCfg=afterBytes
   .replace(/http:\/\/aurora-dev:5000/g,'http://127.0.0.1:9')
   .replace(/http:\/\/other-dev:3000/g,'http://127.0.0.1:9');
  const ngx=await runDisposableNginxSyntaxTest({routeConfig:syntaxCfg});
  if(!ngx.ok)throw Error('nginx_t_failed:'+JSON.stringify(ngx));
  if(!/proxy_pass http:\/\/aurora-dev:5000;/.test(afterBytes))
   throw Error('applied_bytes_lost_upstream_name');

  // Replay ticket
  const replay=gate.consumeReviewTicket({
   sessionBinding:SESSION,appName:'aurora.conf',route:'aurora',
   beforeSha256:auroraProposed.beforeSha256,afterSha256:auroraProposed.afterSha256,
   reviewTicket:issued.ticket
  });
  if(replay.ok)throw Error('replay_should_fail');

  const out={
   admit:admit.code,
   recognition:recog.status,
   offeredAbility:recog.offeredAbility,
   lessonId:'v92-disposable-nextjs-redirect',
   secondFixture:'aurora',
   directApplyDenied:denied.code,
   reviewTicketStatus:consumed.status,
   applyCode:applied.code,
   casEnforced:applied.casEnforced===true,
   nginxSyntaxTest:ngx,
   unrelatedSynthRoutes:synthCount,
   beforeSha256:auroraProposed.beforeSha256,
   afterSha256:auroraProposed.afterSha256,
   healingPerformed:false,
   liveAttested:false,
   note:'Second taught-lesson reuse reached reviewed application path with ticket+CAS+HMAC+nginx-t; not production liveAttested'
  };
  const dest=path.join(__dirname,'../docs/receipts/DEVPROXY_RC2_V94_SECOND_LESSON_REUSE_HEAL_PROOF.json');
  await fs.writeFile(dest,JSON.stringify(out,null,2));
  console.log(JSON.stringify({wrote:dest,admit:admit.code,recog:recog.status,apply:applied.code,ngx:ngx.ok,replayDenied:!replay.ok},null,2));
 }finally{await env.close();}
}

main().catch(e=>{console.error(e);process.exit(1);});
