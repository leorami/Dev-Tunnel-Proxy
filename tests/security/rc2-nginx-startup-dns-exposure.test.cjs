'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessNginxStartupDnsExposure}=require('../../utils/rc2-nginx-startup-dns-exposure.cjs');
const assess=(...fragments)=>assessNginxStartupDnsExposure({fragments});
test('RED: static literal missing app hostname is a possible startup DNS dependency, not a proved outage',()=>{
 const r=assess('server { location /absent/ { proxy_pass http://offline-app:3000; } }');
 assert.equal(r.code,'POSSIBLE_STARTUP_DNS_DEPENDENCY');
 assert.equal(r.staticDnsReferences,1);
 assert.equal(r.rootCauseVerified,false);
 assert.equal(r.productionChangeAuthorized,false);
});
test('RED: variable-based proxy with resolver defers app resolution, but cannot attest production',()=>{
 const r=assess('server { location /app { resolver 127.0.0.11; set $site offline-app:3000; proxy_pass http://$site; } }');
 assert.equal(r.code,'NO_OBVIOUS_STATIC_DNS_IN_SUPPLIED_TEXT');
 assert.equal(r.variableProxyReferences,1);
 assert.equal(r.resolverDirectivesSeen,1);
 assert.equal(r.nginxStartupTested,false);
});
test('RED: upstream blocks hold DNS-sensitive server references even behind group-name proxy_pass',()=>{
 const r=assess('upstream app_backend { server offline-app:3000; } server { location /a/ { proxy_pass http://app_backend; }}');
 assert.equal(r.staticDnsReferences,1);
 assert.equal(r.groupProxyReferences,1);
});
test('RED: loopback/IP and unix sockets are not classified as startup DNS',()=>{
 const r=assess('server { location /a { proxy_pass http://127.0.0.1:8080; } location /b { proxy_pass http://localhost:3000; } location /c { proxy_pass http://unix:/tmp/test.sock:; }}');
 assert.equal(r.staticDnsReferences,0);
 assert.equal(r.literalEndpointReferences,3);
});
test('RED: nginx comments and return-string lookalikes are not executable upstream directives',()=>{
 const r=assess('# proxy_pass http://secret-ignored.local:1111;\nserver { location /a { return 200 "proxy_pass http://fake:1234;"; # trailing proxy_pass http://fake:1;\n }}');
 assert.equal(r.staticDnsReferences,0);
 assert.equal(r.variableProxyReferences,0);
});
test('RED: include graphs remain unverified even with no obvious static hosts in supplied snippet',()=>{
 const r=assess('http { include /etc/nginx/conf.d/*.conf; server { location / { proxy_pass http://$backend; } }}');
 assert.equal(r.includesPresent,true);
 assert.equal(r.sourceClosureVerified,false);
});
test('RED: runtime variable proxy without resolver does not get certified healthy',()=>{
 const r=assess('server { location /a/ { proxy_pass http://$missing_resolver; }}');
 assert.equal(r.variableProxyReferences,1);
 assert.equal(r.resolverDirectivesSeen,0);
 assert.equal(r.nginxStartupTested,false);
});
test('RED: output never includes hostnames, private paths or raw config text',()=>{
 const hidden='owner-private-internal-host-9784';
 const r=assess('server { location / { proxy_pass http://'+hidden+':3000; }}');
 const j=JSON.stringify(r);
 assert.equal(j.includes(hidden),false);
 assert.equal(j.includes('/private/'),false);
 assert.equal(j.includes('proxy_pass'),false);
});
test('RED: strict input limits return unverified classification without echo or process action',()=>{
 for(const invalid of [undefined,{},['x'],['x'.repeat(1024*1024+1)],Array(101).fill('x')]){
  const r=assessNginxStartupDnsExposure({fragments:invalid});
  assert.equal(r.code,'SOURCE_UNVERIFIED');
  assert.equal(r.productionChangeAuthorized,false);
 }
});
test('RED: unknown scheme/malformed proxy_pass requires native nginx, not safe inference',()=>{
 const r=assess('location / { proxy_pass custom://sensitive-app:1234; }');
 assert.equal(r.unclassifiedProxyReferences,1);
 assert.equal(r.nginxStartupTested,false);
});
