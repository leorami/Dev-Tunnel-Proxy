'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {checkEffectiveNginxConfigClosure,parseIncludeDirectives}=require('../../utils/rc1-effective-nginx-config-closure.cjs');

const MAIN=`user nginx;\nevents { worker_connections 1024; }\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n`;
const DEFAULT=`server { listen 80;\n include /etc/nginx/conf.d/sites-enabled/*.conf;\n location / { return 200 'include /not/a/directive'; }\n}\n`;
const BUNDLE=`# generated routes\nlocation /app/ { proxy_pass http://app:3000; }\n`;
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv9-closure-'));await fs.chmod(root,0o700);
 for(const p of ['build','build/sites-enabled','config'])await fs.mkdir(path.join(root,p),{mode:0o700});
 const files={main:path.join(root,'config/nginx.production.conf'),default:path.join(root,'config/default.production.conf'),bundle:path.join(root,'build/sites-enabled/apps.generated.conf')};
 for(const [k,s]of [['main',MAIN],['default',DEFAULT],['bundle',BUNDLE]])await fs.writeFile(files[k],s,{mode:0o600});
 return {root,files,close:()=>fs.rm(root,{recursive:true,force:true})};
}
const check=(f,opts={})=>checkEffectiveNginxConfigClosure({approvedRoot:f.root,...opts});

test('RED: validated original three-file candidate recognizes only intended include graph and remains NONLIVE',async()=>{
 const f=await fixture();try{const r=await check(f);assert.equal(r.code,'STATIC_CONFIG_CLOSURE_VERIFIED');assert.equal(r.productionChangeAuthorized,false);assert.equal(r.deployed,false);assert.equal(r.actualHostAttested,false);}
 finally{await f.close();}
});
test('rejects a second nginx-loadable .conf beside generated bundle, even though v6 signs same three files',async()=>{
 const f=await fixture();try{await fs.writeFile(path.join(f.root,'build/sites-enabled/rogue.conf'),'location /admin { return 200; }');assert.equal((await check(f)).code,'UNBOUND_NGINX_CONFIG_FILE');}
 finally{await f.close();}
});
test('rejects a symlinked extra .conf without following it',async()=>{
 const f=await fixture();try{await fs.symlink(f.files.main,path.join(f.root,'build/sites-enabled/other.conf'));assert.equal((await check(f)).code,'UNBOUND_NGINX_CONFIG_FILE');}
 finally{await f.close();}
});
test('rejects named route include redirect in generated bundle',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.bundle,'include /private/unbound.conf;\n');assert.equal((await check(f)).code,'UNBOUND_INCLUDE_DIRECTIVE');}
 finally{await f.close();}
});
test('rejects dynamically variable include in bundle',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.bundle,'include $route_config;\n');assert.equal((await check(f)).code,'UNBOUND_INCLUDE_DIRECTIVE');}
 finally{await f.close();}
});
test('rejects new main include even though main itself is content-hashed',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.main,'include /etc/nginx/extra.conf;\n');assert.equal((await check(f)).code,'UNBOUND_INCLUDE_DIRECTIVE');}
 finally{await f.close();}
});
test('rejects extra include under nested server block in default config',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.default,'location /x { include /tmp/x.conf; }\n');assert.equal((await check(f)).code,'UNBOUND_INCLUDE_DIRECTIVE');}
 finally{await f.close();}
});
test('rejects missing main wildcard include',async()=>{
 const f=await fixture();try{await fs.writeFile(f.files.main,MAIN.replace('include /etc/nginx/conf.d/*.conf;',''));assert.equal((await check(f)).code,'EXPECTED_NGINX_INCLUDE_MISSING');}
 finally{await f.close();}
});
test('rejects duplicated default wildcard include',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.default,'include /etc/nginx/conf.d/sites-enabled/*.conf;\n');assert.equal((await check(f)).code,'DUPLICATE_NGINX_INCLUDE');}
 finally{await f.close();}
});
test('ignores commented include and quoted text without treating either as config directive',async()=>{
 const f=await fixture();try{await fs.appendFile(f.files.bundle,'# include /private/evil.conf;\nadd_header X-Check "include /hidden.conf;";\n');assert.equal((await check(f)).code,'STATIC_CONFIG_CLOSURE_VERIFIED');}
 finally{await f.close();}
});
test('parses multiline and quoted fixed include without bypass',()=>{
 const directives=parseIncludeDirectives('http {\n  include\n "/etc/nginx/conf.d/*.conf";\n}\n');
 assert.deepEqual(directives,['/etc/nginx/conf.d/*.conf']);
});
test('blocks escaped directive name instead of overlooking a disguised include',()=>{
 assert.throws(()=>parseIncludeDirectives('in\\clude /tmp/evil.conf;'),/UNSUPPORTED_DIRECTIVE_ESCAPE/);
});
test('rejects concurrent conf file injection after first directory check',async()=>{
 const f=await fixture();try{
  const r=await check(f,{hostView:async()=>{await fs.writeFile(path.join(f.root,'build/sites-enabled/late.conf'),'evil');return null;}});
  assert.equal(r.code,'UNBOUND_NGINX_CONFIG_FILE');
 }finally{await f.close();}
});
test('rejects candidate content changes during external host-view callback',async()=>{
 const f=await fixture();try{
  const r=await check(f,{hostView:async()=>{await fs.appendFile(f.files.default,'# changed\n');return null;}});
  assert.equal(r.code,'CONFIG_SET_CHANGED_DURING_CLOSURE');
 }finally{await f.close();}
});
test('an untrusted or missing runtime loaded-conf view cannot establish actual host attestation',async()=>{
 const f=await fixture();try{
  const r=await check(f,{hostView:async()=>({anything:'yes'})});
  assert.equal(r.code,'RUNTIME_INCLUDE_CLOSURE_UNATTESTED');assert.equal(r.actualHostAttested,false);
 }finally{await f.close();}
});
test('a host-view claiming extra nginx conf paths is rejected, not release approved',async()=>{
 const f=await fixture();try{
  const r=await check(f,{hostView:async()=>({confD:['default.conf','shadow.conf'],siteEnabled:['apps.generated.conf']})});
  assert.equal(r.code,'RUNTIME_UNBOUND_NGINX_CONFIG');
 }finally{await f.close();}
});
test('an exactly constrained host callback is still source-only without owner runtime attestation',async()=>{
 const f=await fixture();try{
  const r=await check(f,{hostView:async()=>({confD:['default.conf'],siteEnabled:['apps.generated.conf']})});
  assert.equal(r.code,'HOST_CALLBACK_CONFIG_CLOSURE_REPORTED');assert.equal(r.actualHostAttested,false);
 }finally{await f.close();}
});
