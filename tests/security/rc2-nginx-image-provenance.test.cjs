'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createReadOnlyNginxProvenance}=require('../../utils/rc2-nginx-image-provenance.cjs');
const ID='a'.repeat(64),IMG='sha256:'+'b'.repeat(64);
const FILTER='/usr/lib/nginx/modules/ngx_http_brotli_filter_module.so';
const STATIC='/usr/lib/nginx/modules/ngx_http_brotli_static_module.so';
const MIME='/etc/nginx/mime.types';
const MODULES=[MIME,FILTER,STATIC];
const FILES=['/etc/nginx/nginx.conf','/etc/nginx/mime.types','/etc/nginx/conf.d/default.conf','/etc/nginx/conf.d/sites-enabled/apps.generated.conf'];
const dumped=`# configuration file /etc/nginx/nginx.conf:\nload_module modules/ngx_http_brotli_filter_module.so;\nload_module modules/ngx_http_brotli_static_module.so;\nhttp { include /etc/nginx/mime.types; }\n# configuration file /etc/nginx/mime.types:\ntypes { text/html html; }\n# configuration file /etc/nginx/conf.d/default.conf:\nserver { listen 80; }\n# configuration file /etc/nginx/conf.d/sites-enabled/apps.generated.conf:\nlocation /a/ { return 200; }\n`;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const moduleDigests=Object.fromEntries(MODULES.map((p,i)=>[p,sha('trusted immutable module '+i)]));
function fixture({dump=dumped,hashLines,drifted=false,wrongImage=false,nginxError=false,unreviewedArgs=false}={}){
 const calls=[];
 function exec(binary,args,options,cb){
  calls.push({binary,args,options});
  let raw;
  if(args[0]==='inspect'){
   const name=args[2];
   if(name==='{{json .Id}}')raw=JSON.stringify(drifted&&calls.length>5?'c'.repeat(64):ID);
   else if(name==='{{json .Image}}')raw=JSON.stringify(wrongImage?('sha256:'+'c'.repeat(64)):IMG);
   else if(name==='{{json .State.Running}}')raw='true';
   else throw Error('untrusted inspect field');
  }else if(args[0]==='exec'&&args[2]==='nginx'&&args[3]==='-T'){
   if(nginxError)return setImmediate(()=>cb(Error('nginx failed'),'',''));raw=dump;
  }else if(args[0]==='exec'&&args[2]==='sha256sum'){
   raw=hashLines||MODULES.map(p=>moduleDigests[p]+'  '+p).join('\n')+'\n';
  }else throw Error('unexpected Docker operation '+args.join(' '));
  setImmediate(()=>cb(null,raw,''));
 }
 const pins={dockerBinary:'/usr/local/bin/docker',containerId:ID,image:IMG,
  expectedDumpSha256:sha(dumped),expectedConfigFiles:FILES,expectedImageFileSha256:moduleDigests};
 return {calls,pins,exec};
}
function inspect(f){return createReadOnlyNginxProvenance({...f.pins,execFileImpl:f.exec,home:'/private/tmp'}).inspect()}
test('RED: pinned image, mime/Brotli and full nginx -T produce redacted evidence only',async()=>{
 const f=fixture(),r=await inspect(f);assert.equal(r.code,'NGINX_PROVENANCE_EVIDENCE_ONLY');
 assert.equal(r.runtimeAttested,false);assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.filesVerified,4);assert.equal(r.imageFilesVerified,3);
 assert.equal(JSON.stringify(r).includes('location /a/'),false);
 assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,2);
 assert.ok(f.calls.every(c=>c.options.shell===false));
});
test('RED: unreviewed dynamic include fails even when nginx test succeeds',async()=>{
 const f=fixture({dump:dumped+'# configuration file /etc/nginx/conf.d/rogue.conf:\nserver{}\n'});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED');
});
test('RED: missing pinned include file fails closed',async()=>{const f=fixture({dump:dumped.replace('# configuration file /etc/nginx/mime.types:', '# removed:')});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: repeated nginx config source refused',async()=>{const f=fixture({dump:dumped+'# configuration file /etc/nginx/mime.types:\n'});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: wrong image digest fails closed',async()=>{const f=fixture({wrongImage:true});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: failed nginx -T fails closed',async()=>{const f=fixture({nginxError:true});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: tampered mime SHA fails closed',async()=>{const f=fixture();f.pins.expectedImageFileSha256={...moduleDigests,[MIME]:'0'.repeat(64)};assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: missing Brotli filter module fails closed',async()=>{const f=fixture({hashLines:[MIME,FILTER].map(p=>moduleDigests[p]+'  '+p).join('\n')+'\n'});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: bogus sha256sum output rejected',async()=>{const f=fixture({hashLines:'garbage\n'});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: module load directive removed from dumped main config fails closed',async()=>{const f=fixture({dump:dumped.replace('load_module modules/ngx_http_brotli_filter_module.so;','')});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: unexpected third module fails closed',async()=>{const f=fixture({dump:dumped+'load_module modules/ngx_http_untrusted.so;\n'});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: after-state container identity drift fails closed',async()=>{const f=fixture({drifted:true});assert.equal((await inspect(f)).code,'NGINX_PROVENANCE_BLOCKED')});
test('RED: config dump expected SHA must be pinned, not auto-learned',()=>{const f=fixture();delete f.pins.expectedDumpSha256;assert.throws(()=>createReadOnlyNginxProvenance({...f.pins,execFileImpl:f.exec,home:'/private/tmp'}),/INVALID_NGINX_PROVENANCE_PINS/) });
test('RED: cannot redirect Docker binary to shell script',()=>{const f=fixture();f.pins.dockerBinary='/tmp/untrusted';assert.throws(()=>createReadOnlyNginxProvenance({...f.pins,execFileImpl:f.exec,home:'/private/tmp'}),/INVALID_NGINX_PROVENANCE_PINS/) });
test('RED: cannot spoof own SHA by adding extra config path',()=>{const f=fixture();f.pins.expectedConfigFiles=[...FILES,'/tmp/rogue.conf'];assert.throws(()=>createReadOnlyNginxProvenance({...f.pins,execFileImpl:f.exec,home:'/private/tmp'}),/INVALID_NGINX_PROVENANCE_PINS/) });
test('RED: no Docker exec if inspect image is different',async()=>{const f=fixture({wrongImage:true});await inspect(f);assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,0)});
test('RED: incorrect Docker id is not accepted at config construction',()=>{const f=fixture();f.pins.containerId='dev-proxy';assert.throws(()=>createReadOnlyNginxProvenance({...f.pins,execFileImpl:f.exec,home:'/private/tmp'}),/INVALID_NGINX_PROVENANCE_PINS/) });
