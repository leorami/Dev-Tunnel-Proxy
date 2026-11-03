'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {createHostReloadService} = require('../utils/host-nginx-reload-service.cjs');
const ACTION='VALIDATE_AND_RELOAD_FIXED_DEV_PROXY';
const requestId='a'.repeat(32);
const ID='1'.repeat(64);
async function setup(overrides={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-host-reload-test-'));
  await fs.chmod(root,0o700);
  const commands=[];
  const runner=async(command,args)=>{commands.push([command,...args]);return 0;};
  const service=createHostReloadService({
    directory:root,approvedContainerId:ID,
    authorize:async()=>true,
    attest:async()=>true,
    execute:runner,
    verify:async()=>true,
    ...overrides,
  });
  await service.start();
  const send=async (payload) => await new Promise((resolve,reject)=>{
    const conn=net.createConnection(service.socketPath);
    let out='';
    conn.setEncoding('utf8');
    conn.on('data',s=>{out+=s;});
    conn.on('error',reject);
    conn.on('end',()=>{try{resolve(JSON.parse(out))}catch(e){reject(e)}});
    conn.on('connect',()=>conn.end(typeof payload==='string'?payload:JSON.stringify(payload)+'\n'));
  });
  const close=async()=>{await service.stop();await fs.rm(root,{recursive:true,force:true});};
  return {root,service,commands,send,close};
}
test('private socket, fixed commands, and no production attestation from result',async()=>{
  const x=await setup();
  try{
    const st=await fs.lstat(x.service.socketPath);
    assert(st.isSocket());assert.equal(st.mode&0o777,0o600);
    assert.equal((await fs.stat(x.root)).mode&0o777,0o700);
    const r=await x.send({type:ACTION,requestId});
    assert.equal(r.status,'HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
    assert.equal(r.productionChangeAuthorized,false);
    assert.equal(r.liveAttested,false);
    assert.deepEqual(x.commands,[['docker','exec',ID,'nginx','-t'],['docker','exec',ID,'nginx','-s','reload']]);
  } finally{await x.close();}
});
test('fail closed malformed messages, injected fields and invalid action',async()=>{
  const x=await setup();try{
    for(const p of ['not-json\n','{}\n',JSON.stringify({type:ACTION,requestId,command:'rm -rf /'})+'\n',JSON.stringify({type:'RUN_ARBITRARY',requestId})+'\n']){
      const r=await x.send(p);assert.equal(r.status,'BLOCKED_INVALID_REQUEST');
    }
    assert.equal(x.commands.length,0);
  }finally{await x.close();}
});
test('replay persisted on disk across restart even when request failed',async()=>{
  const x=await setup({authorize:async()=>false});try{
    const first=await x.send({type:ACTION,requestId});
    assert.equal(first.status,'BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
    assert.equal((await x.send({type:ACTION,requestId})).status,'BLOCKED_REPLAY');
    await x.service.stop();
    const y=createHostReloadService({directory:x.root,approvedContainerId:ID,authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true});
    await y.start();
    const raw=await new Promise((resolve,reject)=>{let s='';const c=net.createConnection(y.socketPath);c.on('data',d=>s+=d);c.on('error',reject);c.on('end',()=>resolve(s));c.on('connect',()=>c.end(JSON.stringify({type:ACTION,requestId})+'\n'));});
    assert.equal(JSON.parse(raw).status,'BLOCKED_REPLAY');
    await y.stop();
  }finally{await x.close();}
});
test('bad attestation stops command invocation',async()=>{
  const x=await setup({attest:async()=>false});try{
    assert.equal((await x.send({type:ACTION,requestId})).status,'BLOCKED_CONTAINER_IDENTITY');
    assert.equal(x.commands.length,0);
  }finally{await x.close();}
});
test('validation error stops reload',async()=>{
  const x=await setup({execute:async()=>1});try{
    assert.equal((await x.send({type:ACTION,requestId})).status,'NGINX_VALIDATION_FAILED');
  }finally{await x.close();}
});
test('reject symlink socket directory and existing socket leaf',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-host-symlink-'));
  const target=path.join(root,'owner'),link=path.join(root,'link');
  await fs.mkdir(target,{mode:0o700});await fs.symlink(target,link);
  const mk=p=>createHostReloadService({directory:p,approvedContainerId:ID,authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true});
  try {await assert.rejects(mk(link).start());}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('large request rejected without any command execution',async()=>{
  const x=await setup();try{
    const r=await x.send(JSON.stringify({type:ACTION,requestId,pad:'z'.repeat(8192)})+'\n');
    assert.equal(r.status,'BLOCKED_INVALID_REQUEST');assert.equal(x.commands.length,0);
  }finally{await x.close();}
});
