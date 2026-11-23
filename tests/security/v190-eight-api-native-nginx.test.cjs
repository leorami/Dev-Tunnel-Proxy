'use strict';
/**
 * V190 — native Nginx semantic proof for PRIVATE API prefixes vs generic JSON
 * regex using disposable localhost-only synthetic routes/data. No owner host,
 * credentials, live config or private bytes. Baseline vulnerable vs guarded.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');
const IMAGE='nginx:1.26.3-alpine';
const PATHS=[
  '/devproxy/api/settings/auto-scan',
  '/devproxy/api/promotions',
  '/devproxy/api/ai/',
  '/devproxy/api/config/',
  '/devproxy/api/overrides/',
  '/devproxy/api/reports/',
  '/devproxy/api/resolve-conflict',
  '/devproxy/api/rename-route'
];
function getPort(){return new Promise((yes,no)=>{const s=net.createServer();s.once('error',no);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?no(e):yes(p));});});}
function req(port,endpoint,owner=false){
 return new Promise((resolve,reject)=>{
  const r=http.get({host:'127.0.0.1',port,path:endpoint,headers:owner?{Cookie:'owner=1'}:{},timeout:5000},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
  });r.on('error',reject);r.on('timeout',()=>r.destroy(new Error('http timeout')));
 });
}
function buildConfig(guarded){
 const locations=PATHS.map(p=>
   '    location '+(guarded?'^~ ':'')+p+' {\n'+
   '      auth_request /admin/check;\n'+
   '      error_page 401 = @login_redirect;\n'+
   '      root /usr/share/nginx/html;\n'+
   '    }\n'
 ).join('\n');
 return [
   'events { worker_connections 48; }',
   'http {',
   '  default_type application/json;',
   '  server {',
   '    listen 8080;',
   '    server_name _;',
   '    location = /admin/check {',
   '      internal;',
   '      if ($http_cookie ~* "owner=1") { return 200; }',
   '      return 401;',
   '    }',
   '    location @login_redirect { return 401 "login-required"; }',
   '    location = /health.json { return 200 "{\"status\":\"ok\"}"; }',
   '    location = /devproxy/api/ai/health { return 200 "{\"public\":true}"; }',
   '    location = /status.json {',
   '      auth_request /admin/check;',
   '      error_page 401 = @login_redirect;',
   '      root /usr/share/nginx/html;',
   '    }',
   '    location = /routes.json {',
   '      auth_request /admin/check;',
   '      error_page 401 = @login_redirect;',
   '      root /usr/share/nginx/html;',
   '    }',
   '    location /status/assets/ { root /usr/share/nginx/html; }',
   '    location ^~ /status {',
   '      auth_request /admin/check;',
   '      error_page 401 = @login_redirect;',
   '      root /usr/share/nginx/html;',
   '    }',
   locations,
   '    location ~* \\.(json)$ { root /usr/share/nginx/html; }',
   '  }',
   '}'
 ].join('\n')+'\n';
}
async function withServer(guarded,fn){
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'devproxy-v190-'));
 const html=path.join(root,'public'),port=await getPort(),name='v190-native-'+process.pid+'-'+port;
 const endpoints=PATHS.map(p=>p+(p.endsWith('/')?'proof.json':'/proof.json'));
 try{
  for(let i=0;i<endpoints.length;i++){
   const target=path.join(html,endpoints[i].slice(1));
   await fsp.mkdir(path.dirname(target),{recursive:true});
   await fsp.writeFile(target,JSON.stringify({source:'synthetic',route:i})+'\n');
  }
  await fsp.mkdir(path.join(html,'status','assets'),{recursive:true});
  await fsp.writeFile(path.join(html,'status','assets','logo.svg'),'<svg/>');
  await fsp.writeFile(path.join(html,'status.json'),'{"protected":true}');
  await fsp.writeFile(path.join(html,'routes.json'),'{"protected":true}');
  await fsp.writeFile(path.join(html,'public.json'),'{"public":true}');
  const nginx=path.join(root,'nginx.conf');
  await fsp.writeFile(nginx,buildConfig(guarded),{mode:0o600});
  const child=spawn('docker',[
   'run','--rm','--name',name,'--entrypoint','nginx',
   '-p','127.0.0.1:'+port+':8080',
   '-v',nginx+':/etc/nginx/nginx.conf:ro',
   '-v',html+':/usr/share/nginx/html:ro',
   IMAGE,'-g','daemon off;'
  ],{stdio:['ignore','pipe','pipe']});
  let errors='';
  child.stderr.on('data',d=>{errors=(errors+String(d)).slice(-2400);});
  let ready=false;
  for(let n=0;n<65;n++){
   if(child.exitCode!=null)break;
   try{if((await req(port,'/health.json')).status===200){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(ready,true,'native nginx startup failed: '+errors.slice(-600));
  await fn({get:(p,owner)=>req(port,p,owner),endpoints});
 }finally{
  spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:10000});
  await fsp.rm(root,{recursive:true,force:true});
 }
}
test('native-image prerequisite is real, never skipped',()=>{
 const result=spawnSync('docker',['image','inspect',IMAGE],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,'pinned native Nginx fixture image must exist; run docker pull first');
});
test('Nginx SOURCE-BASELINE semantics: ordinary private API prefixes lose to later JSON regex', {timeout:70000},async()=>{
 await withServer(false,async({get,endpoints})=>{
  for(const p of endpoints){
   const r=await get(p);
   assert.equal(r.status,200,'ordinary fallback exposes only SYNTHETIC JSON for '+p);
   assert.match(r.body,/synthetic/);
  }
 });
});
test('Nginx GUARDED semantics: eight private API prefixes require owner auth; public/exact behavior unchanged',{timeout:70000},async()=>{
 await withServer(true,async({get,endpoints})=>{
  for(const [i,p] of endpoints.entries()){
   assert.equal((await get(p)).status,401,'anonymous private '+p);
   const owner=await get(p,true);
   assert.equal(owner.status,200,'owner private '+p);
   assert.equal(JSON.parse(owner.body).route,i);
  }
  assert.equal((await get('/health.json')).status,200);
  assert.equal((await get('/devproxy/api/ai/health')).status,200);
  assert.equal((await get('/status.json')).status,401);
  assert.equal((await get('/routes.json')).status,401);
  assert.equal((await get('/status.json',true)).status,200);
  assert.equal((await get('/routes.json',true)).status,200);
  assert.equal((await get('/status/assets/logo.svg')).status,200);
  assert.equal((await get('/public.json')).status,200);
 });
});
