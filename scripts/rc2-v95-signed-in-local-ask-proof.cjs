'use strict';
/**
 * Disposable signed-in Ask proof for V95. Boots the candidate API on an
 * ephemeral loopback port with secure inline-Docker denial. Does not touch
 * live RC1 containers, ngrok, bridge, or master.
 */
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const PORT=18795;
const ORIGIN=`http://127.0.0.1:${PORT}`;
const PASS=process.env.ADMIN_PASSWORD||(()=>{
 const m=fs.readFileSync(path.join(ROOT,'.env'),'utf8').match(/^ADMIN_PASSWORD=(.+)$/m);
 if(!m)throw new Error('ADMIN_PASSWORD missing for disposable proof');
 return m[1].trim();
})();

function req({method,urlPath,headers={},body=null}){
 return new Promise((resolve,reject)=>{
  const r=http.request({
   hostname:'127.0.0.1',port:PORT,method,path:urlPath,
   headers:Object.assign({'content-type':'application/json','accept':'application/json'},headers)
  },res=>{
   const chunks=[];
   res.on('data',c=>chunks.push(c));
   res.on('end',()=>{
    const raw=Buffer.concat(chunks).toString('utf8');
    let json=null;try{json=JSON.parse(raw);}catch{}
    resolve({status:res.statusCode,headers:res.headers,raw,json});
   });
  });
  r.on('error',reject);
  if(body!=null)r.end(typeof body==='string'?body:JSON.stringify(body));
  else r.end();
 });
}

function cookieFrom(res){
 const set=res.headers['set-cookie'];
 if(!set)return null;
 const line=Array.isArray(set)?set[0]:set;
 const m=String(line).match(/^(admin_session=[a-f0-9]{64})/i)||String(line).match(/^([^=]+=[^;]+)/);
 return m?m[1]:null;
}

async function main(){
 const child=spawn(process.execPath,[path.join(ROOT,'utils/proxyConfigAPI.js')],{
  cwd:ROOT,
  env:Object.assign({},process.env,{
   PORT:String(PORT),
   ADMIN_PASSWORD:PASS,
   DEVPROXY_DENY_INLINE_DOCKER:'1',
   DEVPROXY_TRUSTED_ORIGINS:ORIGIN,
   NODE_ENV:'production'
  }),
  stdio:['ignore','pipe','pipe']
 });
 let ready=false;
 child.stdout.on('data',d=>{if(String(d).includes('listening'))ready=true;});
 child.stderr.on('data',()=>{});
 const started=Date.now();
 while(!ready&&Date.now()-started<8000)await new Promise(r=>setTimeout(r,50));
 if(!ready){child.kill('SIGKILL');throw new Error('API failed to listen');}

 const receipt={
  ok:false,mode:'disposable_signed_in_ask',port:PORT,origin:ORIGIN,
  steps:{},usedAI:false,healingPerformed:false,liveAttested:false,
  liveContainersTouched:false
 };
 try{
  // Unauthenticated Ask → 401 JSON
  const unauth=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN},body:{query:'How does Calliope fix a Next.js redirect loop?'}
  });
  assert.equal(unauth.status,401);
  receipt.steps.unauthenticatedAsk=unauth.status;

  // Login
  const login=await req({
   method:'POST',urlPath:'/admin/login',
   headers:{Origin:ORIGIN},body:{password:PASS}
  });
  assert.equal(login.status,200);
  assert.equal(login.json&&login.json.ok,true);
  const cookie=cookieFrom(login);
  assert.ok(cookie&&/session=/i.test(cookie));
  receipt.steps.login=200;

  // Cross-Origin cookie POST denied
  const xorigin=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:'http://evil.example',Cookie:cookie},
   body:{query:'How does Calliope fix a Next.js redirect loop?'}
  });
  assert.equal(xorigin.status,403);
  receipt.steps.crossOriginAsk=xorigin.status;

  // Oversized / malformed
  const huge=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN,Cookie:cookie},
   body:{query:'x'.repeat(700)}
  });
  assert.equal(huge.status,400);
  receipt.steps.oversizedAsk=huge.status;

  // Signed-in redirect heal explanation (observe/explain, not docs-only)
  const healQ=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN,Cookie:cookie},
   body:{query:'How does Calliope fix a Next.js redirect loop?'}
  });
  assert.equal(healQ.status,200);
  assert.equal(healQ.json.ok,true);
  assert.equal(healQ.json.usedAI,false);
  assert.equal(healQ.json.healingPerformed,false);
  assert.equal(healQ.json.mode,'local_reviewed_heal_explain');
  assert.match(healQ.json.answer,/reviewTicket/i);
  assert.ok(Array.isArray(healQ.json.sources)&&healQ.json.sources.length>0);
  receipt.steps.signedInHealExplain={status:healQ.status,mode:healQ.json.mode,sources:healQ.json.sources};

  // Observation limits
  const obsQ=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN,Cookie:cookie},
   body:{query:'What does a fixed-host route observation prove?'}
  });
  assert.equal(obsQ.status,200);
  assert.equal(obsQ.json.mode,'local_observation_limits');
  assert.match(obsQ.json.answer,/does NOT prove/i);
  receipt.steps.signedInObserveExplain={status:obsQ.status,mode:obsQ.json.mode,sources:obsQ.json.sources};

  // Nonmatching → docs gap (no fabricated answer)
  const miss=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN,Cookie:cookie},
   body:{query:'xylophone quasicrystal foobar123 zebrafinch'}
  });
  assert.equal(miss.status,200);
  assert.equal(miss.json.ok,true);
  assert.equal(miss.json.mode,'local_documentation');
  assert.match(miss.json.answer,/could not find a grounded answer/i);
  assert.deepEqual(miss.json.sources,[]);
  receipt.steps.nonmatchingDocsGap={status:miss.status,sources:miss.json.sources};

  // Docs grounding for a generic nginx/route question
  const docs=await req({
   method:'POST',urlPath:'/devproxy/api/ai/ask',
   headers:{Origin:ORIGIN,Cookie:cookie},
   body:{query:'How does nginx route local applications?'}
  });
  assert.equal(docs.status,200);
  assert.equal(docs.json.ok,true);
  assert.equal(docs.json.mode,'local_documentation');
  assert.equal(docs.json.usedAI,false);
  assert.ok(docs.json.sources.length>=1);
  receipt.steps.signedInDocsAsk={status:docs.status,mode:docs.json.mode,sources:docs.json.sources};

  // ai/health honesty
  const health=await req({
   method:'GET',urlPath:'/devproxy/api/ai/health',
   headers:{Origin:ORIGIN,Cookie:cookie,accept:'application/json'}
  });
  assert.equal(health.status,200);
  assert.equal(health.json.mode,'local_documentation');
  assert.equal(health.json.model,null);
  assert.equal(health.json.usedAI,false);
  receipt.steps.health=health.json.mode;

  receipt.ok=true;
  const out=path.join(ROOT,'docs/receipts/DEVPROXY_RC2_V95_SIGNED_IN_LOCAL_ASK_PROOF.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({ok:true,receipt:out,steps:receipt.steps},null,2));
 }finally{
  child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,200));
  try{child.kill('SIGKILL');}catch{}
 }
}

main().catch(err=>{
 console.error(err);
 process.exitCode=1;
});
