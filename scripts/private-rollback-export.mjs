#!/usr/bin/env node
/**
 * RC1 OFFLINE image snapshot. Zero side effects without both explicit flags.
 * An execution flag is NOT owner authorization: run only after the owner has
 * explicitly approved private image export for this exact release.
 * No Docker config/env/secrets/labels/mounts are read or logged.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const IMAGES=Object.freeze([
  Object.freeze({container:'dev-proxy',id:'sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634'}),
  Object.freeze({container:'dev-proxy-config-api',id:'sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e'}),
  Object.freeze({container:'dev-ngrok',id:'sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa'}),
]);
const argv=process.argv.slice(2);
if(argv.length===0){
  process.stdout.write('NO_EXPORT_PERFORMED; OWNER_APPROVAL_REQUIRED; NO_DEPLOY\n');
  process.exit(0);
}
if(argv.length!==2 || argv[0]!=='--execute'||argv[1]!=='--owner-approved'){
  process.stdout.write('OWNER_APPROVAL_REQUIRED; NO_EXPORT_PERFORMED\n');
  process.exit(2);
}
function fail(code){
  process.stdout.write(code+'; NO_DEPLOY\n');
  process.exitCode=2;
}
function dockerMeta(args){
  const result=spawnSync('docker',args,{
    encoding:'utf8',timeout:20000,maxBuffer:4096,
    stdio:['ignore','pipe','pipe'],
  });
  if(result.error||result.status!==0)return null;
  return typeof result.stdout==='string'?result.stdout.trim():null;
}
function verifyRunningImages(){
  for(const item of IMAGES){
    const actual=dockerMeta(['container','inspect','--format','{{.Image}}',item.container]);
    if(actual!==item.id)return false;
    const image=dockerMeta(['image','inspect','--format','{{.Id}}',item.id]);
    if(image!==item.id)return false;
  }
  return true;
}
function privateRoot(){
  const home=os.homedir();
  if(!path.isAbsolute(home))throw new Error('UNSAFE_PRIVATE_DIRECTORY');
  const root=path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks');
  let current=path.resolve(home);
  // No symlink at any existing ancestor, especially Library or Application Support.
  for(const segment of path.relative(current,root).split(path.sep)){
    current=path.join(current,segment);
    try{
      const st=fs.lstatSync(current);
      if(st.isSymbolicLink()||!st.isDirectory())throw new Error('UNSAFE_PRIVATE_DIRECTORY');
    }catch(error){
      if(error.code!=='ENOENT')throw error;
    }
  }
  if(fs.existsSync(root)){
    const st=fs.lstatSync(root);
    if(!st.isDirectory()||(st.mode&0o077)||
       (typeof process.getuid==='function' && st.uid!==process.getuid())){
      throw new Error('UNSAFE_PRIVATE_DIRECTORY');
    }
  }
  return root;
}
async function sha256File(file){
  const hash=createHash('sha256');
  const stream=fs.createReadStream(file);
  for await(const chunk of stream)hash.update(chunk);
  return hash.digest('hex');
}
let stage=null;
try{
  // Validate the path before even querying Docker and never follow symlinked
  // storage ancestors. No directory is created if any image has changed.
  const root=privateRoot();
  if(!verifyRunningImages()){
    fail('IMAGE_ID_MISMATCH');
  }else{
    const oldUmask=process.umask(0o077);
    try{
      fs.mkdirSync(root,{recursive:true,mode:0o700});
      // Compare canonical paths. path.resolve leaves macOS prefixes such as
      // /var -> /private/var unresolved, so a literal inequality rejects a
      // normal temporary HOME. A symlinked Library or private-rollbacks
      // segment was already rejected by lstat above; this still rejects a
      // swap that makes the created directory resolve outside HOME.
      const home=os.homedir();
      const relative=path.relative(path.resolve(home),path.resolve(root));
      if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('UNSAFE_PRIVATE_DIRECTORY');
      if(fs.realpathSync(root)!==path.resolve(fs.realpathSync(home),relative)){
        throw new Error('UNSAFE_PRIVATE_DIRECTORY');
      }
      const st=fs.lstatSync(root);
      if(!st.isDirectory()||(st.mode&0o077)||
         (typeof process.getuid==='function' && st.uid!==process.getuid())){
        throw new Error('UNSAFE_PRIVATE_DIRECTORY');
      }
      stage=fs.mkdtempSync(path.join(root,'release-'));
      fs.chmodSync(stage,0o700);
      const archive=path.join(stage,'rollback-images.tar');
      // Explicit owner-private file before Docker writes anything.
      const fd=fs.openSync(archive,'wx',0o600);
      let saved;
      try{
        saved=spawnSync('docker',['image','save',...IMAGES.map(x=>x.id)],{
          stdio:['ignore',fd,'pipe'],timeout:180000,maxBuffer:8192,
        });
        fs.fsyncSync(fd);
      }finally{fs.closeSync(fd);}
      if(saved.error||saved.status!==0||fs.statSync(archive).size<512){
        throw new Error('PRIVATE_IMAGE_SAVE_FAILED');
      }
      // A changed live image during export invalidates this release evidence.
      if(!verifyRunningImages())throw new Error('IMAGE_ID_CHANGED_DURING_EXPORT');
      const digest=await sha256File(archive);
      fs.writeFileSync(path.join(stage,'SHA256SUMS.private'),
        digest+'  rollback-images.tar\n',{encoding:'utf8',mode:0o600,flag:'wx'});
      // A created tar and digest are NOT a proved restore; a distinct
      // disposable-daemon restore test and owner UAT still govern rollout.
      process.stdout.write('PRIVATE_EXPORT_CREATED; RESTORE_NOT_VERIFIED; NO_DEPLOY\n');
      stage=null;
    }finally{process.umask(oldUmask);}
  }
}catch(error){
  const isStorage=error?.message==='UNSAFE_PRIVATE_DIRECTORY';
  fail(isStorage?'UNSAFE_PRIVATE_DIRECTORY':'PRIVATE_EXPORT_FAILED');
}finally{
  // Delete only an incomplete run folder that this invocation alone created.
  if(stage){
    try{fs.rmSync(stage,{recursive:true,force:true});}catch{}
  }
}
