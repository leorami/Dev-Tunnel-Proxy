import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {assessCutoverPreflight,EXPECTED_SHA,REQUIRED,FORBIDDEN}=require('../../utils/rc1-cutover-preflight.cjs');
const cli=fileURLToPath(new URL('../../scripts/rc1-cutover-preflight.mjs',import.meta.url));
function green(){
 const out={candidateSha:EXPECTED_SHA,changeScope:'proxy-and-api-only',
   strategy:'isolated-source-controlled-recreate',
   acceptedInterruptionBudgetSeconds:90};
 for(const key of REQUIRED)out[key]=true;
 for(const key of FORBIDDEN)out[key]=false;
 return out;
}
test('full evidence returns operator-ready but never deployed',()=>{
 const v=assessCutoverPreflight(green());
 assert.equal(v.status,'READY_FOR_CONTROLLED_OPERATOR_CUTOVER');
 assert.equal(v.deployed,false);assert.equal(v.performedActions,false);
 assert.deepEqual(v.blockers,[]);
});
test('no evidence and invalid inputs are always blocked',()=>{
 for(const e of [null,undefined,{},[],false,'yes',Object.create({candidateSha:EXPECTED_SHA})]){
   const v=assessCutoverPreflight(e);assert.equal(v.status,'BLOCKED');
   assert.ok(v.blockers.length>0);assert.equal(v.deployed,false);
 }
});
test('each required gate independently blocks when missing',()=>{
 for(const key of REQUIRED){
   const e=green();delete e[key];
   const v=assessCutoverPreflight(e);
   assert.equal(v.status,'BLOCKED',key);assert.ok(v.blockers.includes(key));
 }
});
test('each prohibited side effect blocks on true or unknown',()=>{
 for(const key of FORBIDDEN){
   for(const bad of [true,undefined]){
     const e=green();e[key]=bad;
     const v=assessCutoverPreflight(e);
     assert.equal(v.status,'BLOCKED',key);assert.ok(v.blockers.includes(key));
   }
 }
});
test('pins candidate SHA, exact proxy-only scope, safe strategy and bounded budget',()=>{
 for(const [key,val] of [['candidateSha','0'.repeat(40)],['candidateSha',EXPECTED_SHA.slice(0,7)],
  ['changeScope','all-services'],['strategy','docker-compose-down'],
  ['acceptedInterruptionBudgetSeconds',0],['acceptedInterruptionBudgetSeconds',3600],
  ['acceptedInterruptionBudgetSeconds','90']]){
   const e=green();e[key]=val;
   const v=assessCutoverPreflight(e);assert.equal(v.status,'BLOCKED',key);
   assert.ok(v.blockers.includes(key),key);
 }
});
test('getters and string truthiness cannot counterfeit acceptance',()=>{
 const e=green();Object.defineProperty(e,'liveComposeDryRunOnly',{get(){throw Error('must-not-run')}});
 assert.ok(assessCutoverPreflight(e).blockers.includes('liveComposeDryRunOnly'));
 const v=green();v.rollbackOperatorReady='true';
 assert.equal(assessCutoverPreflight(v).status,'BLOCKED');
});
test('CLI is read-only, prints fixed names, never secrets or live actions',()=>{
 const data={...green(),token:'VERY_PRIVATE_TOKEN',domain:'private.internal'};
 const good=spawnSync(process.execPath,[cli],{input:JSON.stringify(data),encoding:'utf8'});
 assert.equal(good.status,0);
 assert.match(good.stdout,/READY_FOR_CONTROLLED_OPERATOR_CUTOVER/);
 assert.match(good.stdout,/Deployment performed: NO/);
 assert.doesNotMatch(good.stdout,/VERY_PRIVATE_TOKEN|private.internal/);
 const bad=spawnSync(process.execPath,[cli],{input:'{VERY_PRIVATE_TOKEN',encoding:'utf8'});
 assert.equal(bad.status,2);
 assert.match(bad.stdout,/BLOCKED/);
 assert.doesNotMatch(bad.stdout,/VERY_PRIVATE_TOKEN/);
});
