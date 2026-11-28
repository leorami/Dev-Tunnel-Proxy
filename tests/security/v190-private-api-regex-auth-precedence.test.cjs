'use strict';
/**
 * V190 — exact-preimage, SOURCE-ONLY private API Nginx regex precedence.
 * Genuine 8-prefix source RED before correction. No owner host/network access.
 * A release still requires effective nginx -T, native route tests, owner GO,
 * rollback and unchanged public exception proof.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const MAIN='590bcf2a980b434f533ddacac43a24a777a933e7';
const CONFIGS=Object.freeze([
  ['default.conf','03fc40e9b461163040b2473ef8ae4215ada9d63a'],
  ['default.production.conf','d3d64a9c84ed64265abccee95a46e4c712ef67c1']
]);
const PROTECTED=Object.freeze([
  '/devproxy/api/settings/auto-scan',
  '/devproxy/api/promotions',
  '/devproxy/api/ai/',
  '/devproxy/api/config/',
  '/devproxy/api/overrides/',
  '/devproxy/api/reports/',
  '/devproxy/api/resolve-conflict',
  '/devproxy/api/rename-route'
]);
function gitSource(name){
  // Bytes of config/<name> at protected main. A hosted checkout of this branch
  // is shallow and does not contain that commit, so the blob is stored next to
  // the test. sha() still has to match the pinned blob.
  const file=path.join(__dirname,'fixtures/v190-main-nginx',name);
  if(!fs.existsSync(file))throw new Error('missing '+MAIN+' preimage '+name);
  return fs.readFileSync(file,'utf8');
}
function worktree(name){return fs.readFileSync(path.join(root,'config',name),'utf8');}
function sha(source){const b=Buffer.from(source);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
function count(s,word){return s.split(word).length-1;}
function block(s,opening){
  const start=s.indexOf(opening);
  if(start<0||s.indexOf(opening,start+1)!==-1)return null;
  const brace=s.indexOf('{',start);
  let depth=1;
  for(let i=brace+1;i<s.length;i++){if(s[i]==='{')depth++;if(s[i]==='}'&&--depth===0)return s.slice(start,i+1);}
  return null;
}
test('real protected main has exact preimage Git blob for BOTH Nginx configs',()=>{
  for(const [file,blob] of CONFIGS)assert.equal(sha(gitSource(file)),blob,file);
});
test('RED until changed: eight private API prefixes in BOTH configs have ^~ precedence over generic JSON regex',()=>{
  for(const [file] of CONFIGS){
    const s=worktree(file);
    for(const prefix of PROTECTED){
      const proper='location ^~ '+prefix+' {';
      assert.equal(count(s,proper),1,file+': missing exactly one secure '+proper);
      assert.equal(count(s,'location '+prefix+' {'),0,file+': stale ordinary '+prefix);
      const b=block(s,proper);
      assert.ok(b,file+': missing unambiguous protected block for '+prefix);
      assert.match(b,/auth_request\s+\/admin\/check\s*;/,file+' '+prefix+': auth_request lost');
      assert.match(b,/error_page\s+401\s*=\s*@login_redirect\s*;/,file+' '+prefix+': auth redirect lost');
      assert.match(b,/proxy_pass\s+http/,file+' '+prefix+': existing API proxy behavior lost');
    }
  }
});
test('RED until changed: source differs from reviewed protected main ONLY in sixteen caret insertions',()=>{
  for(const [file] of CONFIGS){
    const old=gitSource(file);
    let expected=old;
    for(const p of PROTECTED){
      const from='location '+p+' {';
      assert.equal(count(old,from),1,'baseline '+file+' must contain exactly one '+p);
      assert.equal(count(old,'location ^~ '+p+' {'),0,'baseline '+file+' was already migrated for '+p);
      expected=expected.replace(from,'location ^~ '+p+' {');
    }
    assert.equal(worktree(file),expected,file+': unexpected source modification outside exactly 8 protections');
  }
});
test('no route narrowing: public/exact JSON and four accepted UI ^~ remain',()=>{
  for(const [file] of CONFIGS){
    const src=worktree(file),before=gitSource(file);
    for(const token of [
      'location = /health.json {',
      'location = /status.json {',
      'location = /routes.json {',
      'location = /devproxy/api/ai/health {',
      'location /status/assets/ {',
      'location ^~ /status {',
      'location ^~ /health {',
      'location ^~ /reports {',
      'location ^~ /dashboard {',
      'location ~* \\.(json)$ {'
    ]){
      assert.ok(before.includes(token),'baseline '+file+' absent: '+token);
      assert.ok(src.includes(token),'migration '+file+' must preserve: '+token);
    }
    for(const prefix of PROTECTED){
      const oldForm=src.replaceAll('location ^~ '+prefix+' {','location '+prefix+' {');
      const unchanged=block(oldForm,'location '+prefix+' {');
      assert.ok(unchanged,file+': matching API block intact');
      assert.match(unchanged,/auth_request\s+\/admin\/check\s*;/);
    }
  }
});
