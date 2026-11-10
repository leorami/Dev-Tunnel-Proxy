#!/usr/bin/env node
'use strict';
/**
 * Explicit Mac-host process entrypoint for the existing v13 settlement source.
 * Requires a pre-provisioned owner-private 0600 pin and reviewed external GO.
 * The executable starts NO Docker container, never changes ngrok, accepts
 * only --scan-once or --serve, and never logs secrets, paths or route contents.
 *
 * --serve performs periodic bounded scans under one crash-durable singleton;
 * supervisor installation/restart is an independent operator action.
 * Stale singleton or replay -> manual review, NEVER auto-clean or retry.
 */
const path=require('node:path');
const {loadVerifiedHostWorkerPin}=require('../utils/rc2-private-host-worker-pin.cjs');
const {createExclusiveHostWorkerService}=require('../utils/rc2-exclusive-host-worker-service.cjs');
const {createPendingOnlyHostWorker}=require('../utils/rc2-pending-host-worker.cjs');
function invalid(){throw Error('INVALID_HOST_WORKER_INVOCATION');}
async function runExplicitHostWorker({mode,pinPath,signal,deps={}}={}){
 if(!['serve','scan-once'].includes(mode)||typeof pinPath!=='string'||
   !path.isAbsolute(pinPath)||path.normalize(pinPath)!==pinPath||
   pinPath==='/'||pinPath.endsWith('/')||pinPath.includes('\0')||
   (mode==='serve'&&(!signal||typeof signal.aborted!=='boolean'||
     typeof signal.addEventListener!=='function')))invalid();
 const loadPin=deps.loadPin||loadVerifiedHostWorkerPin;
 const makeWorker=deps.makeWorker||
  (pin=>require('../utils/rc2-mac-host-worker.cjs').createMacHostSettlementWorkerFromPin(pin));
 const provision=deps.provision||
  (input=>require('../utils/rc2-cross-process-settlement.cjs').provisionSettlementSpool(input));
 const makeQueue=deps.makeQueue||createPendingOnlyHostWorker;
 const pin=loadPin(pinPath);
 await provision({directory:pin.spoolDirectory});
 const original=makeWorker(pin);
 const queue=makeQueue({spoolDirectory:pin.spoolDirectory,leaseDirectory:pin.leaseDirectory,worker:original});
 const service=createExclusiveHostWorkerService({leaseDirectory:pin.leaseDirectory,worker:queue,pollMs:250});
 return mode==='scan-once'?await service.runOnce():await service.runUntilStopped({signal});
}
module.exports={runExplicitHostWorker};
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==2||!['--serve','--scan-once'].includes(args[0])){
  process.stderr.write('INVALID_HOST_WORKER_INVOCATION\n');process.exitCode=2;
 }else{
  const abort=new AbortController();
  const handler=()=>abort.abort();
  process.once('SIGINT',handler);process.once('SIGTERM',handler);
  runExplicitHostWorker({mode:args[0].slice(2),pinPath:args[1],signal:abort.signal})
   .then(r=>{process.stdout.write(JSON.stringify(r)+'\n')})
   .catch(e=>{process.stderr.write(String(e?.message||'HOST_WORKER_FAILED')+'\n');process.exitCode=2})
   .finally(()=>{process.removeListener('SIGINT',handler);process.removeListener('SIGTERM',handler)});
 }
}
