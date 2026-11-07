'use strict';
/**
 * Disposable nginx -t runner for candidate route text. Uses a throwaway
 * docker nginx container with a bind-mounted temp config. Never targets live
 * RC1, never reloads production, never opens docker.sock from the API process
 * (caller decides isolation). Returns structured proof, not a bare boolean.
 */
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');

async function runDisposableNginxSyntaxTest({routeConfig,image='nginx:1.26.3-alpine'}={}){
 if(typeof routeConfig!=='string'||!routeConfig.length||
    Buffer.byteLength(routeConfig,'utf8')>256*1024||/[\u0000]/.test(routeConfig)||
    typeof image!=='string'||!/^nginx:[A-Za-z0-9._-]{1,64}$/.test(image))
  return Object.freeze({ok:false,exitCode:null,engine:'nginx-t-disposable',code:'INVALID_INPUT'});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv92-ngx-'));
 const confPath=path.join(root,'nginx.conf');
 const main=`events{}\nhttp {\n  server {\n    listen 8080;\n${routeConfig}\n  }\n}\n`;
 try{
  await fs.writeFile(confPath,main,{mode:0o600});
  const result=await new Promise(resolve=>{
   const child=spawn('docker',['run','--rm','-v',`${confPath}:/etc/nginx/nginx.conf:ro`,
    image,'nginx','-t'],{stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';
   const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}
     resolve({ok:false,exitCode:null,engine:'nginx-t-disposable',code:'TIMEOUT'});},20000);
   child.stdout.on('data',d=>{stdout+=d;});
   child.stderr.on('data',d=>{stderr+=d;});
   child.on('error',()=>{clearTimeout(timer);
     resolve({ok:false,exitCode:null,engine:'nginx-t-disposable',code:'DOCKER_SPAWN_FAILED'});});
   child.on('close',code=>{clearTimeout(timer);
     const text=`${stdout}\n${stderr}`;
     const ok=code===0&&/syntax is ok/i.test(text)&&/test is successful/i.test(text);
     resolve(Object.freeze({
      ok,exitCode:code,engine:'nginx-t-disposable',
      code:ok?'NGINX_SYNTAX_OK':'NGINX_SYNTAX_FAILED'
     }));
   });
  });
  return result;
 }finally{
  await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
 }
}

module.exports={runDisposableNginxSyntaxTest};
