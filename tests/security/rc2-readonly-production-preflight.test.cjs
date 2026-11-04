'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createReadOnlyProductionPreflight}=require('../../utils/rc2-readonly-production-preflight.cjs');
const ID={proxy:'a'.repeat(64),api:'b'.repeat(64)};
const IMG={proxy:'sha256:'+'c'.repeat(64),api:'sha256:'+'d'.repeat(64)};
const MOUNTS={
 proxy:[
  {destination:'/etc/nginx/nginx.conf',source:'/private/rc2/nginx.conf',readOnly:true},
  {destination:'/etc/nginx/conf.d/default.conf',source:'/private/rc2/default.conf',readOnly:true},
  {destination:'/etc/nginx/conf.d/sites-enabled',source:'/private/rc2/sites',readOnly:true}
 ],
 api:[
  {destination:'/app',source:'/private/rc2/source',readOnly:true},
  {destination:'/app/.env',source:'/private/rc2/owner.env',readOnly:true},
  {destination:'/app/apps',source:'/private/rc2/apps',readOnly:false},
  {destination:'/app/overrides',source:'/private/rc2/overrides',readOnly:false},
  {destination:'/app/build/sites-enabled',source:'/private/rc2/build/sites-enabled',readOnly:false},
  {destination:'/app/.artifacts',source:'/private/rc2/artifacts',readOnly:false}
 ]
};
const FORMAT={
 id:'{{json .Id}}',image:'{{json .Image}}',running:'{{json .State.Running}}',
 privileged:'{{json .HostConfig.Privileged}}',user:'{{json .Config.User}}',
 mounts:'{{json .Mounts}}',ports:'{{json .HostConfig.PortBindings}}'
};
function baseRecords(){
 return {
  proxy:{id:ID.proxy,image:IMG.proxy,running:true,privileged:false,user:'nginx',
   mounts:MOUNTS.proxy.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly})),
   ports:{'80/tcp':[{HostIp:'127.0.0.1',HostPort:'3001'}]}},
  api:{id:ID.api,image:IMG.api,running:true,privileged:false,user:'10001',
   mounts:MOUNTS.api.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly})),
   ports:{'3002/tcp':[{HostIp:'127.0.0.1',HostPort:'3002'}]}}
 };
}
function invoke(modify,overrides={}){
 const records=baseRecords();if(modify)modify(records);
 const called=[];
 const execFileImpl=(bin,args,opts,cb)=>{
  called.push({bin,args:[...args],opts});
  const role=args[3]===ID.proxy?'proxy':args[3]===ID.api?'api':null;
  const key=Object.keys(FORMAT).find(x=>FORMAT[x]===args[2]);
  if(!role||!key)throw Error('UNEXPECTED_DOCKER_CALL');
  const value=records[role][key];
  queueMicrotask(()=>cb(null,JSON.stringify(value)+'\n',''));
 };
 return {
  called,records,
  run:()=>createReadOnlyProductionPreflight({dockerBinary:'/usr/local/bin/docker',
   execFileImpl,home:'/private/rc2/testing',pins:{
    proxy:{containerId:ID.proxy,image:IMG.proxy,mounts:MOUNTS.proxy},
    api:{containerId:ID.api,image:IMG.api,mounts:MOUNTS.api}
   },...overrides}).inspect()
 };
}
test('RED: source exposes read-only bounded preflight factory',()=>{
 assert.equal(typeof createReadOnlyProductionPreflight,'function');
});
test('valid fixed Docker evidence is REVIEW_REQUIRED, never deployment authority',async()=>{
 const t=invoke();const result=await t.run();
 assert.equal(result.code,'EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY');
 assert.equal(result.productionChangeAuthorized,false);
 assert.equal(result.deployed,false);
 assert.equal(result.runtimeAttested,false);
 assert.deepEqual(result.blockers,[]);
 assert.equal(t.called.length,14);
 assert.ok(t.called.every(x=>x.args[0]==='inspect'&&x.args[1]==='--format'));
 assert.ok(t.called.every(x=>x.opts.shell===false));
 assert.equal(JSON.stringify(result).includes('/private/rc2/'),false);
});
test('proxy unexpected mount fails closed with no private source disclosure',async()=>{
 const t=invoke(r=>r.proxy.mounts.push({Type:'bind',Source:'/tmp/extra',Destination:'/etc/shadow',RW:false}));
 const r=await t.run();assert.equal(r.code,'READ_ONLY_PREFLIGHT_BLOCKED');
 assert.ok(r.blockers.includes('PROXY_MOUNTS_MISMATCH'));
 assert.equal(JSON.stringify(r).includes('/private/'),false);
});
test('API /app writable and API root UID both block',async()=>{
 const t=invoke(r=>{r.api.mounts.find(x=>x.Destination==='/app').RW=true;r.api.user='0';});
 const r=await t.run();assert.ok(r.blockers.includes('API_MOUNTS_MISMATCH'));
 assert.ok(r.blockers.includes('API_ROOT_USER'));
});
test('unexpected root or wildcard port binding blocks',async()=>{
 const t=invoke(r=>{r.api.ports['3002/tcp']=[{HostIp:'0.0.0.0',HostPort:'3002'}];});
 const r=await t.run();assert.ok(r.blockers.includes('API_PORTS_NOT_LOOPBACK'));
});
test('Docker socket exposure cannot be allowlisted',()=>{
 assert.throws(()=>createReadOnlyProductionPreflight({dockerBinary:'/usr/local/bin/docker',
  execFileImpl:()=>{},home:'/tmp',pins:{proxy:{containerId:ID.proxy,image:IMG.proxy,
   mounts:[...MOUNTS.proxy,{destination:'/var/run/docker.sock',source:'/var/run/docker.sock',readOnly:true}]},
   api:{containerId:ID.api,image:IMG.api,mounts:MOUNTS.api}}}),/INVALID_RC2_PREFLIGHT/);
});
test('Docker socket observed in unexpected mount is denied',async()=>{
 const t=invoke(r=>r.proxy.mounts.push({Type:'bind',Source:'/var/run/docker.sock',Destination:'/run/docker.sock',RW:true}));
 const r=await t.run();assert.ok(r.blockers.includes('PROXY_MOUNTS_MISMATCH'));
});
test('privileged or not running blocks without invoking mutating commands',async()=>{
 const t=invoke(r=>{r.proxy.privileged=true;r.api.running=false;});
 const r=await t.run();assert.ok(r.blockers.includes('PROXY_PRIVILEGED'));
 assert.ok(r.blockers.includes('API_NOT_RUNNING'));
 assert.ok(t.called.every(x=>!x.args.includes('exec')&&!x.args.includes('up')&&!x.args.includes('restart')));
});
test('image and ID replacement block without leaking observed values',async()=>{
 const t=invoke(r=>{r.proxy.image='sha256:'+'e'.repeat(64);r.api.id='f'.repeat(64)});
 const r=await t.run();assert.ok(r.blockers.includes('PROXY_IMAGE_DRIFT'));
 assert.ok(r.blockers.includes('API_ID_DRIFT'));
 assert.equal(JSON.stringify(r).includes('f'.repeat(64)),false);
});
test('untrusted fake invocation cannot enable protected deploy',async()=>{
 const t=invoke(null,{ownerGo:true,authorized:true,deployed:true});
 const r=await t.run();assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.deployed,false);assert.equal(r.runtimeAttested,false);
});
test('stalled inspect fails closed under bounded timeout',async()=>{
 const t=invoke();const expected=t.run;
 void expected;
 const f=()=>{};
 const pre=createReadOnlyProductionPreflight({dockerBinary:'/usr/local/bin/docker',
  execFileImpl:f,home:'/tmp',timeoutMs:120,pins:{
   proxy:{containerId:ID.proxy,image:IMG.proxy,mounts:MOUNTS.proxy},
   api:{containerId:ID.api,image:IMG.api,mounts:MOUNTS.api}}});
 const now=Date.now();const r=await pre.inspect();
 assert.equal(r.code,'READ_ONLY_PREFLIGHT_BLOCKED');
 assert.ok(Date.now()-now<1500);
});
test('invalid pin or unexpected writable route root is rejected at construction',()=>{
 const make=(pins)=>createReadOnlyProductionPreflight({dockerBinary:'/usr/local/bin/docker',
  execFileImpl:()=>{},home:'/tmp',pins});
 assert.throws(()=>make({proxy:{containerId:'short',image:IMG.proxy,mounts:MOUNTS.proxy},
  api:{containerId:ID.api,image:IMG.api,mounts:MOUNTS.api}}),/INVALID_RC2_PREFLIGHT/);
 assert.throws(()=>make({proxy:{containerId:ID.proxy,image:IMG.proxy,mounts:MOUNTS.proxy},
  api:{containerId:ID.api,image:IMG.api,mounts:[...MOUNTS.api,
   {destination:'/app/node_modules',source:'/tmp/evil',readOnly:false}]}}),/INVALID_RC2_PREFLIGHT/);
});

test('proxy artifacts-only RW bind allowed when explicitly pinned; nginx still RO',async()=>{
 const mounts=[...MOUNTS.proxy,{destination:'/usr/share/nginx/html/.artifacts',source:'/private/rc2/proxy-artifacts',readOnly:false}];
 const rec=baseRecords();rec.proxy.mounts.push({Type:'bind',Source:'/private/rc2/proxy-artifacts',Destination:'/usr/share/nginx/html/.artifacts',RW:true});
 const calls=[];const fake=(bin,args,opts,cb)=>{calls.push(args);const role=args[3]===ID.proxy?'proxy':'api';
  const key=Object.keys(FORMAT).find(k=>FORMAT[k]===args[2]);queueMicrotask(()=>cb(null,JSON.stringify(rec[role][key])+'\n',''));};
 const pre=createReadOnlyProductionPreflight({dockerBinary:'/usr/local/bin/docker',execFileImpl:fake,home:'/private/tmp',
  pins:{proxy:{containerId:ID.proxy,image:IMG.proxy,mounts},api:{containerId:ID.api,image:IMG.api,mounts:MOUNTS.api}}});
 const r=await pre.inspect();assert.equal(r.code,'EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY');
 assert.equal(calls.length,14);
});
