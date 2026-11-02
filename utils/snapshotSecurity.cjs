'use strict';
// DEVPROXY-004A. Source copying is a privileged, privacy-sensitive operation.
// Defaults to DENY unless the operator explicitly opts in with exact local roots.
const fs=require('node:fs');
const path=require('node:path');

function safeSnapshotName(value){
  if(typeof value!=='string' || value.length<1 || value.length>96 ||
     !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value.includes('..'))return null;
  return value;
}
function authorizeHostSnapshot(input,outName,env=process.env){
  if(env?.CALLIOPE_CODE_SNAPSHOT_ENABLED!=='1')return {allowed:false,reason:'SNAPSHOTS_DISABLED'};
  if(typeof input!=='string' || !path.isAbsolute(input))return {allowed:false,reason:'ABSOLUTE_PROJECT_REQUIRED'};
  const roots=(env.CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS||'').split(path.delimiter).filter(Boolean);
  if(!roots.length)return {allowed:false,reason:'APPROVED_ROOT_REQUIRED'};
  let real;
  try{
    const source=path.resolve(input);
    const stat=fs.lstatSync(source);
    if(!stat.isDirectory() || stat.isSymbolicLink())return {allowed:false,reason:'PROJECT_NOT_DIRECTORY'};
    real=fs.realpathSync(source);
    // Docker -v uses ':' as a structural separator. A bind mount path must
    // never be able to create additional volume options through its spelling.
    if (/[,:\r\n]/.test(real))return {allowed:false,reason:'UNSAFE_BIND_MOUNT_PATH'};
    // Reject aliases/symlinks at any depth, including a symlinked parent.
    if(real!==source)return {allowed:false,reason:'PROJECT_SYMLINK_DENIED'};
  }catch{return {allowed:false,reason:'PROJECT_NOT_AVAILABLE'};}
  let approved=false;
  for(const raw of roots){
    if(!path.isAbsolute(raw))continue;
    let root;
    try{root=fs.realpathSync(raw);}catch{continue;}
    if(root===path.parse(root).root)continue; // never authorize whole disk
    if(real===root || real.startsWith(root+path.sep)){approved=true;break;}
  }
  if(!approved)return {allowed:false,reason:'PROJECT_ROOT_DENIED'};
  const fallback=(path.basename(real).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,55)||'source')
    +'_'+new Date().toISOString().replace(/[:.]/g,'-');
  const name=safeSnapshotName(outName===undefined?fallback:outName);
  if(!name)return {allowed:false,reason:'SNAPSHOT_NAME_DENIED'};
  return Object.freeze({allowed:true,source:real,name});
}
module.exports={safeSnapshotName,authorizeHostSnapshot};
