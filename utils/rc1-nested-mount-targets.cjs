'use strict';
/**
 * Prepare Docker nested bind mountpoints only in an independently approved
 * owner-private, test-owned candidate snapshot. NEVER touches running Docker,
 * owner .env, Git, archives, credentials or the accepted immutable product.
 *
 * The accepted RC1 Git tree contains apps/, overrides/, config/ and
 * config/default.production.conf but not .artifacts/ or build/sites-enabled/.
 * Under /app:ro the mount targets must exist BEFORE container creation.
 */
const fs=require('node:fs');
const path=require('node:path');
const {prepareEmptyDotenvTarget}=require('./rc1-empty-dotenv-target.cjs');
const KEYS=new Set(['stageRoot','candidateRoot','apply']);
function answer(code,missing=[]){
 return Object.freeze({code,missing:Object.freeze([...missing]),productionChangeAuthorized:false,
  productionMutation:false,secretBytesRead:false,performedDockerActions:false});
}
function own(o,k){const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}
function inputValid(o){
 if(!o||typeof o!=='object'||Array.isArray(o))return false;
 const p=Object.getPrototypeOf(o);if(p!==Object.prototype&&p!==null)return false;
 return Reflect.ownKeys(o).every(k=>typeof k==='string'&&KEYS.has(k)&&
   Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function lstat(p){
 try{return {status:'exists',value:fs.lstatSync(p)};}
 catch(e){return {status:e&&e.code==='ENOENT'?'missing':'error'};}
}
function structure(root){
 for(const [relative,isFile] of [['apps',false],['overrides',false],['config',false],
   ['config/default.production.conf',true]]){
  const item=lstat(path.join(root,relative));
  if(item.status!=='exists'||item.value.isSymbolicLink()||
    (isFile?!item.value.isFile():!item.value.isDirectory()))return false;
 }
 return true;
}
function findNestedTargets(root,stageUid){
 const names=['.artifacts','build','build/sites-enabled'];
 const missing=[];
 for(const name of names){
  const item=lstat(path.join(root,name));
  if(item.status==='missing'){missing.push(name);continue;}
  if(item.status!=='exists')return {error:'BLOCKED_IO'};
  if(item.value.isSymbolicLink())return {error:'BLOCKED_SYMLINK_MOUNT_TARGET'};
  if(!item.value.isDirectory()||(item.value.mode&0o022)!==0||item.value.uid!==stageUid)
    return {error:'BLOCKED_INVALID_MOUNT_TARGET'};
 }
 return {missing};
}
function prepareNestedMountTargets(input){
 try{
  if(!inputValid(input))return answer('BLOCKED_INVALID_ARGUMENTS');
  const stageRoot=own(input,'stageRoot'),candidateRoot=own(input,'candidateRoot'),apply=own(input,'apply');
  if(typeof stageRoot!=='string'||typeof candidateRoot!=='string'||typeof apply!=='boolean')
    return answer('BLOCKED_INVALID_ARGUMENTS');
  // Reuse pinned, tested private-stage and .env collision checks. This call
  // never creates the .env placeholder because apply=false.
  const envPlan=prepareEmptyDotenvTarget({stageRoot,candidateRoot,apply:false});
  if(!['READY_PRIVATE_STAGE_ONLY','ALREADY_EMPTY_PRIVATE_PLACEHOLDER'].includes(envPlan.code))
    return answer(envPlan.code);
  if(!structure(candidateRoot))return answer('BLOCKED_PRODUCT_STRUCTURE');
  const stageUid=fs.lstatSync(stageRoot).uid;
  const check=findNestedTargets(candidateRoot,stageUid);
  if(check.error)return answer(check.error);
  const missing=[];
  if(envPlan.code==='READY_PRIVATE_STAGE_ONLY')missing.push('ENV_FILE');
  if(check.missing.includes('.artifacts'))missing.push('ARTIFACTS_DIR');
  if(check.missing.includes('build')||check.missing.includes('build/sites-enabled'))missing.push('SITES_DIR');
  if(!apply)return answer(missing.length?'MISSING_PRIVATE_MOUNT_TARGETS':'READY_PRIVATE_MOUNT_TARGETS_ONLY',missing);
  if(missing.length===0)return answer('ALREADY_STAGED_PRIVATE_MOUNT_TARGETS');
  // Only fixed, non-secret mountpoint directories. No recursion, existing
  // paths validated above, and stage root is owner-only.
  for(const name of check.missing){
   const dest=path.join(candidateRoot,name);
   fs.mkdirSync(dest,{mode:0o700});
   const stat=fs.lstatSync(dest);
   if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==stageUid||
     (stat.mode&0o777)!==0o700)return answer('BLOCKED_CREATE');
  }
  if(envPlan.code==='READY_PRIVATE_STAGE_ONLY'){
   const created=prepareEmptyDotenvTarget({stageRoot,candidateRoot,apply:true});
   if(created.code!=='CREATED_EMPTY_PRIVATE_PLACEHOLDER')return answer(created.code);
  }
  return answer('STAGED_PRIVATE_MOUNT_TARGETS_ONLY');
 }catch{return answer('BLOCKED_IO');}
}
module.exports={prepareNestedMountTargets};
