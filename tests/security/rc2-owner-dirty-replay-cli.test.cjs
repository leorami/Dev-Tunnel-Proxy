'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../../scripts/rc2-inspect-owner-dirty-replay.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-dirty-replay-cli-'));
 const liveRoot=path.join(root,'live'),archiveRestoreRoot=path.join(root,'restore'),privateSupplementRoot=path.join(root,'supplement');
 const parent=path.join(root,'private-rollbacks'),stage=path.join(parent,'owner-replay-Pv2n9B');
 for(const dir of [liveRoot,archiveRestoreRoot,privateSupplementRoot,parent,stage])fs.mkdirSync(dir,{mode:0o700});
 const pairs=[['docker-compose.yml','owner compose\n',0o644,'archive'],['smart-build.sh','#!/bin/sh\necho owner\n',0o755,'supplement']];
 for(const [rel,body,mode,kind]of pairs){for(const base of [liveRoot,kind==='archive'?archiveRestoreRoot:privateSupplementRoot]){fs.writeFileSync(path.join(base,rel),body,{mode});fs.chmodSync(path.join(base,rel),mode);}}
 const plan={sourceDirty:true,sourceHead:'e'.repeat(40),expectedDirtyCount:2,
  dirtyFiles:pairs.map(([p,data,mode])=>({path:p,sha256:sha(data),mode})),
  archiveDirtyPaths:['docker-compose.yml'],supplementDirtyPaths:['smart-build.sh'],liveRoot,archiveRestoreRoot,privateSupplementRoot};
 const planPath=path.join(stage,'plan.private.json');fs.writeFileSync(planPath,JSON.stringify(plan),{mode:0o600});fs.chmodSync(planPath,0o600);
 return {root,planPath,plan};
}
function run(...args){return spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:4500});}
test('RED CLI: privately verified exact source byte replay returns code and counts, no paths',()=>{
 const f=fixture();try{const p=run('--inspect','--plan',f.planPath);assert.equal(p.status,0,p.stderr);
 assert.match(p.stdout,/OWNER_DIRTY_BYTE_REPLAY_MATCHED/);
 assert.match(p.stdout,/filesVerified=2/);
 assert.equal(p.stdout.includes(f.root),false);assert.doesNotMatch(p.stdout,/docker-compose|smart-build|owner compose/);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('RED CLI: rejects world-readable private plan',()=>{
 const f=fixture();try{fs.chmodSync(f.planPath,0o644);const p=run('--inspect','--plan',f.planPath);assert.equal(p.status,2);assert.match(p.stdout,/BLOCKED/);}finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('RED CLI: refuses unapproved arbitrary plan location and extra arguments',()=>{
 const f=fixture();try{const target=path.join(f.root,'elsewhere.json');fs.copyFileSync(f.planPath,target);fs.chmodSync(target,0o600);
 assert.equal(run('--inspect','--plan',target).status,2);
 assert.equal(run('--inspect','--plan',f.planPath,'--execute').status,2);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('RED CLI: wrong directory ACL and symlink plan refused',()=>{
 const f=fixture();try{const stage=path.dirname(f.planPath);fs.chmodSync(stage,0o755);
 assert.equal(run('--inspect','--plan',f.planPath).status,2);
 fs.chmodSync(stage,0o700);const copy=path.join(stage,'copy.json');fs.renameSync(f.planPath,copy);fs.symlinkSync(copy,f.planPath);
 assert.equal(run('--inspect','--plan',f.planPath).status,2);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('RED CLI: changes to source after snapshot fail rather than GREEN',()=>{
 const f=fixture();try{fs.appendFileSync(path.join(f.plan.liveRoot,'smart-build.sh'),'changed\n');const p=run('--inspect','--plan',f.planPath);
 assert.equal(p.status,2);assert.match(p.stdout,/BLOCKED|MISMATCH/);assert.doesNotMatch(p.stdout,/changed/);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('RED CLI: malformed JSON or unexpected privilege flag never prints private content',()=>{
 const f=fixture();try{fs.writeFileSync(f.planPath,'{ BAD_SECRET');let p=run('--inspect','--plan',f.planPath);assert.equal(p.status,2);assert.doesNotMatch(p.stdout+p.stderr,/BAD_SECRET/);
 fs.writeFileSync(f.planPath,JSON.stringify({...f.plan,releaseAuthorized:true}));p=run('--inspect','--plan',f.planPath);assert.equal(p.status,2);assert.doesNotMatch(p.stdout,/releaseAuthorized:true/);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
