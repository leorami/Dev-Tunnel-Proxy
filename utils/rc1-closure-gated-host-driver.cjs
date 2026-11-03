'use strict';
/**
 * Narrow test-owned host-only adapter that checks the entire reachable Nginx
 * include graph before each fixed action and after active-route verification.
 * This adapter never imports Docker, executes commands, installs a worker,
 * approves owner GO, or inspects real owner data. Its injected driver MUST be
 * a separately authorized, exact-container-ID fixed-action implementation.
 *
 * The host callback below is REDACTED TEST EVIDENCE ONLY. Even a passing
 * callback is not trusted operator proof of actual runtime mounts or loaded
 * Nginx state; production remains blocked pending real Mac attestation.
 */
const path=require('node:path');
const {checkEffectiveNginxConfigClosure}=require('./rc1-effective-nginx-config-closure.cjs');
const PASS='HOST_CALLBACK_CONFIG_CLOSURE_REPORTED';
const ACTIONS=new Set(['nginx-test','nginx-reload']);
function createClosureGatedHostDriver({approvedRoot,driver,verifyActiveRoute,hostView}={}){
 if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||
    path.normalize(approvedRoot)!==approvedRoot||approvedRoot==='/'||
    !driver||typeof driver.attest!=='function'||typeof driver.execute!=='function'||
    typeof verifyActiveRoute!=='function'||typeof hostView!=='function')
   throw Error('INVALID_CLOSURE_GATED_DRIVER');
 async function verify(signal){
  if(signal?.aborted)return false;
  let outcome;
  try{outcome=await checkEffectiveNginxConfigClosure({approvedRoot,hostView});}
  catch{return false;}
  return !signal?.aborted&&outcome.code===PASS;
 }
 async function attest(signal){
  if(!await verify(signal))return false;
  if(signal?.aborted)return false;
  try{const result=await driver.attest(signal);return !signal?.aborted&&result===true;}
  catch{return false;}
 }
 async function execute(action,signal){
  if(!ACTIONS.has(action)||signal?.aborted)return 1;
  if(!await verify(signal)||signal?.aborted)return 1;
  try{const code=await driver.execute(action,signal);return !signal?.aborted&&code===0?0:1;}
  catch{return 1;}
 }
 async function verifiedRoute(signal,digest){
  if(signal?.aborted||!await verify(signal))return false;
  let actual;
  try{actual=await verifyActiveRoute(signal,digest);}catch{return false;}
  if(actual!==true||signal?.aborted)return false;
  return await verify(signal);
 }
 return Object.freeze({driver:Object.freeze({attest,execute}),verifyActiveRoute:verifiedRoute,
  productionChangeAuthorized:false,actualHostAttested:false,deployed:false});
}
module.exports={createClosureGatedHostDriver};
