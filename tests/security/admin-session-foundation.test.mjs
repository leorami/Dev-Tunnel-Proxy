/** DEVPROXY-003A RED-first; no live server, secrets, Docker or owner files. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {
  safeAdminPasswordMatches,extractAdminSessionToken,adminSessionCookie,
  writeSecureSessionFile,readSecureSessionFile,adminRequestOriginAllowed,
}=require('../../utils/admin-session-security.cjs');
const secret='distinct-admin-password-'+'a'.repeat(35);
const token='a'.repeat(64);
const token2='b'.repeat(64);
function req(headers){return {headers};}
test('admin password valid string works, including deliberate Unicode',()=>{
 assert.equal(safeAdminPasswordMatches(secret,secret),true);
 assert.equal(safeAdminPasswordMatches('correct 🔒', 'correct 🔒'),true);
 assert.equal(safeAdminPasswordMatches('wrong','correct 🔒'),false);
});
test('wrong-sized and invalid password inputs fail without Buffer/timingSafeEqual throws',()=>{
 for(const x of ['','a','a'.repeat(200),secret+'x','🔒','🔒'.repeat(300),null,undefined,true,42,[],{},Buffer.from(secret)]){
   assert.doesNotThrow(()=>safeAdminPasswordMatches(x,secret));
   assert.equal(safeAdminPasswordMatches(x,secret),false);
 }
 assert.equal(safeAdminPasswordMatches('a'.repeat(20000),secret),false,'bound admin input size');
 assert.equal(safeAdminPasswordMatches(secret,null),false);
});
test('session cookie tokens accept only a complete exact 64-hex credential',()=>{
 assert.equal(extractAdminSessionToken(req({cookie:'admin_session='+token})),token);
 assert.equal(extractAdminSessionToken(req({cookie:'theme=dark; admin_session='+token+'; foo=1'})),token);
 for(const cookie of [
  'not_admin_session='+token,'xadmin_session='+token,
  'admin_session='+token+'x','admin_session='+token.slice(1),
  'admin_session='+token+';admin_session='+token2,
  'admin_session='+token+'; admin_session='+token,
  'admin_session='+token.toUpperCase(), 'admin_session=; foo=1'
 ])assert.equal(extractAdminSessionToken(req({cookie})),null,cookie.slice(0,36));
});
test('explicit 64-hex Bearer header overrides stale cookie, malformed bearer is denied',()=>{
 assert.equal(extractAdminSessionToken(req({authorization:'Bearer '+token2,cookie:'admin_session='+token})),token2);
 for(const authorization of ['Bearer x','bearer '+token,'Basic '+token,'Bearer '+token+'x','Bearer '+token+' ']){
  assert.equal(extractAdminSessionToken(req({authorization,cookie:'admin_session='+token})),null,authorization.slice(0,20));
 }
 assert.equal(extractAdminSessionToken(req({cookie:'theme=blue'})),null);
});
test('issued admin cookies use host-only HttpOnly SameSite Strict and Secure for public domain',()=>{
 let cookie=adminSessionCookie(token,{host:'your-proxy.example.ngrok.app'});
 for(const value of ['admin_session='+token,'HttpOnly','SameSite=Strict','Path=/','Secure','Max-Age=604800']){
  assert.ok(cookie.includes(value),value);
 }
 assert.doesNotMatch(cookie,/Domain=/);
 for(const host of ['localhost:8080','127.0.0.1:8080','[::1]:8080']){
   cookie=adminSessionCookie(token,{host});
   assert.doesNotMatch(cookie,/(?:^|; )Secure(?:;|$)/,host);
 }
 assert.match(adminSessionCookie(token,{host:'localhost.evil.test'}),/(?:^|; )Secure(?:;|$)/);
 const expire=adminSessionCookie('',{host:'example.ngrok.app',expire:true});
 assert.match(expire,/Max-Age=0/);
 assert.match(expire,/(?:^|; )Secure(?:;|$)/);
 assert.doesNotMatch(expire,/Domain=/);
});
test('session persistence is atomic 0600 and excludes expired/malformed tokens on reload',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy003a-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'admin-session.json');
 const now=Date.now();
 const entries=new Map([[token,{createdAt:now-1000,expiresAt:now+60000,lastUsed:now}],
  [token2,{createdAt:now-60000,expiresAt:now-1000,lastUsed:now-1000}],
  ['unsafe-key',{createdAt:now,expiresAt:now+60000,lastUsed:now}]]);
 writeSecureSessionFile(file,entries);
 assert.equal(fs.statSync(file).mode&0o077,0,'secret file permissions');
 assert.equal(fs.readdirSync(dir).filter(x=>x.includes('.tmp-')).length,0,'atomic temp cleaned');
 const recovered=readSecureSessionFile(file,now);
 assert.equal(recovered.size,1);
 assert.equal(recovered.has(token),true);
 assert.equal(recovered.has(token2),false);
 assert.equal(recovered.has('unsafe-key'),false);
 fs.chmodSync(file,0o644);
 const repaired=readSecureSessionFile(file,now);
 assert.equal(repaired.has(token),true);
 assert.equal(fs.statSync(file).mode&0o077,0,'insecure legacy file repaired');
});
test('session corruption does not forge admin authentication',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy003a-bad-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'sessions.json');
 fs.writeFileSync(file,'{"sessions":{"'+token+'":{"expiresAt":"forever"}}}');
 assert.equal(readSecureSessionFile(file).size,0);
 fs.writeFileSync(file,'invalid JSON');
 assert.equal(readSecureSessionFile(file).size,0);
});


test('a presented Origin must match the request host and an absent Origin stays usable',()=>{
 assert.equal(adminRequestOriginAllowed('127.0.0.1:18080', undefined), true);
 assert.equal(adminRequestOriginAllowed('127.0.0.1:18080', 'http://127.0.0.1:18080'), true);
 assert.equal(adminRequestOriginAllowed('127.0.0.1', 'http://127.0.0.1:18080'), true);
 assert.equal(adminRequestOriginAllowed('your-proxy.example.ngrok.app', 'https://your-proxy.example.ngrok.app'), true);
 for (const origin of ['https://evil.invalid','http://127.0.0.1:18080.evil','null','https://user:pass@127.0.0.1:18080','http://127.0.0.1:18081']) {
  assert.equal(adminRequestOriginAllowed('127.0.0.1:18080', origin), false, origin);
 }
});

test('actual management API uses the primitives, never unequal raw Buffer comparison or plaintext session overwrite',()=>{
 const server=fs.readFileSync(new URL('../../utils/proxyConfigAPI.js',import.meta.url),'utf8');
 assert.match(server,/safeAdminPasswordMatches\(password,\s*ADMIN_PASSWORD\)/);
 assert.doesNotMatch(server,/crypto\.timingSafeEqual\(\s*Buffer\.from\(password\)/);
 assert.match(server,/adminSessionCookie\(session\.token,\s*\{host:req\.headers\.host\}\)/);
 assert.match(server,/adminSessionCookie\('',\s*\{host:req\.headers\.host,expire:true\}\)/);
 assert.match(server,/writeSecureSessionFile\(SESSION_FILE,activeSessions\)/);
 assert.match(server,/readSecureSessionFile\(SESSION_FILE\)/);
 assert.doesNotMatch(server,/fs\.writeFileSync\(SESSION_FILE,\s*JSON\.stringify/);
 assert.match(server,/fs\.appendFileSync\(ENV_FILE, envLine, \{ encoding:'utf8',mode:0o600 \}\)/);
 assert.match(server,/fs\.chmodSync\(ENV_FILE,0o600\)/);
 assert.match(server,/adminRequestOriginAllowed\(req\.headers\.host,\s*req\.headers\.origin\)/);
});
