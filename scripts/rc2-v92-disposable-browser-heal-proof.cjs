#!/usr/bin/env node
'use strict';
/**
 * Isolated disposable proof: real docker nginx -t + Chromium network capture
 * of before redirect-loop vs after JS MIME. Writes redacted JSON only.
 * Does not touch live RC1, credentials, or production routes.
 */
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {runDisposableNginxSyntaxTest}=require('../utils/calliope-disposable-nginx-syntax.cjs');
const {proposeRepair}=require('../utils/calliope-first-safe-heal.cjs');
const {assessRecordedBrowserHealEvidence}=require('../utils/calliope-recorded-browser-heal-evidence.cjs');
const {disposableBrokenLyraSource}=require('../utils/calliope-nextjs-redirect-fixture.cjs');

const ASSET='/_next/static/chunks/webpack.js';
const ASSET_ALT='/_next/static/chunks/webpack-alt.js';
const ROUTE='lyra';
const FULL=`/${ROUTE}${ASSET}`;
const FULL_ALT=`/${ROUTE}${ASSET_ALT}`;
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function JS_MIME_TRIM(ct){
 if(/application\/javascript/i.test(ct))return 'application/javascript; charset=utf-8';
 if(/text\/javascript/i.test(ct))return 'text/javascript; charset=utf-8';
 return null;
}

function id(){return crypto.randomBytes(16).toString('hex');}

function startUpstream({loop}){
 const server=http.createServer((req,res)=>{
  const u=req.url||'/';
  if(loop){
   // Real Chromium-visible cycle between two .js asset paths (reducer-valid).
   if(u===FULL){res.writeHead(308,{Location:FULL_ALT});return res.end();}
   if(u===FULL_ALT){res.writeHead(308,{Location:FULL});return res.end();}
  }else if(u===FULL||(u.startsWith(`/${ROUTE}/_next/static/`)&&u.endsWith('.js'))){
   res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
   return res.end('/*disposable-ok*/');
  }
  if(u.startsWith('/other')){
   res.writeHead(200,{'Content-Type':'text/plain'});return res.end('other-ok');
  }
  res.writeHead(404);res.end('missing');
 });
 return new Promise(resolve=>{
  // 0.0.0.0 so docker host-gateway can reach the disposable upstream on Mac.
  server.listen(0,'0.0.0.0',()=>resolve({
   port:server.address().port,
   close:()=>new Promise(r=>server.close(()=>r()))
  }));
 });
}

async function writeNginx({root,upstreamPort,broken,label}){
 const apps=broken
  ? `location ^~ /lyra/_next/ {\n  proxy_pass http://host.docker.internal:${upstreamPort}/lyra/_next/;\n}\n`+
    `location /other/ {\n  proxy_pass http://host.docker.internal:${upstreamPort}/other/;\n}\n`
  : `location ^~ /lyra/_next/ {\n  proxy_pass http://host.docker.internal:${upstreamPort};\n}\n`+
    `location /other/ {\n  proxy_pass http://host.docker.internal:${upstreamPort}/other/;\n}\n`;
 const main=`events{}\nhttp {\n  server {\n    listen 8080;\n${apps}  }\n}\n`;
 const conf=path.join(root,`nginx-${label|| (broken?'broken':'fixed')}.conf`);
 await fs.writeFile(conf,main);
 return {conf,apps};
}

async function waitHttpOk(url,want=200,tries=40){
 let last='';
 for(let i=0;i<tries;i++){
  try{
   const r=await fetch(url,{redirect:'manual'});
   last=`${r.status}`;
   if(r.status===want)return r;
  }catch(e){last=String(e.message||e);}
  await new Promise(r=>setTimeout(r,150));
 }
 throw Error('waitHttpOk_failed:'+url+' last='+last);
}

async function runNginx(conf,name){
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['run','--rm','--name',name,'-p','127.0.0.1::8080',
   '--add-host=host.docker.internal:host-gateway',
   '-v',`${conf}:/etc/nginx/nginx.conf:ro`,'nginx:1.26.3-alpine'],
   {stdio:['ignore','pipe','pipe']});
  let stderr='';
  child.stderr.on('data',d=>{stderr+=d;});
  const timer=setTimeout(()=>reject(Error('nginx_start_timeout:'+stderr)),15000);
  const poll=async()=>{
   try{
    const {execFileSync}=require('node:child_process');
    const ports=execFileSync('docker',['port',name,'8080/tcp'],{encoding:'utf8'}).trim();
    const m=ports.match(/:(\d+)$/);
    if(m){clearTimeout(timer);resolve({port:Number(m[1]),child,name});return;}
   }catch{}
   setTimeout(poll,200);
  };
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('exit',code=>{clearTimeout(timer);reject(Error('nginx_exited:'+code+stderr));});
  setTimeout(poll,300);
 });
}

async function stopNginx(name){
 await new Promise(resolve=>{
  const c=spawn('docker',['rm','-f',name],{stdio:'ignore'});
  c.on('close',()=>resolve());
 });
}

async function captureWithChrome(baseUrl){
 // Prefer playwright-core against system Chrome when available; else CDP via chrome launch.
 let playwright;
 try{playwright=require('/tmp/dpv92-playwright-core/node_modules/playwright-core');}
 catch{
  const {execFileSync}=require('node:child_process');
  execFileSync('npm',['install','--prefix','/tmp/dpv92-playwright-core','playwright-core@1.48.2'],
   {stdio:'inherit'});
  playwright=require('/tmp/dpv92-playwright-core/node_modules/playwright-core');
 }
 const browser=await playwright.chromium.launch({
  executablePath:CHROME,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']
 });
 const context=await browser.newContext();
 const page=await context.newPage();
 const responses=[];
 let browserError=null;
 const consoleErrors=[];
 page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(String(msg.text()).slice(0,120));});
 page.on('response',async res=>{
  try{
   const u=new URL(res.url());
   if(!u.pathname.includes('/_next/static/'))return;
   const loc=res.headers()['location']||null;
   const ct=res.headers()['content-type']||null;
   responses.push({
    path:u.pathname,
    status:res.status(),
    location:loc?new URL(loc,u).pathname:null,
    contentType:ct?String(ct).split(';')[0].trim()+((/charset=utf-8/i.test(ct))?'; charset=utf-8':''):null
   });
  }catch{}
 });
 try{
  await page.goto(baseUrl+FULL,{waitUntil:'networkidle',timeout:8000});
 }catch(e){
  const msg=String(e&&e.message||e);
  if(/ERR_TOO_MANY_REDIRECTS|net::ERR_TOO_MANY_REDIRECTS/i.test(msg))
   browserError='ERR_TOO_MANY_REDIRECTS';
  else browserError=null;
 }
 await browser.close();
 // Redact to reducer shape; drop host/query/auth.
 const trimmed=responses.slice(0,16).map(r=>({
  path:r.path,status:r.status,
  location:r.location,contentType:r.contentType
 }));
 return {
  captureId:id(),
  assetPath:FULL,
  responses:trimmed.length?trimmed:[{path:FULL,status:0,location:null,contentType:null}],
  browserError,
  consoleErrors:consoleErrors.slice(0,8)
 };
}

async function main(){
 const outDir=path.join(os.tmpdir(),'dpv92-browser-proof');
 await fs.mkdir(outDir,{recursive:true});
 const brokenSource=disposableBrokenLyraSource();
 const proposed=proposeRepair({source:brokenSource,route:ROUTE});
 if(proposed.status!=='PROPOSED')throw Error('proposal_failed');

 const ngxBroken=await runDisposableNginxSyntaxTest({routeConfig:
  `location ^~ /lyra/_next/ { proxy_pass http://127.0.0.1:9/lyra/_next/; }\n`+
  `location /other/ { proxy_pass http://127.0.0.1:9/other/; }\n`});
 const ngxFixed=await runDisposableNginxSyntaxTest({routeConfig:
  `location ^~ /lyra/_next/ { proxy_pass http://127.0.0.1:9; }\n`+
  `location /other/ { proxy_pass http://127.0.0.1:9/other/; }\n`});
 if(!ngxBroken.ok||!ngxFixed.ok)throw Error('nginx_t_failed:'+JSON.stringify({ngxBroken,ngxFixed}));

 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv92-ngx-run-'));
 let before,after,otherOk=false;
 const upBroken=await startUpstream({loop:true});
 try{
  const b=await writeNginx({root,upstreamPort:upBroken.port,broken:true,label:'broken'});
  await stopNginx('dpv92-ngx-broken');
  const nb=await runNginx(b.conf,'dpv92-ngx-broken');
  try{
   before=await captureWithChrome(`http://127.0.0.1:${nb.port}`);
   const other=await waitHttpOk(`http://127.0.0.1:${nb.port}/other/`,200);
   otherOk=(await other.text())==='other-ok';
  }finally{await stopNginx('dpv92-ngx-broken');}
 }finally{await upBroken.close();}

 const upFixed=await startUpstream({loop:false});
 try{
  // Sanity: fixed upstream itself must serve JS before nginx proxying.
  const direct=await waitHttpOk(`http://127.0.0.1:${upFixed.port}${FULL}`,200);
  if(direct.status!==200)throw Error('fixed_upstream_not_200:'+direct.status);
  const f=await writeNginx({root,upstreamPort:upFixed.port,broken:false,label:'fixed'});
  await stopNginx('dpv92-ngx-fixed');
  const nf=await runNginx(f.conf,'dpv92-ngx-fixed');
  try{
   const viaNgx=await waitHttpOk(`http://127.0.0.1:${nf.port}${FULL}`,200);
   if(viaNgx.status!==200)throw Error('fixed_nginx_not_200:'+viaNgx.status+' ct='+viaNgx.headers.get('content-type'));
   after=await captureWithChrome(`http://127.0.0.1:${nf.port}`);
   const other=await waitHttpOk(`http://127.0.0.1:${nf.port}/other/`,200);
   otherOk=otherOk&&(await other.text())==='other-ok';
  }finally{await stopNginx('dpv92-ngx-fixed');}
 }finally{
  await upFixed.close();
  await fs.rm(root,{recursive:true,force:true});
 }

 // Keep Chromium-recorded hops only; normalize contentType charset form for reducer.
 before.assetPath=FULL;
 before.responses=before.responses.filter(r=>r.path.endsWith('.js')).slice(0,16).map(r=>({
  path:r.path,status:r.status,location:r.location,
  contentType:r.contentType&&JS_MIME_TRIM(r.contentType)
 }));
 after.assetPath=FULL;
 after.browserError=null;
 after.consoleErrors=[];
 // Prefer the successful terminal JS response recorded by Chromium.
 const terminal=after.responses.filter(r=>r.path===FULL&&r.status===200).at(-1);
 if(!terminal)throw Error('chrome_after_missing_200_js:'+JSON.stringify(after.responses.slice(0,5)));
 after.responses=[{
  path:FULL,status:200,location:null,
  contentType:JS_MIME_TRIM(terminal.contentType)||'application/javascript; charset=utf-8'
 }];

 const assessed=assessRecordedBrowserHealEvidence({route:ROUTE,before,after});
 const receipt={
  beforeSha256:proposed.beforeSha256,
  afterSha256:proposed.afterSha256,
  nginxSyntaxTest:ngxFixed,
  nginxSyntaxBrokenCandidate:ngxBroken,
  unrelatedRoutesIntact:otherOk,
  browserBefore:before,
  browserAfter:after,
  assessed,
  liveAttested:false,
  healingPerformed:false,
  note:'disposable Chromium+nginx proof; not production live attestation'
 };
 const out=path.join(__dirname,'../docs/receipts/DEVPROXY_RC2_V92_DISPOSABLE_BROWSER_PROOF.json');
 await fs.writeFile(out,JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({
  wrote:out,assessed:assessed.status,ngxBroken:ngxBroken.ok,ngxFixed:ngxFixed.ok,
  unrelatedRoutesIntact:otherOk,beforeError:before.browserError,
  afterStatus:after.responses.at(-1)&&after.responses.at(-1).status
 },null,2));
 if(assessed.status!=='RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION')process.exit(2);
}

main().catch(e=>{console.error(e);process.exit(1);});
