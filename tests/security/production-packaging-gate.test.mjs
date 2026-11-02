/** DEVPROXY-SEC-RC1 release RED: source-only, no Docker, no ports, no credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('production nginx Compose uses the project image that actually contains Brotli',()=>{
 const prod=read('docker-compose.production.yml');
 const proxy=prod.split('  proxy:\n')[1]?.split('\n  dashboard-dev:')[0];
 assert.ok(proxy,'expected production proxy service');
 assert.match(proxy,/\n    build:\n      context: \.\n      dockerfile: Dockerfile\n/);
 assert.doesNotMatch(proxy,/\n    image: nginx:1\.25-alpine\s*(?:\n|$)/);
 const dockerfile=read('Dockerfile');
 const prodNginx=read('config/nginx.production.conf');
 for(const mod of ['ngx_http_brotli_filter_module.so','ngx_http_brotli_static_module.so']){
   assert.ok(dockerfile.includes('COPY --from=builder /nginx-*/objs/'+mod),mod+' not built into final image');
   assert.ok(prodNginx.includes('load_module modules/'+mod+';'),mod+' not loaded by prod');
 }
});

test('production mode switch actually uses generated override instead of ignoring it with -f base only',()=>{
 const script=read('scripts/switch-to-production.sh');
 assert.match(script,/docker-compose -f docker-compose\.yml -f docker-compose\.override\.yml up -d/);
 assert.doesNotMatch(script,/docker-compose -f docker-compose\.yml up -d(?:\n|$)/);
 assert.match(script,/cp config\/default\.production\.conf config\/default\.conf/);
 assert.match(script,/dockerfile: Dockerfile/);
});

test('source README does not certify that the uninspected owner installation is already running production',()=>{
 const guide=read('docs/PRODUCTION_MODE.md');
 assert.doesNotMatch(guide,/\*\*Status:\*\* ✅ Production Mode Active/);
 assert.match(guide,/installed.*must be verified|actual installed mode.*unverified/i);
});

test('both environments retain host-loopback admin ports and same core names',()=>{
 for(const compose of ['docker-compose.yml','docker-compose.production.yml']){
   const source=read(compose);
   assert.match(source,/container_name: dev-proxy\n/);
   assert.match(source,/container_name: dev-proxy-config-api\n/);
   assert.match(source,/"127\.0\.0\.1:3001:3001"/);
   assert.match(source,/"127\.0\.0\.1:3002:3002"/);
 }
});
