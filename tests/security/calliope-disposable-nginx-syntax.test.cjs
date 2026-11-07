'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runDisposableNginxSyntaxTest}=require('../../utils/calliope-disposable-nginx-syntax.cjs');

test('RED: disposable nginx -t accepts bare upstream candidate and rejects garbage',async()=>{
 const ok=await runDisposableNginxSyntaxTest({
  routeConfig:'location ^~ /lyra/_next/ { proxy_pass http://127.0.0.1:9; }\n'
 });
 assert.equal(ok.engine,'nginx-t-disposable');
 assert.equal(ok.ok,true);
 assert.equal(ok.exitCode,0);
 const bad=await runDisposableNginxSyntaxTest({
  routeConfig:'location /lyra/_next/ { proxy_pass NOT_A_URL; }\n'
 });
 assert.equal(bad.ok,false);
 assert.notEqual(bad.exitCode,0);
});

test('RED: invalid inputs never claim nginx syntax ok',async()=>{
 const r=await runDisposableNginxSyntaxTest({routeConfig:''});
 assert.equal(r.ok,false);
 assert.equal(r.code,'INVALID_INPUT');
});
