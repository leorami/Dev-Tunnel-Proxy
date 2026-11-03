'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHostDockerAdapter}=require('../utils/host-execfile-adapter.cjs');
const ID='1'.repeat(64),IMAGE='sha256:'+'a'.repeat(64),BINARY='/opt/homebrew/bin/docker';
function make(outputs){const calls=[];
 const execFileImpl=(binary,args,opts,done)=>{calls.push({binary,args,opts});const o=outputs.shift();
  setImmediate(()=>o instanceof Error ? done(o,'','') : done(null,o||'',''));
 };
 return {execFileImpl,calls};
}
test('real Node execFile callback adapter attests fixed container/image/running',async()=>{
 const mock=make([`${ID} ${IMAGE} true\n`]);
 const d=createHostDockerAdapter({dockerBinary:BINARY,approvedContainerId:ID,approvedImage:IMAGE,execFileImpl:mock.execFileImpl});
 assert.equal(await d.attest(),true);
 assert.equal(mock.calls.length,1);
 assert.equal(mock.calls[0].binary,BINARY);
 assert.deepEqual(mock.calls[0].args,['inspect','--format','{{.Id}} {{.Image}} {{.State.Running}}',ID]);
 assert.equal(mock.calls[0].opts.shell,false);
 assert.ok(mock.calls[0].opts.maxBuffer<=8192);
});
test('validate and reload never accept caller-defined Docker arguments',async()=>{
 const mock=make(['','']);
 const d=createHostDockerAdapter({dockerBinary:BINARY,approvedContainerId:ID,approvedImage:IMAGE,execFileImpl:mock.execFileImpl});
 assert.equal(await d.execute('nginx-test'),0);
 assert.equal(await d.execute('nginx-reload'),0);
 assert.deepEqual(mock.calls.map(x=>x.args),[['exec',ID,'nginx','-t'],['exec',ID,'nginx','-s','reload']]);
 assert.equal(await d.execute('container-prune'),1);
 assert.equal(mock.calls.length,2);
});
test('nonzero exit and thrown subprocess fail closed',async()=>{
 const mock=make([Object.assign(new Error('bad'),{code:2}),new Error('bad')]);
 const d=createHostDockerAdapter({dockerBinary:BINARY,approvedContainerId:ID,approvedImage:IMAGE,execFileImpl:mock.execFileImpl});
 assert.equal(await d.execute('nginx-test'),1);
 assert.equal(await d.attest(),false);
});
test('wrong image ID or wrong running status cannot attest',async()=>{
 for(const response of [`${ID} sha256:${'b'.repeat(64)} true\n`,`${ID} ${IMAGE} false\n`,`${'2'.repeat(64)} ${IMAGE} true\n`]){
  const mock=make([response]);const d=createHostDockerAdapter({dockerBinary:BINARY,approvedContainerId:ID,approvedImage:IMAGE,execFileImpl:mock.execFileImpl});
  assert.equal(await d.attest(),false);
 }
});
test('reject anything except exact fixed operator-owned Docker binary and 64-hex identifiers',()=>{
 const good={dockerBinary:BINARY,approvedContainerId:ID,approvedImage:IMAGE,execFileImpl:make([]).execFileImpl};
 for(const bad of [{dockerBinary:'docker'},{dockerBinary:'/a/../docker'},{dockerBinary:'/tmp/docker'},{approvedImage:'sha256:short'},{approvedContainerId:'12'}])
  assert.throws(()=>createHostDockerAdapter({...good,...bad}));
});
