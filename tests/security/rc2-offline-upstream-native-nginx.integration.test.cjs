'use strict';
// Explicitly invoked, disposable native-nginx research fixture for issue #109.
// No Docker, owner paths, owner apps, public listeners, or production mutation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const NGINX='nginx';
const available=spawnSync(NGINX,['-v'],{encoding:'utf8',timeout:3000}).status===0;
async function freePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}
async function setup(body){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-p2-nginx-'));
 await fs.mkdir(path.join(root,'logs'));
 await fs.mkdir(path.join(root,'conf'));
 await fs.writeFile(path.join(root,'conf','nginx.conf'),body,{mode:0o600});
 return root;
}
function nginxCheck(root){
 return spawnSync(NGINX,['-t','-p',root+'/','-c','conf/nginx.conf'],{encoding:'utf8',timeout:10000});
}
async function request(port,url){
 return new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port,path:url,timeout:3500},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
   res.on('end',()=>resolve({status:res.statusCode,body}));
  });
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('request timeout')));
 });
}
async function healthReady(port){
 for(let i=0;i<35;i++){
  try{if((await request(port,'/health')).status===200)return true;}
  catch{}
  await new Promise(r=>setTimeout(r,50));
 }
 return false;
}
test('native nginx: static missing hostname rejects cold-start config', {skip:!available}, async t=>{
 const root=await setup(`events {}\nhttp { server { listen 127.0.0.1:12453; location /offline/ { proxy_pass http://never-exists-devproxy-p2.invalid:20423; } } }\n`);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const r=nginxCheck(root);
 assert.notEqual(r.status,0,'nginx -t must not silently accept unresolved static hostname');
 assert.match(r.stderr,/host not found in upstream/i);
});
test('native nginx: absent, delayed, returning backend affects route, never nginx master', {skip:!available,timeout:15000}, async t=>{
 const [proxyPort,backendPort]=await Promise.all([freePort(),freePort()]);
 const root=await setup(`events { worker_connections 64; }\nhttp { server { listen 127.0.0.1:${proxyPort}; location = /health { return 200 'ok'; } location /delayed/ { set $dynamic_backend 127.0.0.1:${backendPort}; proxy_pass http://$dynamic_backend; proxy_connect_timeout 1s; } } }\n`);
 let child,backend;
 t.after(async()=>{
  if(backend?.listening)await new Promise(resolve=>backend.close(resolve));
  if(child&&child.exitCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,1700))]);
   if(child.exitCode===null)child.kill('SIGKILL');
  }
  await fs.rm(root,{recursive:true,force:true});
 });
 assert.equal(nginxCheck(root).status,0);
 child=spawn(NGINX,['-p',root+'/','-c','conf/nginx.conf','-g','daemon off;'],{stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',d=>{stderr+=String(d).slice(0,1000);});
 assert.equal(await healthReady(proxyPort),true,'nginx health must become available');
 const pid=child.pid;
 assert.equal((await request(proxyPort,'/delayed/')).status,502);
 assert.equal((await request(proxyPort,'/health')).status,200);
 backend=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('backend-ready');});
 await new Promise((resolve,reject)=>backend.once('error',reject).listen(backendPort,'127.0.0.1',resolve));
 const active=await request(proxyPort,'/delayed/');
 assert.equal(active.status,200);assert.equal(active.body,'backend-ready');
 assert.equal(child.pid,pid);assert.equal(child.exitCode,null);
 await new Promise(resolve=>backend.close(resolve));
 assert.equal((await request(proxyPort,'/delayed/')).status,502);
 assert.equal((await request(proxyPort,'/health')).status,200);
 assert.equal(child.exitCode,null,'offline app may not take down nginx');
 assert.equal(stderr.includes('HOST_WORKER'),false);
});
