'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createMountLockedHostDockerDriver}=require('../../utils/rc1-host-mount-locked-docker-driver.cjs');
const CID='a'.repeat(64),IMG='sha256:'+'b'.repeat(64);
const BIN='/opt/homebrew/bin/docker';
const MOUNTS=Object.freeze([
 Object.freeze({destination:'/etc/nginx/nginx.conf',source:'/private/rc1/nginx.production.conf',readOnly:true}),
 Object.freeze({destination:'/etc/nginx/conf.d/default.conf',source:'/private/rc1/default.production.conf',readOnly:true}),
 Object.freeze({destination:'/etc/nginx/conf.d/sites-enabled',source:'/private/rc1/sites-enabled',readOnly:true}),
 Object.freeze({destination:'/usr/share/nginx/html/.artifacts',source:'/private/rc1/.artifacts',readOnly:false})
]);
const INSPECT_FMT='{{.Id}} {{.Image}} {{.State.Running}}';
const PRIV_FMT='{{json .HostConfig.Privileged}}';
const MOUNT_FMT='{{json .Mounts}}';
const ACTUAL=()=>MOUNTS.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly}));
function fixture({actual=ACTUAL(),privileged=false,cid=CID,image=IMG,running=true,
 failInspect=false,execError=false,late=null,authorized=true}={}){
 const trace=[];
 function execFileImpl(binary,args,options,callback){
  trace.push({binary,args:[...args],options});
  const fmt=args[0]==='inspect'?args[2]:null;
  const text=fmt===INSPECT_FMT?`${cid} ${image} ${running}\n`:
    fmt===PRIV_FMT?JSON.stringify(privileged)+'\n':
    fmt===MOUNT_FMT?JSON.stringify(actual)+'\n':'';
  if(late&&late(args,callback))return;
  queueMicrotask(()=>callback((failInspect&&fmt)||execError?Error('simulated'):null,text,''));
 }
 return {trace,execFileImpl,opts:{dockerBinary:BIN,approvedContainerId:CID,approvedImage:IMG,
  expectedMounts:MOUNTS,execFileImpl,authorizeFixedHostAction:()=>authorized}};
}
function driver(f){return createMountLockedHostDockerDriver(f.opts);}
function executed(trace){return trace.filter(x=>x.args[0]==='exec');}
function assertsNoDockerSocket(trace){assert.equal(trace.some(x=>x.args.some(a=>String(a).includes('docker.sock'))),false);}
test('RED: mount-locked fixed-action module exports factory',()=>assert.equal(typeof createMountLockedHostDockerDriver,'function'));
test('matching exact pinned ID, image, running, unprivileged and mounts attests',async()=>{
 const f=fixture();assert.equal(await driver(f).attest(),true);assert.equal(f.trace.filter(x=>x.args[0]==='inspect').length,4);
 assert.equal(executed(f.trace).length,0);assertsNoDockerSocket(f.trace);
});
test('fixed nginx-test command executes only after fresh mount attest and approval',async()=>{
 const f=fixture();const d=driver(f);assert.equal(await d.execute('nginx-test'),0);
 assert.deepEqual(executed(f.trace).map(x=>x.args),[['exec',CID,'nginx','-t']]);
 assert.equal(f.trace.at(0).args[0],'inspect');assert.equal(f.trace.at(-1).args[0],'inspect');
});
test('fixed nginx-reload command cannot be used for arbitrary Docker exec',async()=>{
 const f=fixture();const d=driver(f);assert.equal(await d.execute('nginx-reload'),0);
 assert.deepEqual(executed(f.trace).map(x=>x.args),[['exec',CID,'nginx','-s','reload']]);
 assert.equal(await d.execute('docker-prune'),1);assert.equal(await d.execute('nginx -t; sh'),1);
 assert.equal(executed(f.trace).length,1);
});
test('default nonauthorizing driver never issues Docker exec',async()=>{
 const f=fixture();delete f.opts.authorizeFixedHostAction;
 assert.equal(await driver(f).execute('nginx-reload'),1);assert.equal(executed(f.trace).length,0);
});
test('explicit false authorization denies execution before any inspection',async()=>{
 const f=fixture({authorized:false});assert.equal(await driver(f).execute('nginx-reload'),1);
 assert.equal(f.trace.length,0);
});
test('constructor rejects unknown privileged Docker executable path',()=>{
 const f=fixture();f.opts.dockerBinary='/tmp/docker';assert.throws(()=>driver(f),/INVALID_/);
});
test('constructor rejects unpinned short container id and image',()=>{
 const f=fixture();f.opts.approvedContainerId='dev-proxy';assert.throws(()=>driver(f),/INVALID_/);
 const g=fixture();g.opts.approvedImage='sha256:abc';assert.throws(()=>driver(g),/INVALID_/);
});
test('constructor rejects missing exact pinned source or RW flag',()=>{
 for(const variant of [{destination:'/etc/nginx/nginx.conf',source:'/tmp/x'},
   {destination:'/etc/nginx/nginx.conf',source:'relative/path',readOnly:true},
   {destination:'../nginx.conf',source:'/tmp/x',readOnly:true}]){
  const f=fixture();f.opts.expectedMounts=[variant];assert.throws(()=>driver(f),/INVALID_/);
 }
});
test('constructor rejects duplicate destinations and Docker socket mounts',()=>{
 const f=fixture();f.opts.expectedMounts=[MOUNTS[0],MOUNTS[0]];assert.throws(()=>driver(f),/INVALID_/);
 for(const forbidden of ['/var/run/docker.sock','/run/docker.sock']){
  const g=fixture();g.opts.expectedMounts=[{destination:forbidden,source:'/tmp/d',readOnly:true}];
  assert.throws(()=>driver(g),/INVALID_/);
 }
});
test('constructor rejects unsafe RW nginx configuration mount and RW parent',()=>{
 for(const dest of ['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf','/etc/nginx/conf.d/sites-enabled',
 '/etc/nginx','/etc/nginx/conf.d']){
  const f=fixture();f.opts.expectedMounts=[{destination:dest,source:'/private/a',readOnly:false}];
  assert.throws(()=>driver(f),/INVALID_/);
 }
});
test('unexpected extra mount fails even if all approved mounts still present',async()=>{
 const extra={Type:'bind',Source:'/tmp/unapproved',Destination:'/new',RW:false};
 const f=fixture({actual:[...ACTUAL(),extra]});assert.equal(await driver(f).attest(),false);
 assert.equal(await driver(f).execute('nginx-reload'),1);assert.equal(executed(f.trace).length,0);
});
test('unexpected Docker socket mount fails even read-only',async()=>{
 const extra={Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',RW:false};
 const f=fixture({actual:[...ACTUAL(),extra]});assert.equal(await driver(f).attest(),false);
});
test('unexpected changed mount source fails without exposing its path',async()=>{
 const a=ACTUAL();a[0].Source='/private/other/nginx.production.conf';
 const f=fixture({actual:a});assert.equal(await driver(f).attest(),false);
 assert.equal(await driver(f).execute('nginx-test'),1);assert.equal(executed(f.trace).length,0);
});
test('insecure RW nginx conf bind fails closed',async()=>{
 const a=ACTUAL();a[1].RW=true;const f=fixture({actual:a});
 assert.equal(await driver(f).attest(),false);assert.equal(await driver(f).execute('nginx-reload'),1);
 assert.equal(executed(f.trace).length,0);
});
test('mounted code root mismatched or privileged container fails closed',async()=>{
 const a=fixture({privileged:true});assert.equal(await driver(a).attest(),false);
 assert.equal(await driver(a).execute('nginx-reload'),1);assert.equal(executed(a.trace).length,0);
});
test('unbound image, id or stopped container fails before execution',async()=>{
 for (const partial of [{cid:'c'.repeat(64)},{image:'sha256:'+'d'.repeat(64)},{running:false}]){
  const f=fixture(partial);assert.equal(await driver(f).attest(),false);
  assert.equal(await driver(f).execute('nginx-test'),1);assert.equal(executed(f.trace).length,0);
 }
});
test('malformed mount inspection fails with no execution',async()=>{
 const options=[null,{},'not an array',[],[{}],['bad'],[{Type:'volume',Destination:MOUNTS[0].destination,RW:false}]];
 for(const actual of options){const f=fixture({actual});assert.equal(await driver(f).attest(),false);}
});
test('duplicated mount names rejected even when total count matches',async()=>{
 const a=ACTUAL();a[1].Destination=a[0].Destination;
 const f=fixture({actual:a});assert.equal(await driver(f).attest(),false);
});
test('malicious JSON prototype keys and unknown mount properties do not authorize',async()=>{
 const a=ACTUAL();a[1].Bogus='ignore';const f=fixture({actual:a});
 assert.equal(await driver(f).attest(),false);
});
test('injection attempts never reach shell or command args',async()=>{
 const f=fixture();const d=driver(f);
 assert.equal(await d.execute('nginx-reload; docker rm -f all'),1);
 assert.equal(executed(f.trace).length,0);
 for(const x of f.trace)assert.equal(x.options.shell,false);
});
test('failed inspect or failed command causes deny',async()=>{
 const f=fixture({failInspect:true});assert.equal(await driver(f).attest(),false);
 const g=fixture({execError:true});assert.equal(await driver(g).execute('nginx-test'),1);
});
test('constructor and driver expose no execute arbitrary or admin reset',()=>{
 const f=fixture();const d=driver(f);
 assert.deepEqual(Object.keys(d).sort(),['attest','execute','mayInvokeHostDocker','ownerAuthorizationEstablished'].sort());
 assert.equal(d.mayInvokeHostDocker,true);assert.equal(d.ownerAuthorizationEstablished,false);
 assert.equal('run' in d,false);assert.equal('reset' in d,false);
});
test('all execFile options are no-shell, bounded and use sanitized env',async()=>{
 const f=fixture();await driver(f).execute('nginx-test');
 for(const x of f.trace){
  assert.equal(x.binary,BIN);assert.equal(x.options.shell,false);
  assert.ok(x.options.timeout>0&&x.options.timeout<=7000);
  assert.ok(x.options.maxBuffer<=4096);
  assert.equal(x.options.env.HOME.startsWith('/'),true);
  assert.equal(Object.hasOwn(x.options.env,'DOCKER_HOST'),false);
 }
});
test('authorization callback rejection or throwing never executes Docker command',async()=>{
 for(const auth of [()=>false,async()=>{throw Error('no owner grant');}]){
  const f=fixture();f.opts.authorizeFixedHostAction=auth;
  assert.equal(await driver(f).execute('nginx-test'),1);assert.equal(executed(f.trace).length,0);
 }
});
test('abort before executing denies even read-only inspection',async()=>{
 const f=fixture();const a=new AbortController();a.abort();
 assert.equal(await driver(f).execute('nginx-reload',a.signal),1);
 assert.equal(await driver(f).attest(a.signal),false);assert.equal(f.trace.length,0);
});
test('post-action mount drift cannot be classified successful after nginx reload',async()=>{
 const actual=ACTUAL();const trace=[];let changed=false;
 const f=fixture({late:(args,callback)=>{
  if(args[0]==='exec')changed=true;
  if(args[0]==='inspect'&&args[2]===MOUNT_FMT&&changed){
   const m=ACTUAL();m[1].RW=true;
   queueMicrotask(()=>callback(null,JSON.stringify(m)+'\n',''));
   return true;
  }
  return false;
 }});
 assert.equal(await driver(f).execute('nginx-reload'),1);
 assert.deepEqual(executed(f.trace).map(x=>x.args),[['exec',CID,'nginx','-s','reload']]);
 void trace;void actual;
});
test('inspect callback that never finishes is bounded and denies execution',async()=>{
 const f=fixture({late:(args,callback)=>args[0]==='inspect'&&args[2]===PRIV_FMT});
 f.opts.timeoutMs=100;
 const t=Date.now();assert.equal(await driver(f).execute('nginx-test'),1);
 assert.ok(Date.now()-t<800);assert.equal(executed(f.trace).length,0);
});
test('abort while waiting on inspect prevents late callback from permitting execution',async()=>{
 const pending=[];
 const f=fixture({late:(args,cb)=>{
  if(args[0]==='inspect'&&args[2]===MOUNT_FMT){pending.push(cb);return true;}return false;
 }});
 f.opts.timeoutMs=200;
 const a=new AbortController();
 const work=driver(f).execute('nginx-reload',a.signal);
 await new Promise(resolve=>setTimeout(resolve,15));a.abort();
 assert.equal(await work,1);assert.equal(executed(f.trace).length,0);
 for(const cb of pending)cb(null,JSON.stringify(ACTUAL())+'\n','');
});
