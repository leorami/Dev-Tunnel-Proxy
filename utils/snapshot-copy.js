'use strict';
// An intentionally small SOURCE-ONLY copier for a disposable network-isolated
// container. No user files are copied unless its host caller has authorized it.
// This is NOT a secret scanner; text source itself may contain credentials.
const fs=require('node:fs');
const path=require('node:path');
const fsp=fs.promises;

const EXCLUDED_DIRS=new Set([
  '.git','.ssh','.aws','.azure','.gnupg','.kube','.artifacts','.private',
  'node_modules','dist','build','.next','out','coverage','public','tmp',
  '.cache','.output','.turbo','.venv','venv','vendor','target','logs','backups'
]);
const ALLOWED_EXTS=new Set([
  '.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.md','.yml','.yaml',
  '.html','.css','.scss','.xml','.sh','.sql'
]);
const MAX_FILE_BYTES=256*1024;
const MAX_SNAPSHOT_BYTES=5*1024*1024;
const MAX_FILES=400;
const SENSITIVE_NAME=/(?:secret|credential|password|private|token|service[-_]?account|api[-_]?key|id_rsa|id_ed25519|known_hosts|authorized_keys)/i;

function shouldCopySourceFile(rel,size){
  if(typeof rel!=='string'||!Number.isSafeInteger(size)||size<0||size>MAX_FILE_BYTES)return false;
  const segments=rel.replace(/\\/g,'/').split('/');
  if(!segments.length||segments.some(s=>!s||s==='.'||s==='..'))return false;
  for(const part of segments.slice(0,-1)){
    if(part.startsWith('.')||EXCLUDED_DIRS.has(part.toLowerCase()))return false;
  }
  const name=segments.at(-1);
  if(name.startsWith('.')||SENSITIVE_NAME.test(name))return false;
  if(!ALLOWED_EXTS.has(path.extname(name).toLowerCase()))return false;
  return true;
}
async function copySourceTree(sourceRoot,outputRoot){
  const root=path.resolve(sourceRoot),out=path.resolve(outputRoot);
  const stat=await fsp.lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Source is not a regular directory');
  await fsp.mkdir(out,{recursive:true,mode:0o700});
  let copied=0,bytes=0;
  async function walk(current,parts,depth){
    if(depth>25)return;
    const entries=await fsp.readdir(current,{withFileTypes:true});
    for(const entry of entries){
      // Do not follow a link; it may point to secrets outside the approved tree.
      if(entry.isSymbolicLink())continue;
      const nextParts=[...parts,entry.name];
      const relative=nextParts.join('/');
      const src=path.join(current,entry.name);
      if(entry.isDirectory()){
        if(entry.name.startsWith('.')||EXCLUDED_DIRS.has(entry.name.toLowerCase()))continue;
        await walk(src,nextParts,depth+1);
      }else if(entry.isFile()){
        const info=await fsp.lstat(src);
        if(!info.isFile()||!shouldCopySourceFile(relative,info.size))continue;
        if(copied>=MAX_FILES||bytes+info.size>MAX_SNAPSHOT_BYTES)continue;
        const dest=path.join(out,...nextParts);
        await fsp.mkdir(path.dirname(dest),{recursive:true,mode:0o700});
        await fsp.copyFile(src,dest,fs.constants.COPYFILE_EXCL);
        await fsp.chmod(dest,0o600);
        copied+=1;bytes+=info.size;
      }
    }
  }
  await walk(root,[],0);
  return Object.freeze({copied,bytes});
}
module.exports={shouldCopySourceFile,copySourceTree};

if(require.main===module){
  copySourceTree('/src','/out/src').then(summary=>{
    console.log('Source-only snapshot complete:',summary.copied,'files');
  }).catch(()=>{
    console.error('Source-only snapshot refused');process.exitCode=1;
  });
}
