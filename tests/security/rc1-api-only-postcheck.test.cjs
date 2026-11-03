'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateApiOnlyPostcheck:run,PRODUCT_SHA,PROXY_IMAGE,GATE_KEYS}=require('../../utils/rc1-api-only-postcheck.cjs');
const sha=c=>c.repeat(64);
const good=()=>({productSha:PRODUCT_SHA,proxyImage:PROXY_IMAGE,
 before:{apiId:sha('1'),proxyId:sha('2'),ngrokId:sha('3')},
 after:{apiId:sha('4'),proxyId:sha('2'),ngrokId:sha('3')},
 mounts:[{target:'/app',rw:false},{target:'/app/.env',rw:false},{target:'/app/apps',rw:true},
 {target:'/app/overrides',rw:true},{target:'/app/build/sites-enabled',rw:true},{target:'/app/.artifacts',rw:true},{target:'/app/config',rw:true}],
 ports:[{target:3001,published:3001,hostIp:'127.0.0.1'},{target:3002,published:3002,hostIp:'127.0.0.1'}],
 gates:Object.fromEntries(GATE_KEYS.map(k=>[k,true]))});
function eq(e,w){const a=run(e);assert.equal(a.code,w);assert.equal(a.productionChangeAuthorized,false);assert.equal(a.deployed,false);assert.equal(a.liveAttested,false);}
test('complete synthetic summary is plan-only',()=>eq(good(),'API_ONLY_RO_POSTCHECK_PLAN_ONLY'));
test('exact approved source and proxy image',()=>{const a=good();a.productSha=sha('0').slice(0,40);eq(a,'WRONG_APPROVED_PRODUCT');a.productSha=PRODUCT_SHA;a.proxyImage=PROXY_IMAGE.slice(0,24);eq(a,'WRONG_APPROVED_PROXY_IMAGE');});
test('API-only scope preserved',()=>{for(const k of ['proxyId','ngrokId']){const a=good();a.after[k]=sha('a');eq(a,'OUT_OF_SCOPE_CONTAINER_CHANGE');}const a=good();a.after.apiId=a.before.apiId;eq(a,'API_NOT_RECREATED');});
test('app root must be readonly',()=>{const a=good();a.mounts[0].rw=true;eq(a,'API_MOUNT_SECURITY_FAIL');});
test('required route data dirs are writable',()=>{for(const k of ['/app/apps','/app/overrides','/app/config','/app/build/sites-enabled']){const a=good();a.mounts.find(x=>x.target===k).rw=false;eq(a,'API_MOUNT_SECURITY_FAIL');}});
test('unexpected writable CODE submount rejected',()=>{for(const k of ['/app/utils','/app/scripts']){const a=good();a.mounts.push({target:k,rw:true});eq(a,'WRITABLE_APP_SUBMOUNT');}});
test('owner env and session store continuity',()=>{for(const [k,value,w] of [['/app/.env',true,'OWNER_ENV_WRITABLE'],['/app/.artifacts',false,'SESSION_STORE_READ_ONLY']]){const a=good();a.mounts.find(m=>m.target===k).rw=value;eq(a,w);}});
test('no host docker socket mount',()=>{for(const rw of [true,false]){const a=good();a.mounts.push({target:'/var/run/docker.sock',rw});eq(a,'HOST_DOCKER_SOCKET_PRESENT');}});
test('no exposed management ports',()=>{for(const hostIp of ['','0.0.0.0','192.168.1.5','::']){const a=good();a.ports[0].hostIp=hostIp;eq(a,'API_PORT_SECURITY_FAIL');}const a=good();a.ports.pop();eq(a,'API_PORT_SECURITY_FAIL');});
test('every security check required',()=>{for(const k of GATE_KEYS){const a=good();a.gates[k]=false;eq(a,'POSTCHECK_INCOMPLETE');}});
test('invalid shapes and getters fail closed',()=>{for(const a of [null,[],{},Object.create(good())])eq(a,'INVALID_EVIDENCE');const a=good();Object.defineProperty(a,'mounts',{get(){throw Error('nope');}});eq(a,'INVALID_EVIDENCE');});
test('duplicate and accessor mount entries fail closed',()=>{let a=good();a.mounts.push(a.mounts[0]);eq(a,'INVALID_EVIDENCE');a=good();Object.defineProperty(a.mounts[0],'rw',{get(){throw Error('nope');}});eq(a,'INVALID_EVIDENCE');});
test('ID object must not invoke caller-controlled coercion',()=>{const a=good();let called=false;a.before.apiId={toString(){called=true;return '1'.repeat(64);}};eq(a,'INVALID_EVIDENCE');assert.equal(called,false);});
