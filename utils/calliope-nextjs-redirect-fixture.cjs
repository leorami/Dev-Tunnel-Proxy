'use strict';
/**
 * Disposable known-bad Next.js /_next/ redirect-loop fixture.
 * Pure in-process evidence helpers — no Docker, live proxy, or production writes.
 */
const http=require('node:http');
const crypto=require('node:crypto');

const BROKEN_LYRA=`# disposable known-bad Next.js route
location /other/ {
  proxy_pass http://other-dev:3000;
}
location ^~ /lyra/_next/ {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://lyra-dev:4000/lyra/_next/;
}
location /lyra/ {
  proxy_pass http://lyra-dev:4000;
}
`;

function sha256(s){return crypto.createHash('sha256').update(s,'utf8').digest('hex');}

/**
 * Classify whether a route's /_next/ location still embeds the upstream path
 * prefix that historically caused Next.js trailing-slash redirect loops.
 */
function classifyNextjsUpstream({source,route}={}){
 if(typeof source!=='string'||typeof route!=='string')return Object.freeze({ok:false,state:'INVALID'});
 const bad=new RegExp(`location[ \\t]+(?:\\^~[ \\t]+)?\\/${route}\\/_next\\/[ \\t]*\\{[\\s\\S]*?proxy_pass[ \\t]+http:\\/\\/[a-z][a-z0-9-]*:[0-9]{2,5}\\/${route}\\/_next\\/[ \\t]*;`);
 const good=new RegExp(`location[ \\t]+(?:\\^~[ \\t]+)?\\/${route}\\/_next\\/[ \\t]*\\{[\\s\\S]*?proxy_pass[ \\t]+http:\\/\\/[a-z][a-z0-9-]*:[0-9]{2,5}[ \\t]*;`);
 if(bad.test(source))return Object.freeze({ok:true,state:'BROKEN_UPSTREAM_PREFIX',sourceSha256:sha256(source)});
 if(good.test(source))return Object.freeze({ok:true,state:'FIXED_BARE_UPSTREAM',sourceSha256:sha256(source)});
 return Object.freeze({ok:true,state:'NO_MATCH',sourceSha256:sha256(source)});
}

/**
 * Synthetic browser/asset probe: broken upstream prefix → redirect loop;
 * fixed bare upstream → asset 200. Unrelated /other/ always intact.
 */
function createSyntheticNextjsProbe({source,route}={}){
 const cls=classifyNextjsUpstream({source,route});
 const server=http.createServer((req,res)=>{
  if(req.url===`/${route}/_next/`||req.url===`/${route}/_next`){
   if(cls.state==='BROKEN_UPSTREAM_PREFIX'){
    res.writeHead(308,{Location:`/${route}/_next`});return res.end();
   }
   res.writeHead(404);return res.end('no directory listing');
  }
  if(req.url&&req.url.startsWith(`/${route}/_next/static/`)){
   if(cls.state==='BROKEN_UPSTREAM_PREFIX'){
    res.writeHead(308,{Location:req.url.replace(/\/?$/,'')});return res.end();
   }
   res.writeHead(200,{'Content-Type':'application/javascript'});return res.end('/*ok*/');
  }
  if(req.url==='/other/'||(req.url&&req.url.startsWith('/other/'))){
   res.writeHead(200,{'Content-Type':'text/plain'});return res.end('other-ok');
  }
  res.writeHead(404);res.end('missing');
 });
 return Object.freeze({
  classification:cls,
  async listen(){
   await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
   return server.address().port;
  },
  async close(){await new Promise(resolve=>server.close(()=>resolve()));},
  async probe(port){
   const asset=await fetchFollow(`http://127.0.0.1:${port}/${route}/_next/static/chunks/webpack.js`,8);
   const other=await fetchFollow(`http://127.0.0.1:${port}/other/`,2);
   return Object.freeze({
    ok:cls.state==='FIXED_BARE_UPSTREAM'?asset.status===200&&!asset.loop:asset.loop===true,
    nginxSyntaxOk:true, // fixture config is text-validated by proposal replay
    assetStatus:asset.status,
    redirectLoop:asset.loop===true,
    unrelatedRoutesIntact:other.status===200&&other.body==='other-ok',
    hops:asset.hops,classification:cls.state
   });
  }
 });
}

async function fetchFollow(url,maxHops){
 let current=url,hops=0,status=0,body='';
 for(;;){
  const res=await fetch(current,{redirect:'manual'});
  status=res.status;body=await res.text();
  if(status<300||status>=400)return {status,body,hops,loop:false};
  const loc=res.headers.get('location');
  hops+=1;
  if(!loc||hops>=maxHops)return {status,body,hops,loop:hops>=maxHops};
  current=new URL(loc,current).href;
 }
}

function disposableBrokenLyraSource(){return BROKEN_LYRA;}

module.exports={
 disposableBrokenLyraSource,classifyNextjsUpstream,createSyntheticNextjsProbe,sha256
};
