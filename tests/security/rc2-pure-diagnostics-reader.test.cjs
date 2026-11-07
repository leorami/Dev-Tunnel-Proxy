'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readExistingBundleDiagnostics}=require('../../utils/rc2-readonly-bundle-diagnostics.cjs');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v90-pure-get-'));
 try{return fn(path.join(dir,'bundle-diagnostics.json'),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const payload={generatedAt:'2026-11-04T00:00:00Z',included:[{kind:'app',pathSpec:'/real/',source:'apps/real.conf'}],skipped:[]};
test('reader returns existing artifact with no writes or regeneration',()=>fixture((file,dir)=>{
 fs.writeFileSync(file,JSON.stringify(payload));const before=fs.readFileSync(file);const mtime=fs.statSync(file).mtimeMs;
 const result=readExistingBundleDiagnostics({file});
 assert.equal(result.code,'BUNDLE_DIAGNOSTICS_OK');assert.deepEqual(result.diagnostics,payload);
 assert.deepEqual(fs.readdirSync(dir),['bundle-diagnostics.json']);
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.statSync(file).mtimeMs,mtime);
}));
test('missing artifact returns explicit unavailability and does not synthesize an empty success',()=>fixture((file,dir)=>{
 assert.deepEqual(readExistingBundleDiagnostics({file}),{code:'BUNDLE_DIAGNOSTICS_MISSING'});
 assert.deepEqual(fs.readdirSync(dir),[]);
}));
test('reject noncanonical route artifact paths and symlinks',()=>fixture((file,dir)=>{
 const other=path.join(dir,'source.json');fs.writeFileSync(other,JSON.stringify(payload));fs.symlinkSync(other,file);
 assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_UNSAFE');
 for(const candidate of [other,path.join(dir,'../bundle-diagnostics.json'),file+'/..',file+'\u0000']){
  assert.notEqual(readExistingBundleDiagnostics({file:candidate}).code,'BUNDLE_DIAGNOSTICS_OK');
 }
}));
test('reject hardlinks and group/world-writable artifacts',()=>fixture((file,dir)=>{
 const original=path.join(dir,'source.json');fs.writeFileSync(original,JSON.stringify(payload));fs.linkSync(original,file);
 assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_UNSAFE');
 fs.unlinkSync(file);fs.unlinkSync(original);fs.writeFileSync(file,JSON.stringify(payload));fs.chmodSync(file,0o666);
 assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_UNSAFE');
}));
test('malformed and missing included fail closed, not a fake empty route set',()=>fixture(file=>{
 for(const raw of ['{not-json','{}','null','[]','{"included":null}','{"included":{}}','{"included":"[]"}','{"included":[1]}']){
  fs.writeFileSync(file,raw);
  assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_INVALID',raw);
 }
}));
test('oversize and empty files fail closed',()=>fixture(file=>{
 fs.writeFileSync(file,'x'.repeat(262145));assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_UNSAFE');
 fs.writeFileSync(file,'');assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_UNSAFE');
}));
test('too many routes is invalid even when JSON fits byte cap',()=>fixture(file=>{
 fs.writeFileSync(file,JSON.stringify({included:Array(2049).fill({})}));
 assert.equal(readExistingBundleDiagnostics({file}).code,'BUNDLE_DIAGNOSTICS_INVALID');
}));
