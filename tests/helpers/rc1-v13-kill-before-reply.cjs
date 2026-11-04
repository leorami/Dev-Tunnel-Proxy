'use strict';
/** A short-lived, TEST-OWNED Node process. No network, Docker, or owner files. */
const fs=require('node:fs/promises');
const path=require('node:path');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest}=require('../../utils/rc1-content-bound-activation-request.cjs');
const {createTwoPhaseHostSettlement,createVerifiedApiSettlementAck}=require('../../utils/rc1-two-phase-host-settlement.cjs');
(async()=>{
 const [directory,approvedRoot,point]=process.argv.slice(2);
 if(!['after-prepared-unlink','after-inflight-unlink'].includes(point))process.exit(71);
 const secret=Buffer.from('a3'.repeat(32),'hex');
 const digest=(await createCandidateManifest({approvedRoot})).candidateSha256;
 const request=createSignedCandidateRequest({secret,expectedCandidateSha256:digest});
 const host=createTwoPhaseHostSettlement({directory,approvedRoot,secret,
  verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true});
 await host.begin({request});
 const prepared=await host.prepare({requestId:request.requestId});
 const ack=await createVerifiedApiSettlementAck({prepared,secret,approvedRoot});
 // Save signed host preparation under PRIVATE test root for the parent.
 await fs.writeFile(path.join(directory,'test-prepared.json'),JSON.stringify(prepared),{mode:0o600});
 const original=fs.unlink.bind(fs);
 fs.unlink=async(file,...args)=>{
  const value=await original(file,...args);
  if((point==='after-prepared-unlink'&&file.endsWith('host-settlement-prepared.json'))||
     (point==='after-inflight-unlink'&&file.endsWith('host-settlement-inflight.json'))){
    process.kill(process.pid,'SIGKILL');
  }
  return value;
 };
 await host.settle({ack});
 process.exit(72); // Should never reach: forced SIGKILL at chosen commit boundary.
})().catch(e=>{process.stderr.write(String(e));process.exit(73);});
