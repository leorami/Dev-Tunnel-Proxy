'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditConfigParity,auditConfigBytesEvidence}=require('../../utils/rc1-config-parity.cjs');
const owner='/owner/project',cand='/tmp/rc1';
const bind=(source,target,read_only)=>({type:'bind',source,target,read_only});
function fixture(){return {candidateRoot:cand,services:{
proxy:[bind(cand+'/config/default.production.conf','/etc/nginx/conf.d/default.conf',true),bind(owner+'/build/sites-enabled','/etc/nginx/conf.d/sites-enabled',true)],
'proxy-config-api':[bind(cand,'/app',true),bind(owner+'/config','/app/config',false),bind(owner+'/build/sites-enabled','/app/build/sites-enabled',false)]
}};}
test('different nginx and API configuration files are blocked',()=>{
 const x=auditConfigParity(fixture());
 assert.equal(x.status,'BLOCKED');
 assert.ok(x.blockers.includes('ACTIVE_NGINX_CONFIG_SPLIT'));
});
test('same configuration file and generated route tree pass as PLAN ONLY',()=>{
 const x=fixture();x.services.proxy[0].source=owner+'/config/default.production.conf';
 assert.deepEqual(auditConfigParity(x),{status:'PARITY_PLAN_ONLY',blockers:[],deployed:false});
});
test('missing source, wrong code, wrong generated bundle, bad modes block',()=>{
 for(const edit of [
 a=>a.services.proxy.shift(),
 a=>a.services.proxy[0].type='volume',
 a=>a.services['proxy-config-api'][1].read_only=true,
 a=>a.services['proxy-config-api'][0].source='/wrong',
 a=>a.services['proxy-config-api'][2].source=cand+'/build/sites-enabled'
 ]){const f=fixture();edit(f);assert.equal(auditConfigParity(f).status,'BLOCKED');}
});
test('nested shadow configuration bind is denied',()=>{
 const x=fixture();
 x.services['proxy-config-api'].push(bind('/alternate','/app/config/default.production.conf',false));
 assert.ok(auditConfigParity(x).blockers.includes('API_ACTIVE_CONFIG_SHADOWED'));
});
test('untrusted or inherited evidence does not authorize',()=>{
 for(const x of [null,{},[],Object.create({services:fixture().services})])assert.equal(auditConfigParity(x).status,'BLOCKED');
 const x=fixture();Object.defineProperty(x.services,'proxy',{get(){throw Error('unexpected getter')}});
 assert.equal(auditConfigParity(x).status,'BLOCKED');
});
test('approved candidate bytes must equal both nginx and API digests',()=>{
 const a='a'.repeat(64),b='b'.repeat(64);
 assert.equal(auditConfigBytesEvidence({approvedSha256:a,nginxSha256:b,apiSha256:b}).status,'BLOCKED');
 assert.equal(auditConfigBytesEvidence({approvedSha256:a,nginxSha256:a,apiSha256:b}).status,'BLOCKED');
 assert.deepEqual(auditConfigBytesEvidence({approvedSha256:a,nginxSha256:a,apiSha256:a}),{status:'MATCHING_BYTES_ATTESTED_ONLY',blockers:[],deployed:false});
});
test('missing or malformed digests are denied',()=>{
 for(const x of [null,{}, {approvedSha256:'short'}, {approvedSha256:'G'.repeat(64),nginxSha256:'a'.repeat(64),apiSha256:'a'.repeat(64)}])
 assert.equal(auditConfigBytesEvidence(x).status,'BLOCKED');
});
