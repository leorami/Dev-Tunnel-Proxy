'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
 createMinimalPublicCalliopeHealth,
 assessPublicCalliopeHealthReply,
 publicCalliopeHealthCacheHeaders
}=require('../../utils/rc2-public-calliope-health-privacy.cjs');
const FIELDS=['enabled','mode','usedAI','healingPerformed','liveAttested'];
const EXPECTED={enabled:true,mode:'local_documentation',usedAI:false,
 healingPerformed:false,liveAttested:false};
test('RED: public health returns only five fixed compatibility flags, never live/internal activity',()=>{
 const r=createMinimalPublicCalliopeHealth();
 assert.deepEqual(Object.keys(r),FIELDS);
 assert.deepEqual(r,EXPECTED);
 assert.equal(Object.isFrozen(r),true);
});
test('RED: arbitrary private runtime values cannot appear in public health',()=>{
 const marker='SECRET_CANARY_PRIVATE_CONTEXT';
 const data={openaiConfigured:true,OPENAI_API_KEY:marker,activity:marker,
  model:marker,staticNgrokDomain:marker,ownerRoute:marker,sessionToken:marker};
 const r=createMinimalPublicCalliopeHealth(data);
 assert.equal(JSON.stringify(r).includes(marker),false);
 for(const field of Object.keys(data))assert.equal(Object.hasOwn(r,field),false);
});
test('RED: malicious getters/proxies in optional environment never invoked',()=>{
 const secret=new Proxy({}, {get(){throw Error('READ_SECRET');},
  ownKeys(){throw Error('ENUMERATED_SECRET');}});
 assert.deepEqual(createMinimalPublicCalliopeHealth(secret),EXPECTED);
});
test('RED: public health does not claim production release, heal or model use',()=>{
 const r=createMinimalPublicCalliopeHealth();
 assert.equal(r.usedAI,false);assert.equal(r.healingPerformed,false);
 assert.equal(r.liveAttested,false);
 for(const k of ['deployed','productionChangeAuthorized','ownerUatApproved',
  'model','openaiConfigured','capabilities','activity','staticNgrokDomain'])
  assert.equal(Object.hasOwn(r,k),false);
});
test('RED: assessor accepts only exact five-field minimal public response',()=>{
 const r=assessPublicCalliopeHealthReply(createMinimalPublicCalliopeHealth());
 assert.equal(r.code,'PUBLIC_CALLIOPE_HEALTH_MINIMIZED');
 assert.equal(r.privacyVerified,true);
 assert.equal(r.releaseAuthorized,false);
 assert.equal(r.deployed,false);
});
test('RED: an actual public response containing existence of owner AI credential is BLOCKED',()=>{
 const withLeak={...EXPECTED,openaiConfigured:true};
 const r=assessPublicCalliopeHealthReply(withLeak);
 assert.equal(r.code,'PUBLIC_CALLIOPE_HEALTH_LEAKAGE');
 assert.equal(r.privacyVerified,false);
});
test('RED: reject operational activity text even if externally redacted',()=>{
 for(const added of [{activity:'idle'},{model:null},{staticNgrokDomain:null},
  {capabilities:[]},{lastUpdated:null},{ownerWorkPreserved:'UNKNOWN'}]){
  const r=assessPublicCalliopeHealthReply({...EXPECTED,...added});
  assert.equal(r.privacyVerified,false);
 }
});
test('RED: reject poisoned flags, changed mode or nested internal metadata',()=>{
 for(const obj of [{...EXPECTED,usedAI:true},{...EXPECTED,mode:'external_ai'},
  {...EXPECTED,healingPerformed:true},{...EXPECTED,liveAttested:true},
  {...EXPECTED,enabled:'true'}, {...EXPECTED,enabled:false},
  {...EXPECTED,metadata:{host:'private'}}]){
  assert.equal(assessPublicCalliopeHealthReply(obj).privacyVerified,false);
 }
});
test('RED: reject accessor getters, null prototypes and non-object values',()=>{
 const accessor={...EXPECTED};Object.defineProperty(accessor,'mode',{get(){throw Error('SENSITIVE');}});
 assert.equal(assessPublicCalliopeHealthReply(accessor).privacyVerified,false);
 const noProto=Object.assign(Object.create(null),EXPECTED);
 assert.equal(assessPublicCalliopeHealthReply(noProto).privacyVerified,false);
 for(const x of [null,undefined,[],0,'',false]){
  assert.equal(assessPublicCalliopeHealthReply(x).privacyVerified,false);
 }
});
test('RED: assessor rejects circular structures without JSON serialization or throwing',()=>{
 const circular={...EXPECTED};circular.loop=circular;
 const r=assessPublicCalliopeHealthReply(circular);
 assert.equal(r.privacyVerified,false);
});

test('RED: public health should never be cached with authenticated browser artifacts',()=>{
 const h=publicCalliopeHealthCacheHeaders();
 assert.deepEqual(h,{'Cache-Control':'no-store','Pragma':'no-cache'});
 assert.equal(Object.isFrozen(h),true);
});
test('RED: policy is immutable and cannot be changed by user-provided headers',()=>{
 const a=publicCalliopeHealthCacheHeaders();
 try{a['Cache-Control']='public, max-age=86400';}catch{}
 assert.equal(publicCalliopeHealthCacheHeaders()['Cache-Control'],'no-store');
});
