'use strict';
/** Real source-shaped nginx file graph + actual execFile-shaped adapter, with
 * injected fake Docker process. No Docker invocation or owner filesystem read. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createMountLockedHostDockerDriver}=require('../../utils/rc1-host-mount-locked-docker-driver.cjs');
const {createClosureGatedHostDriver}=require('../../utils/rc1-closure-gated-host-driver.cjs');
const {createReadOnlyHostViewFromLoadedFiles}=require('../../utils/rc1-loaded-nginx-file-identity.cjs');
const CID='c'.repeat(64),IMAGE='sha256:'+'d'.repeat(64);
const EXPECTED=[
 {destination:'/etc/nginx/nginx.conf',source:'/private/dp-test/nginx.conf',readOnly:true},
 {destination:'/etc/nginx/conf.d/default.conf',source:'/private/dp-test/default.conf',readOnly:true},
 {destination:'/etc/nginx/conf.d/sites-enabled',source:'/private/dp-test/sites',readOnly:true}
];
async function setup(){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'dp11-host-'));
 const approvedRoot=path.join(base,'approved'),runtimeRoot=path.join(base,'runtime');
 for(const d of [approvedRoot,runtimeRoot,path.join(approvedRoot,'config'),
   path.join(approvedRoot,'build/sites-enabled'),path.join(runtimeRoot,'etc/nginx/conf.d/sites-enabled')])
  await fs.mkdir(d,{recursive:true,mode:0o700});
 const files={
  'config/nginx.production.conf':'events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n',
  'config/default.production.conf':'server { listen 80; include /etc/nginx/conf.d/sites-enabled/*.conf; }\n',
  'build/sites-enabled/apps.generated.conf':'location /safe/ { return 200; }\n'
 };
 const mapping={'config/nginx.production.conf':'etc/nginx/nginx.conf',
  'config/default.production.conf':'etc/nginx/conf.d/default.conf',
  'build/sites-enabled/apps.generated.conf':'etc/nginx/conf.d/sites-enabled/apps.generated.conf'};
 for(const [name,text]of Object.entries(files)){
  await fs.writeFile(path.join(approvedRoot,name),text,{mode:0o600});
  await fs.writeFile(path.join(runtimeRoot,mapping[name]),text,{mode:0o600});
 }
 const history=[],mounts=EXPECTED.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly}));
 let privilege=false,actualMounts=mounts;
 const execFileImpl=(binary,args,opts,cb)=>{
  history.push([...args]);
  const text=args[2]==='{{.Id}} {{.Image}} {{.State.Running}}'?`${CID} ${IMAGE} true\n`:
    args[2]==='{{json .HostConfig.Privileged}}'?JSON.stringify(privilege)+'\n':
    args[2]==='{{json .Mounts}}'?JSON.stringify(actualMounts)+'\n':'';
  queueMicrotask(()=>cb(null,text,''));
 };
 const driver=createMountLockedHostDockerDriver({dockerBinary:'/usr/local/bin/docker',
   approvedContainerId:CID,approvedImage:IMAGE,expectedMounts:EXPECTED,
   authorizeFixedHostAction:async()=>true,execFileImpl});
 const hostView=createReadOnlyHostViewFromLoadedFiles({approvedRoot,runtimeRoot});
 const gate=createClosureGatedHostDriver({approvedRoot,driver,hostView,
  verifyActiveRoute:async()=>true});
 return {approvedRoot,runtimeRoot,history,gate,setPrivileged:v=>{privilege=v;},
  setMounts:v=>{actualMounts=v;},clearHistory:()=>{history.length=0;},
  cleanup:()=>fs.rm(base,{recursive:true,force:true})};
}
function executes(f){return f.history.filter(x=>x[0]==='exec');}
test('real loaded-file equality + effective closure + exact mounts require all gates before nginx-test',async()=>{
 const f=await setup();try{
  assert.equal(await f.gate.driver.attest(),true);
  assert.equal(await f.gate.driver.execute('nginx-test'),0);
  assert.deepEqual(executes(f),[['exec',CID,'nginx','-t']]);
  assert.equal(f.gate.actualHostAttested,false);
  assert.equal(f.gate.productionChangeAuthorized,false);
 }finally{await f.cleanup();}
});
test('mismatched Docker image-mount privilege denies fixed action while loaded files match',async()=>{
 const f=await setup();try{
  f.setPrivileged(true);
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.deepEqual(executes(f),[]);
 }finally{await f.cleanup();}
});
test('extra image-root nginx glob config blocks before any host process call',async()=>{
 const f=await setup();try{
  await fs.writeFile(path.join(f.runtimeRoot,'etc/nginx/conf.d/extra.conf'),'server{}\n');
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.equal(f.history.length,0);
 }finally{await f.cleanup();}
});
test('runtime nginx source tamper blocks and does not run Docker',async()=>{
 const f=await setup();try{
  await fs.appendFile(path.join(f.runtimeRoot,'etc/nginx/conf.d/default.conf'),'# touched\n');
  assert.equal(await f.gate.driver.execute('nginx-test'),1);
  assert.equal(f.history.length,0);
 }finally{await f.cleanup();}
});
test('extra unexpected read-only mount blocks even with matching config bytes',async()=>{
 const f=await setup();try{
  f.setMounts([...EXPECTED.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly})),
    {Type:'bind',Source:'/private/tmp/other',Destination:'/tmp/unexpected',RW:false}]);
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.equal(executes(f).length,0);
 }finally{await f.cleanup();}
});
test('extra include in approved default nginx file blocks before inspecting container',async()=>{
 const f=await setup();try{
  await fs.appendFile(path.join(f.approvedRoot,'config/default.production.conf'),'include /tmp/unknown.conf;\n');
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.equal(f.history.length,0);
 }finally{await f.cleanup();}
});
test('abort before any work cannot cause late host execution',async()=>{
 const f=await setup();try{
  const c=new AbortController();c.abort();
  assert.equal(await f.gate.driver.execute('nginx-reload',c.signal),1);
  assert.equal(f.history.length,0);
 }finally{await f.cleanup();}
});
