#!/usr/bin/env node
/**
 * DevProxy private recovery configuration snapshot.
 * Does NOT back up Docker images, restart containers, or change sources.
 * No stdout content includes filenames, tokens, paths, or checksums.
 * Default is zero-side-effect. Real execution requires owner authority.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length===0){process.stdout.write('NO_CONFIG_SNAPSHOT; NO_DEPLOY\n');process.exit(0);}
if(args.length!==2||args[0]!=='--execute'||args[1]!=='--owner-approved'){
  process.stdout.write('OWNER_APPROVAL_REQUIRED; NO_CONFIG_SNAPSHOT; NO_DEPLOY\n');process.exit(2);
}
const fail=(reason)=>{process.stdout.write(reason+'; NO_DEPLOY\n');process.exitCode=2;};
const destination=path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks');
let stage=null;
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
const collected=[];
let total=0,nodes=0;
function inspectFile(rel){
  const absolute=path.join(root,rel);
  const stat=fs.lstatSync(absolute);
  nodes++;if(nodes>MAX_NODES)throw Error('CAPACITY_LIMIT');
  if(stat.isSymbolicLink()||!(stat.isDirectory()||stat.isFile()))throw Error('UNSAFE_SOURCE');
  if(stat.isFile()){
    total+=stat.size;if(total>MAX_BYTES)throw Error('CAPACITY_LIMIT');
    collected.push({path:rel.replaceAll(path.sep,'/'),bytes:stat.size,mode:stat.mode&0o777,mtimeMs:stat.mtimeMs,sha256:shaFile(absolute)});
    return;
  }
  const entries=fs.readdirSync(absolute).sort();
  for(const name of entries)inspectFile(path.join(rel,name));
}
try{
  safeDestination();
  if(REQUIRED.some(f=>!fs.existsSync(path.join(root,f))))throw Error('REQUIRED_FILE_MISSING');
  const env=fs.readdirSync(root).filter(x=>/^\.env(?:\..+)?$/.test(x));
  const included=[...new Set([...ALLOWLIST,...env])].filter(p=>fs.existsSync(path.join(root,p)));
  for(const rel of included)inspectFile(rel);
  const statfs=fs.statfsSync(home);
  const available=Number(statfs.bavail)*Number(statfs.bsize);
  if(available<Math.max(total*2,16*1024*1024))throw Error('INSUFFICIENT_SPACE');
  const umask=process.umask(0o077);
  try{
    fs.mkdirSync(destination,{recursive:true,mode:0o700});
    if(fs.realpathSync(destination)!==path.resolve(fs.realpathSync(home),path.relative(home,destination)))throw Error('UNSAFE_DESTINATION');
    if(fs.statSync(destination).mode&0o077)throw Error('UNSAFE_DESTINATION');
    stage=fs.mkdtempSync(path.join(destination,'config-'));
    fs.chmodSync(stage,0o700);
    const archive=path.join(stage,'config-state.tar');
    const done=spawnSync('tar',['-cf',archive,...included],{cwd:root,stdio:['ignore','ignore','pipe'],maxBuffer:4096,timeout:180000});
    if(done.error||done.status!==0||!fs.existsSync(archive))throw Error('SNAPSHOT_FAILED');
    fs.chmodSync(archive,0o600);
    if(collected.some(x=>shaFile(path.join(root,x.path))!==x.sha256))throw Error('SOURCE_CHANGED');
    fs.writeFileSync(path.join(stage,'manifest.private.json'),JSON.stringify({version:1,fileCount:collected.length,bytes:total,files:collected},null,2),{mode:0o600,flag:'wx'});
    const digest=shaFile(archive);
    fs.writeFileSync(path.join(stage,'SHA256SUMS.private'),digest+'  config-state.tar\n',{mode:0o600,flag:'wx'});
    process.stdout.write('PRIVATE_CONFIG_SNAPSHOT_CREATED; ISOLATED_RESTORE_NOT_VERIFIED; NO_DEPLOY\n');
    stage=null;
  }finally{process.umask(umask);}
}catch(e){
  const allowed=['UNSAFE_SOURCE','REQUIRED_FILE_MISSING','UNSAFE_DESTINATION','CAPACITY_LIMIT','INSUFFICIENT_SPACE','SOURCE_CHANGED'];
  fail(allowed.includes(e?.message)?e.message:'SNAPSHOT_FAILED');
}finally{
  if(stage){try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}
}
