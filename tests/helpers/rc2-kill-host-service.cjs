'use strict';
const {createExclusiveHostWorkerService}=require('../../utils/rc2-exclusive-host-worker-service.cjs');
const root=process.argv[2];
createExclusiveHostWorkerService({leaseDirectory:root,worker:{scanOnce:async()=>{process.kill(process.pid,'SIGKILL');await new Promise(()=>{});}}}).runOnce().then(()=>process.exit(71)).catch(()=>process.exit(72));
