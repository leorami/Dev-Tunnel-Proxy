/** RED-first private config snapshot. Fixture HOME and repos only; never owner Mac paths. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const source = new URL('../../scripts/private-config-snapshot.mjs', import.meta.url).pathname;

function writeRepo(repo,{marker='OWNER_SECRET_MARKER_TEST_999',route='location /example {}\n'}={}){
  fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
  fs.mkdirSync(path.join(repo,'config'),{recursive:true});
  fs.mkdirSync(path.join(repo,'build','sites-enabled'),{recursive:true});
  fs.writeFileSync(path.join(repo,'scripts','private-config-snapshot.mjs'),fs.readFileSync(source));
  fs.writeFileSync(path.join(repo,'docker-compose.yml'),'services:\n  proxy: {}\n');
  fs.writeFileSync(path.join(repo,'config','default.conf'),'server {}\n');
  fs.writeFileSync(path.join(repo,'build','sites-enabled','apps.generated.conf'),route);
  fs.writeFileSync(path.join(repo,'.env'),marker);
  fs.utimesSync(path.join(repo,'config','default.conf'),new Date('2023-01-02T03:04:05Z'),new Date('2023-01-02T03:04:05Z'));
}

function setup(t){
  // Use /private/tmp so ancestor walks do not false-fail on macOS /var -> /private/var.
  const base=fs.mkdtempSync(path.join('/private/tmp','devproxy-recovery-fixture-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const home=path.join(base,'owner-home');
  const repo=path.join(base,'test-repo');
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  writeRepo(repo);
  const output=path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks');
  const approved=['--execute','--owner-approved','--source-root',repo];
  const run=(args=[],extraEnv={})=>spawnSync(process.execPath,[path.join(repo,'scripts','private-config-snapshot.mjs'),...args],{
    env:{...process.env,HOME:home,...extraEnv},encoding:'utf8',timeout:15000
  });
  return {base,home,repo,output,approved,run};
}

test('default is completely inert', t=>{
  const f=setup(t);const r=f.run();
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/NO_CONFIG_SNAPSHOT/);
  assert.equal(fs.existsSync(f.output),false);
});

test('explicit action without owner flag is rejected', t=>{
  const f=setup(t);const r=f.run(['--execute']);
  assert.equal(r.status,2);
  assert.match(r.stdout,/OWNER_APPROVAL_REQUIRED/);
  assert.equal(fs.existsSync(f.output),false);
});

test('execute with owner flag but without source-root is rejected', t=>{
  const f=setup(t);const r=f.run(['--execute','--owner-approved']);
  assert.equal(r.status,2);
  assert.match(r.stdout,/OWNER_APPROVAL_REQUIRED|SOURCE_ROOT_REQUIRED/);
  assert.equal(fs.existsSync(f.output),false);
});

test('extra arguments and wrong order are rejected',t=>{
  const f=setup(t);
  for(const args of [
    ['--execute','--owner-approved','--path=/tmp'],
    ['--owner-approved','--execute'],
    ['--execute','--wrong'],
    ['--execute','--owner-approved','--source-root',f.repo,'--extra'],
  ]) assert.equal(f.run(args).status,2,args.join(' '));
  assert.equal(fs.existsSync(f.output),false);
});

test('relative source-root is rejected',t=>{
  const f=setup(t);
  const r=f.run(['--execute','--owner-approved','--source-root','relative/repo']);
  assert.equal(r.status,2);
  assert.match(r.stdout,/UNSAFE_SOURCE_ROOT/);
  assert.equal(fs.existsSync(f.output),false);
});

test('missing critical generated routes fail before writing archive',t=>{
  const f=setup(t);
  fs.rmSync(path.join(f.repo,'build','sites-enabled','apps.generated.conf'));
  const r=f.run(f.approved);
  assert.equal(r.status,2);
  assert.match(r.stdout,/REQUIRED_FILE_MISSING/);
  assert.equal(fs.existsSync(f.output),false);
});

test('nested symlink to outside data is rejected, not followed',t=>{
  const f=setup(t);
  fs.symlinkSync('/etc/passwd',path.join(f.repo,'config','outside'));
  const r=f.run(f.approved);
  assert.equal(r.status,2);
  assert.match(r.stdout,/UNSAFE_SOURCE/);
  assert.equal(fs.existsSync(f.output),false);
});

test('symlinked private destination ancestor is rejected',t=>{
  const f=setup(t);
  const outside=path.join(f.base,'outside');fs.mkdirSync(outside);
  fs.symlinkSync(outside,path.join(f.home,'Library'));
  const r=f.run(f.approved);
  assert.equal(r.status,2);
  assert.match(r.stdout,/UNSAFE_DESTINATION/);
  assert.equal(fs.readdirSync(outside).length,0);
});

test('preexisting public-readable archive destination is rejected',t=>{
  const f=setup(t);
  fs.mkdirSync(f.output,{recursive:true});
  fs.chmodSync(f.output,0o755);
  const r=f.run(f.approved);
  assert.equal(r.status,2);
  assert.match(r.stdout,/UNSAFE_DESTINATION/);
  assert.equal(fs.readdirSync(f.output).length,0);
});

test('archives the explicit source-root owner checkout, not the script candidate tree',t=>{
  const f=setup(t);
  const owner=path.join(f.base,'owner-actual');
  writeRepo(owner,{marker:'OWNER_ACTUAL_SECRET_MARKER',route:'location /owner-actual {}\n'});
  // Candidate tree keeps a different secret; script still lives only under f.repo.
  const r=f.run(['--execute','--owner-approved','--source-root',owner]);
  assert.equal(r.status,0,r.stderr+' '+r.stdout);
  assert.match(r.stdout,/PRIVATE_CONFIG_SNAPSHOT_CREATED/);
  assert.doesNotMatch(r.stdout+r.stderr,/OWNER_ACTUAL_SECRET_MARKER|OWNER_SECRET_MARKER_TEST_999/);
  const dir=path.join(f.output,fs.readdirSync(f.output)[0]);
  const restored=path.join(f.base,'isolated-owner');fs.mkdirSync(restored);
  assert.equal(spawnSync('tar',['-xf',path.join(dir,'config-state.tar'),'-C',restored]).status,0);
  assert.equal(fs.readFileSync(path.join(restored,'.env'),'utf8'),'OWNER_ACTUAL_SECRET_MARKER');
  assert.equal(fs.readFileSync(path.join(restored,'build','sites-enabled','apps.generated.conf'),'utf8'),'location /owner-actual {}\n');
  assert.notEqual(fs.existsSync(path.join(restored,'scripts','private-config-snapshot.mjs')) &&
    fs.readFileSync(path.join(f.repo,'.env'),'utf8')==='OWNER_SECRET_MARKER_TEST_999' &&
    fs.readFileSync(path.join(restored,'.env'),'utf8')==='OWNER_SECRET_MARKER_TEST_999', true);
});

test('symlinked source-root ancestor is rejected',t=>{
  const f=setup(t);
  const real=path.join(f.base,'real-owner');
  writeRepo(real);
  const linkParent=path.join(f.base,'link-parent');
  fs.mkdirSync(linkParent);
  fs.symlinkSync(real,path.join(linkParent,'owner'));
  const r=f.run(['--execute','--owner-approved','--source-root',path.join(linkParent,'owner')]);
  assert.equal(r.status,2,r.stdout);
  assert.match(r.stdout,/UNSAFE_SOURCE_ROOT/);
  assert.equal(fs.existsSync(f.output),false);
});

test('mode or mtime change during tar fails closed as SOURCE_CHANGED',t=>{
  const f=setup(t);
  const bin=path.join(f.base,'bin');fs.mkdirSync(bin,{mode:0o700});
  const realTar=spawnSync('bash',['-lc','command -v tar'],{encoding:'utf8'}).stdout.trim();
  fs.writeFileSync(path.join(bin,'tar'),`#!/bin/sh
target="$FAKE_MUTATE_FILE"
if [ -n "$target" ] && [ -f "$target" ]; then
  chmod 600 "$target"
  touch -t 202401020304.05 "$target"
fi
exec "${realTar}" "$@"
`,{mode:0o700});
  const r=f.run(f.approved,{
    PATH:bin+path.delimiter+process.env.PATH,
    FAKE_MUTATE_FILE:path.join(f.repo,'config','default.conf'),
  });
  assert.equal(r.status,2,r.stdout);
  assert.match(r.stdout,/SOURCE_CHANGED/);
  if(fs.existsSync(f.output)){
    for(const name of fs.readdirSync(f.output)){
      assert.equal(fs.existsSync(path.join(f.output,name,'config-state.tar')),false);
    }
  }
});

test('directory replaced by symlink during tar fails closed',t=>{
  const f=setup(t);
  const bin=path.join(f.base,'bin');fs.mkdirSync(bin,{mode:0o700});
  const realTar=spawnSync('bash',['-lc','command -v tar'],{encoding:'utf8'}).stdout.trim();
  const outside=path.join(f.base,'outside-config');fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside,'default.conf'),'LEAK\n');
  fs.writeFileSync(path.join(bin,'tar'),`#!/bin/sh
cfg="$FAKE_SWAP_DIR"
if [ -n "$cfg" ] && [ -d "$cfg" ]; then
  rm -rf "$cfg"
  ln -s "$FAKE_SWAP_TARGET" "$cfg"
fi
exec "${realTar}" "$@"
`,{mode:0o700});
  const r=f.run(f.approved,{
    PATH:bin+path.delimiter+process.env.PATH,
    FAKE_SWAP_DIR:path.join(f.repo,'config'),
    FAKE_SWAP_TARGET:outside,
  });
  assert.equal(r.status,2,r.stdout);
  assert.match(r.stdout,/SOURCE_CHANGED|UNSAFE_SOURCE/);
  if(fs.existsSync(f.output)){
    for(const name of fs.readdirSync(f.output)){
      assert.equal(fs.existsSync(path.join(f.output,name,'config-state.tar')),false);
    }
  }
});

test('approved fixture creates private archive, hashes, preserves mtimes and secret confinement',t=>{
  const f=setup(t);
  const r=f.run(f.approved);
  assert.equal(r.status,0,r.stderr+' '+r.stdout);
  assert.match(r.stdout,/PRIVATE_CONFIG_SNAPSHOT_CREATED/);
  assert.match(r.stdout,/NO_DEPLOY/);
  assert.doesNotMatch(r.stdout+r.stderr,/OWNER_SECRET_MARKER_TEST_999|\/Users\/|\.env/);
  const dirs=fs.readdirSync(f.output);assert.equal(dirs.length,1);
  const dir=path.join(f.output,dirs[0]);
  const tar=path.join(dir,'config-state.tar');
  const manifestPath=path.join(dir,'manifest.private.json');
  const digestPath=path.join(dir,'SHA256SUMS.private');
  for(const d of [f.output,dir])assert.equal(fs.statSync(d).mode&0o077,0);
  for(const x of [tar,manifestPath,digestPath])assert.equal(fs.statSync(x).mode&0o077,0);
  const expected=crypto.createHash('sha256').update(fs.readFileSync(tar)).digest('hex');
  assert.match(fs.readFileSync(digestPath,'utf8'),new RegExp(expected));
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.ok(manifest.files.some(x=>x.path==='.env'));
  assert.ok(manifest.files.some(x=>x.path==='build/sites-enabled/apps.generated.conf'));
  assert.equal(typeof manifest.sourceRoot,'string');
  assert.ok(manifest.sourceRoot.length>0);
  assert.doesNotMatch(JSON.stringify(manifest),/OWNER_SECRET_MARKER_TEST_999/);
  const restored=path.join(f.base,'isolated-restore');fs.mkdirSync(restored);
  const result=spawnSync('tar',['-xf',tar,'-C',restored],{encoding:'utf8',timeout:9000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(path.join(restored,'.env'),'utf8'),'OWNER_SECRET_MARKER_TEST_999');
  assert.equal(fs.readFileSync(path.join(restored,'build','sites-enabled','apps.generated.conf'),'utf8'),'location /example {}\n');
  assert.equal(fs.statSync(path.join(restored,'config','default.conf')).mtime.toISOString(),'2023-01-02T03:04:05.000Z');
  for(const file of manifest.files){
    const abs=path.join(restored,file.path);
    const st=fs.lstatSync(abs);
    assert.equal(st.isFile(),true,file.path);
    assert.equal(st.mode&0o777,file.mode,file.path);
    // ustar stores whole seconds; source post-tar recheck still uses exact mtimeMs.
    assert.equal(Math.trunc(st.mtimeMs/1000),Math.trunc(file.mtimeMs/1000),file.path);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'),file.sha256);
  }
});
