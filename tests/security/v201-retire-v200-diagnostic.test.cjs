'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('retired V200 diagnostic cannot launch credentials, direct Room writes or a separate receiver',()=>{
 for(const file of ['devproxy-v200-live-room-exchange.mjs','devproxy-v200-calliope-receiver.mjs']){
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../scripts',file)],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:5000});
  assert.equal(result.status,2,file);
  assert.match(result.stderr,/V200_DIAGNOSTIC_RETIRED/,file);
  assert.equal(result.stdout,'',file);
 }
});
