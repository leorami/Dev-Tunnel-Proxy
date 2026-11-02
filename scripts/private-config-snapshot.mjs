#!/usr/bin/env node
/**
 * DevProxy private recovery configuration snapshot.
 * Does NOT back up Docker images, restart containers, or change sources.
 * No stdout content includes filenames, tokens, paths, or checksums.
 * Default is zero-side-effect. Real execution requires owner authority
 * AND an explicit absolute --source-root of the owner checkout to archive.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const REQUIRED=['docker-compose.yml','config/default.conf','build/sites-enabled/apps.generated.conf'];
const ALLOWLIST=[
  'docker-compose.yml','docker-compose.production.yml','docker-compose.override.yml',
  'config','build/sites-enabled','apps','overrides','status','dashboard/public',
  '.certs','.artifacts','scripts/nginx-entrypoint.sh','scripts/ngrok-entrypoint.sh',
  'scripts/reload.sh','scripts/switch-to-production.sh','scripts/switch-to-development.sh',
];
const MAX_BYTES=8*1024*1024*1024;
const MAX_NODES=100000;
const home=os.homedir();
const args=process.argv.slice(2);
if(args.length===0){process.stdout.write('NO_CONFIG_SNAPSHOT; NO_DEPLOY\n');process.exit(0);}
function fail(reason){process.stdout.write(reason+'; NO_DEPLOY\n');process.exitCode=2;}
function parseArgs(argv){
  if(argv.length===1&&argv[0]==='--execute')return {error:'OWNER_APPROVAL_REQUIRED'};
  if(argv.length===2&&argv[0]==='--execute'&&argv[1]==='--owner-approved'){
    return {error:'SOURCE_ROOT_REQUIRED'};
  }
  if(argv.length!==4||argv[0]!=='--execute'||argv[1]!=='--owner-approved'||argv[2]!=='--source-root'){
    return {error:'OWNER_APPROVAL_REQUIRED'};
  }
  return {sourceRoot:argv[3]};
}
const parsed=parseArgs(args);
if(parsed.error){fail(parsed.error);process.exit(2);}

const destination=path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks');
let stage=null;

function assertSafeSourceRoot(candidate){
  if(typeof candidate!=='string'||!path.isAbsolute(candidate))throw Error('UNSAFE_SOURCE_ROOT');
  const resolved=path.resolve(candidate);
  // Reject a symlinked source root or any symlinked ancestor. Do not compare
  // path.resolve to realpath literally: macOS aliases such as /var -> /private/var
  // would false-fail a normal checkout under a temporary path.
  let current=resolved;
  while(true){
    try{
      const st=fs.lstatSync(current);
      if(st.isSymbolicLink())throw Error('UNSAFE_SOURCE_ROOT');
    }catch(e){
      if(e.message==='UNSAFE_SOURCE_ROOT')throw e;
      if(e.code!=='ENOENT')throw e;
    }
    const parent=path.dirname(current);
    if(parent===current)break;
    current=parent;
  }
  const st=fs.lstatSync(resolved);
  if(!st.isDirectory())throw Error('UNSAFE_SOURCE_ROOT');
  return resolved;
}

function safeDestination(){
  if(!path.isAbsolute(home))throw Error('UNSAFE_DESTINATION');
  let p=home;
  const relative=path.relative(home,destination);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('UNSAFE_DESTINATION');
  for(const segment of relative.split(path.sep)){
    p=path.join(p,segment);
    try{
      const st=fs.lstatSync(p);
      if(st.isSymbolicLink()||!st.isDirectory())throw Error('UNSAFE_DESTINATION');
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(fs.existsSync(destination)){
    const st=fs.lstatSync(destination);
    if(st.mode&0o077||typeof process.getuid==='function'&&st.uid!==process.getuid())throw Error('UNSAFE_DESTINATION');
  }
}

function shaFile(p){
  const hash=crypto.createHash('sha256');
  const fd=fs.openSync(p,'r');
  try{
    const buffer=Buffer.allocUnsafe(1024*1024);
    while(true){const read=fs.readSync(fd,buffer,0,buffer.length,null);if(!read)break;hash.update(buffer.subarray(0,read));}
  }finally{fs.closeSync(fd);}
  return hash.digest('hex');
}

function inventoryFile(root,rel,collected,limits){
  const absolute=path.join(root,rel);
  const stat=fs.lstatSync(absolute);
  limits.nodes++;if(limits.nodes>MAX_NODES)throw Error('CAPACITY_LIMIT');
  if(stat.isSymbolicLink()||!(stat.isDirectory()||stat.isFile()))throw Error('UNSAFE_SOURCE');
  if(stat.isFile()){
    limits.total+=stat.size;if(limits.total>MAX_BYTES)throw Error('CAPACITY_LIMIT');
    collected.push({
      path:rel.replaceAll(path.sep,'/'),
      bytes:stat.size,
      mode:stat.mode&0o777,
      mtimeMs:stat.mtimeMs,
      sha256:shaFile(absolute),
    });
    return;
  }
  const entries=fs.readdirSync(absolute).sort();
  for(const name of entries)inventoryFile(root,path.join(rel,name),collected,limits);
}

function snapshotMeta(root,rel){
  const absolute=path.join(root,rel);
  const stat=fs.lstatSync(absolute);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('SOURCE_CHANGED');
  return {
    bytes:stat.size,
    mode:stat.mode&0o777,
    mtimeMs:stat.mtimeMs,
    sha256:shaFile(absolute),
  };
}

function privateInventory(root){
  // Opaque private note: revision and dirty flag only. No file bodies.
  let head='UNKNOWN';
  let dirty=false;
  try{
    const rev=spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:5000});
    if(rev.status===0)head=rev.stdout.trim();
    const st=spawnSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8',timeout:5000});
    if(st.status===0)dirty=st.stdout.trim().length>0;
  }catch{}
  const compose={
    yml:fs.existsSync(path.join(root,'docker-compose.yml')),
    override:fs.existsSync(path.join(root,'docker-compose.override.yml')),
    production:fs.existsSync(path.join(root,'docker-compose.production.yml')),
  };
  return {head,dirty,compose};
}

try{
  const root=assertSafeSourceRoot(parsed.sourceRoot);
  safeDestination();
  if(REQUIRED.some(f=>!fs.existsSync(path.join(root,f))))throw Error('REQUIRED_FILE_MISSING');
  const env=fs.readdirSync(root).filter(x=>/^\.env(?:\..+)?$/.test(x));
  const included=[...new Set([...ALLOWLIST,...env])].filter(p=>fs.existsSync(path.join(root,p)));
  const collected=[];
  const limits={total:0,nodes:0};
  for(const rel of included)inventoryFile(root,rel,collected,limits);
  const statfs=fs.statfsSync(home);
  const available=Number(statfs.bavail)*Number(statfs.bsize);
  if(available<Math.max(limits.total*2,16*1024*1024))throw Error('INSUFFICIENT_SPACE');
  const privateNote=privateInventory(root);
  const umask=process.umask(0o077);
  try{
    fs.mkdirSync(destination,{recursive:true,mode:0o700});
    if(fs.realpathSync(destination)!==path.resolve(fs.realpathSync(home),path.relative(home,destination))){
      throw Error('UNSAFE_DESTINATION');
    }
    if(fs.statSync(destination).mode&0o077)throw Error('UNSAFE_DESTINATION');
    stage=fs.mkdtempSync(path.join(destination,'config-'));
    fs.chmodSync(stage,0o700);
    const archive=path.join(stage,'config-state.tar');
    const done=spawnSync('tar',['-cf',archive,...included],{
      cwd:root,stdio:['ignore','ignore','pipe'],maxBuffer:4096,timeout:180000,
    });
    if(done.error||done.status!==0||!fs.existsSync(archive))throw Error('SNAPSHOT_FAILED');
    fs.chmodSync(archive,0o600);
    // Recheck type/bytes/mode/mtime/sha after tar. Content-only compare is insufficient.
    for(const item of collected){
      const now=snapshotMeta(root,item.path);
      if(now.bytes!==item.bytes||now.mode!==item.mode||now.mtimeMs!==item.mtimeMs||now.sha256!==item.sha256){
        throw Error('SOURCE_CHANGED');
      }
    }
    // Also refuse if an allowlisted directory became a symlink during the run.
    for(const rel of included){
      const st=fs.lstatSync(path.join(root,rel));
      if(st.isSymbolicLink())throw Error('SOURCE_CHANGED');
    }
    fs.writeFileSync(
      path.join(stage,'manifest.private.json'),
      JSON.stringify({
        version:2,
        sourceRoot:root,
        sourceHead:privateNote.head,
        sourceDirty:privateNote.dirty,
        composePresent:privateNote.compose,
        fileCount:collected.length,
        bytes:limits.total,
        files:collected,
      },null,2),
      {mode:0o600,flag:'wx'},
    );
    const digest=shaFile(archive);
    fs.writeFileSync(path.join(stage,'SHA256SUMS.private'),digest+'  config-state.tar\n',{mode:0o600,flag:'wx'});
    process.stdout.write('PRIVATE_CONFIG_SNAPSHOT_CREATED; ISOLATED_RESTORE_NOT_VERIFIED; NO_DEPLOY\n');
    stage=null;
  }finally{process.umask(umask);}
}catch(error){
  const known=new Set([
    'UNSAFE_DESTINATION','UNSAFE_SOURCE','UNSAFE_SOURCE_ROOT','REQUIRED_FILE_MISSING',
    'CAPACITY_LIMIT','INSUFFICIENT_SPACE','SNAPSHOT_FAILED','SOURCE_CHANGED',
  ]);
  fail(known.has(error?.message)?error.message:'PRIVATE_CONFIG_SNAPSHOT_FAILED');
}finally{
  if(stage){
    try{fs.rmSync(stage,{recursive:true,force:true});}catch{}
  }
}
