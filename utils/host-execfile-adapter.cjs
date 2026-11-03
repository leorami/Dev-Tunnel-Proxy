'use strict';
/**
 * Host-side Docker Desktop adapter. Fixed object IDs and command vectors ONLY.
 * Operator must provision and review approved full IDs in the private host
 * process. This does not install a service or authorize any live action.
 */
const {execFile}=require('node:child_process');
const ALLOWED_BINARIES=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const FMT='{{.Id}} {{.Image}} {{.State.Running}}';
function createHostDockerAdapter({dockerBinary,approvedContainerId,approvedImage,execFileImpl=execFile,home=process.env.HOME}={}){
 if(!ALLOWED_BINARIES.has(dockerBinary)|| !/^[0-9a-f]{64}$/.test(approvedContainerId||'') ||
    !/^sha256:[a-f0-9]{64}$/.test(approvedImage||'')||typeof execFileImpl!=='function'||
    typeof home!=='string'||!home.startsWith('/'))throw Error('INVALID_APPROVED_HOST_DOCKER_CONFIG');
 const opts={shell:false,timeout:7000,maxBuffer:4096,windowsHide:true,
   env:{HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'}};
 async function run(args,signal){
  if(signal?.aborted)return {ok:false,stdout:''};
  return await new Promise(resolve=>{
   let done=false;
   const finish=(ok,out)=>{if(done)return;done=true;resolve({ok,stdout:typeof out==='string'&&out.length<=4096?out:''});};
   try{
    execFileImpl(dockerBinary,args,{...opts,signal},(error,stdout)=>finish(!error,stdout));
   }catch{finish(false,'');}
  });
 }
 async function attest(signal){
  const {ok,stdout}=await run(['inspect','--format',FMT,approvedContainerId],signal);
  if(!ok||stdout.length>200)return false;
  const m=stdout.match(/^([a-f0-9]{64}) (sha256:[a-f0-9]{64}) (true|false)\n?$/);
  return !!m&&m[1]===approvedContainerId&&m[2]===approvedImage&&m[3]==='true';
 }
 async function execute(action,signal){
  const commands={
   'nginx-test':['exec',approvedContainerId,'nginx','-t'],
   'nginx-reload':['exec',approvedContainerId,'nginx','-s','reload']
  };
  if(!Object.hasOwn(commands,action))return 1;
  const {ok}=await run(commands[action],signal);
  return ok?0:1;
 }
 return Object.freeze({attest,execute});
}
module.exports={createHostDockerAdapter};
