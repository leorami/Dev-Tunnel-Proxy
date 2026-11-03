'use strict';
/**
 * Source-level contract for a HOST-ONLY fixed nginx command runner.
 * Caller injects a trusted execFile-style function; never an API user command.
 * It does not itself connect to Docker or authorize a live operation.
 */
const path=require('node:path');
const FMT='{{.Id}} {{.Image}} {{.State.Running}}';
const TARGET='dev-proxy';
const INSPECT=['inspect','--format',FMT,TARGET];
function same(x,y){return Array.isArray(x)&&x.length===y.length&&x.every((a,i)=>a===y[i]);}
function createFixedNginxDockerDriver({dockerBinary,expectedContainerId,expectedImage,call}={}) {
  if(typeof dockerBinary!=='string' || !path.posix.isAbsolute(dockerBinary) ||
     path.posix.normalize(dockerBinary)!==dockerBinary || dockerBinary.endsWith('/') ||
     !/^[0-9a-f]{64}$/.test(expectedContainerId||'') || !/^sha256:[0-9a-f]{64}$/.test(expectedImage||'') ||
     typeof call!=='function') throw Error('INVALID_APPROVED_HOST_DRIVER_CONFIG');
  const VALIDATE=['exec',expectedContainerId,'nginx','-t'];
  const RELOAD=['exec',expectedContainerId,'nginx','-s','reload'];
  const OPTIONS=Object.freeze({shell:false,timeout:7000,maxBuffer:4096,windowsHide:true});
  function processSucceeded(output) {
    if(!output || typeof output!=='object' || Array.isArray(output)) return false;
    for(const name of ['status','code','exitCode']) {
      if(Object.hasOwn(output,name) && output[name]!==0) return false;
    }
    return true;
  }
  async function attest(signal) {
    try {
      const output=await call(dockerBinary,[...INSPECT],{...OPTIONS,signal});
      if(!processSucceeded(output) || typeof output.stdout!=='string' || output.stdout.length>200) return false;
      const matched=output.stdout.match(/^([0-9a-f]{64}) (sha256:[0-9a-f]{64}) (true|false)\n?$/);
      return !!matched && matched[1]===expectedContainerId && matched[2]===expectedImage && matched[3]==='true';
    } catch {return false;}
  }
  async function execute(tool,args,signal) {
    if(tool!=='docker'||(!same(args,VALIDATE)&&!same(args,RELOAD)))return 1;
    try {
      const outcome=await call(dockerBinary,[...args],{...OPTIONS,signal});
      return processSucceeded(outcome)?0:1;
    } catch {return 1;}
  }
  return Object.freeze({attest,execute});
}
module.exports={createFixedNginxDockerDriver};
