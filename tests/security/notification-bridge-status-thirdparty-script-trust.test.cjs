'use strict';
/**
 * RED-first P0 browser-side trust contract. Source-only: no actual CDN,
 * pairing secret, localhost bridge, Messages, or service calls are made.
 * This test is intentionally NOT wired to canonical tests until a separate,
 * reviewed status-UI correction satisfies it; V121 remains read-only.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const page=fs.readFileSync(path.join(__dirname,'../../status/status.html'),'utf8');
function scripts(html){
 return [...html.matchAll(/<script\b([^>]*)>/gi)].map(m=>{
  const attrs=m[1],src=attrs.match(/\bsrc\s*=\s*(['"])(.*?)\1/i)?.[2]||null;
  return {src,attrs};
 }).filter(x=>x.src);
}
function trustedScript({src,attrs}){
 if(!/^https?:\/\//i.test(src))return true; // reviewed first-party bundle
 const immutable=/[@/]\d+\.\d+\.\d+(?:\/|$)/.test(src);
 const sri=/\bintegrity\s*=\s*(['"])sha(?:256|384|512)-[a-z0-9+/=]+\1/i.test(attrs);
 const cors=/\bcrossorigin\s*=\s*(['"])anonymous\1/i.test(attrs);
 return immutable&&sri&&cors;
}
test('positive controls: local audited JS or immutable + integrity-pinned remote JS',()=>{
 assert.equal(trustedScript({src:'/status/common.js',attrs:'src="/status/common.js"'}),true);
 assert.equal(trustedScript({src:'https://cdn.example/pkg@1.2.3/ui.js',
  attrs:'src="https://cdn.example/pkg@1.2.3/ui.js" integrity="sha384-aGVsbG8=" crossorigin="anonymous"'}),true);
});
test('negative controls: mutable, floating or unhashed CDN JS cannot be trusted in a paired page',()=>{
 for(const item of [
  {src:'https://unpkg.com/lucide@latest',attrs:'src="https://unpkg.com/lucide@latest"'},
  {src:'https://cdn.example/pkg@1.2.3/ui.js',attrs:'src="https://cdn.example/pkg@1.2.3/ui.js"'},
  {src:'https://cdn.example/pkg@1.2.3/ui.js',attrs:'src="https://cdn.example/pkg@1.2.3/ui.js" integrity="sha384-aGVsbG8="'},
 ])assert.equal(trustedScript(item),false);
});
test('RED: status paired bridge bearer is never exposed to unaudited third-party script execution',()=>{
 assert.match(page,/sessionStorage\.setItem\(NOTIF_BRIDGE_PAIR_KEY\s*,\s*token\)/);
 assert.match(page,/sessionStorage\.getItem\(NOTIF_BRIDGE_PAIR_KEY\)/);
 assert.match(page,/Authorization:\s*`Bearer \$\{token\}`/);
 const unsafe=scripts(page).filter(s=>!trustedScript(s));
 assert.deepEqual(unsafe.map(x=>x.src),[],
  'paired bridge bearer shares origin with unsigned/unversioned third-party JS');
});
test('control: paired bearer is not deliberately persisted in localStorage',()=>{
 assert.doesNotMatch(page,/localStorage\.setItem\(NOTIF_BRIDGE_PAIR_KEY\s*,/);
});
