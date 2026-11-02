/** RED FIRST. Runs only against a generated fake Docker executable under a disposable HOME. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('../../scripts/private-rollback-export.mjs',import.meta.url).pathname;
const ids=[
 'sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634',
 'sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e',
 'sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa',
];
function fixture(t,{badId=false}={}){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-export-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const bin=path.join(home,'bin');fs.mkdirSync(bin,{mode:0o700});
 const log=path.join(home,'fake-docker-log');
 const commands=[
 '#!/bin/sh',
 'case "$1 $2" in',
 ' "container inspect")',
 '   case "$5" in',
 '    dev-proxy) printf "%s\\n" "'+(badId?'sha256:'+('0'.repeat(64)):ids[0])+'" ;;',
 '    dev-proxy-config-api) printf "%s\\n" "'+ids[1]+'" ;;',
 '    dev-ngrok) printf "%s\\n" "'+ids[2]+'" ;;',
 '    *) exit 40 ;;',
 '   esac ;;',
 ' "image inspect")',
 '   case "$5" in',
 ...ids.map(id=>'    '+id+') printf "%s\\n" "'+id+'" ;;'),
 '    *) exit 41 ;;',
 '   esac ;;',
 ' "image save") printf "%0600d" 1 ;;',
 ' *) exit 42 ;;',
 'esac',
 'printf "%s\\n" "$1 $2" >> "$DEVPROXY_FAKE_DOCKER_LOG"',
 ''
 ].join('\n');
 const fake=path.join(bin,'docker');fs.writeFileSync(fake,commands,{mode:0o700});
 const env={...process.env,HOME:home,PATH:bin+path.delimiter+process.env.PATH,DEVPROXY_FAKE_DOCKER_LOG:log};
 const run=(args=[])=>spawnSync(process.execPath,[script,...args],{env,encoding:'utf8',timeout:12000});
 return {home,log,run,privateRoot:path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks')};
}
test('default is plan-only: never touches Docker or creates archive directory',t=>{
 const f=fixture(t);
 const r=f.run();
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/NO_EXPORT_PERFORMED/);
 assert.equal(fs.existsSync(f.log),false);
 assert.equal(fs.existsSync(f.privateRoot),false);
});
test('explicit execute alone is denied absent separate owner approval flag',t=>{
 const f=fixture(t);
 const r=f.run(['--execute']);
 assert.equal(r.status,2);
 assert.match(r.stdout,/OWNER_APPROVAL_REQUIRED/);
 assert.equal(fs.existsSync(f.log),false);
 assert.equal(fs.existsSync(f.privateRoot),false);
});
test('malformed or partial command flags cannot trigger Docker',t=>{
 const f=fixture(t);
 for(const args of [['--owner-approved'],['--execute','--wrong'],['--execute','--owner-approved','--extra']]){
  const r=f.run(args);assert.equal(r.status,2,args.join(' '));
 }
 assert.equal(fs.existsSync(f.log),false);
});
test('a changed installed container image ID refuses export before image save',t=>{
 const f=fixture(t,{badId:true});
 const r=f.run(['--execute','--owner-approved']);
 assert.equal(r.status,2,r.stdout);
 assert.match(r.stdout,/IMAGE_ID_MISMATCH/);
 const invoked=fs.readFileSync(f.log,'utf8');
 assert.doesNotMatch(invoked,/image save/);
 assert.equal(fs.existsSync(f.privateRoot),false,'do not create private archive before identifying running images');
});
test('symlinked home storage path cannot redirect archive into web-accessible area',t=>{
 const f=fixture(t);
 const outside=path.join(f.home,'public');fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.join(f.home,'Library'));
 const r=f.run(['--execute','--owner-approved']);
 assert.equal(r.status,2,r.stdout);
 assert.match(r.stdout,/UNSAFE_PRIVATE_DIRECTORY/);
 assert.equal(fs.readdirSync(outside).length,0);
 assert.equal(fs.existsSync(f.log),false);
});
test('a previously world-readable archive root fails closed',t=>{
 const f=fixture(t);
 fs.mkdirSync(f.privateRoot,{recursive:true});
 fs.chmodSync(f.privateRoot,0o755);
 const r=f.run(['--execute','--owner-approved']);
 assert.equal(r.status,2,r.stdout);
 assert.match(r.stdout,/UNSAFE_PRIVATE_DIRECTORY/);
 assert.equal(fs.existsSync(f.log),false);
});
test('approved fixture-only export writes private archive and hash receipt; no restore or deploy',t=>{
 const f=fixture(t);
 const r=f.run(['--execute','--owner-approved']);
 assert.equal(r.status,0,r.stderr+' '+r.stdout);
 assert.match(r.stdout,/PRIVATE_EXPORT_CREATED/);
 assert.match(r.stdout,/RESTORE_NOT_VERIFIED/);
 assert.match(r.stdout,/NO_DEPLOY/);
 assert.doesNotMatch(r.stdout,/sha256:|https?:|\/Users\/|FAKE_DOCKER_IMAGE_ARCHIVE/);
 const out=fs.readdirSync(f.privateRoot);
 assert.equal(out.length,1,'one run directory');
 const folder=path.join(f.privateRoot,out[0]);
 const archive=path.join(folder,'rollback-images.tar');
 const receipt=path.join(folder,'SHA256SUMS.private');
 assert.equal(fs.statSync(f.privateRoot).mode&0o077,0);
 assert.equal(fs.statSync(folder).mode&0o077,0);
 assert.equal(fs.statSync(archive).mode&0o077,0);
 assert.equal(fs.statSync(receipt).mode&0o077,0);
 assert.equal(fs.readFileSync(archive).length,600);
 assert.match(fs.readFileSync(receipt,'utf8'),/rollback-images\.tar/);
 const logs=fs.readFileSync(f.log,'utf8');
 assert.equal((logs.match(/image save/g)||[]).length,1);
 assert.doesNotMatch(logs,/image load|prune|compose|restart|stop|start/);
});
