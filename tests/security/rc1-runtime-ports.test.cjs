'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyManagementBindings}=require('../../utils/rc1-runtime-ports.cjs');
const binding=(host,port)=>({HostIp:host,HostPort:String(port)});
function valid(){return {'3001/tcp':[binding('127.0.0.1',3001)],'3002/tcp':[binding('::1',3002)]};}
test('both required ports on exact loopback addresses only are loopback',()=>{
  assert.equal(classifyManagementBindings(valid()),'loopback');
  const v=valid();v['3002/tcp']=[binding('[::1]',3002)];
  assert.equal(classifyManagementBindings(v),'loopback');
});
test('non-loopback physical LAN bindings are exposed, not falsely loopback',()=>{
  for(const ip of ['192.168.1.5','10.0.0.6','172.20.2.2','203.0.113.3','0.0.0.0','::','fe80::1','localhost','127.0.0.2','']){
    const p=valid();p['3002/tcp']=[binding(ip,3002)];
    assert.equal(classifyManagementBindings(p),'all_interfaces',ip);
  }
});
test('one safe loopback and one exposed binding classify as exposed',()=>{
  const p=valid();p['3001/tcp'].push(binding('0.0.0.0',3001));
  assert.equal(classifyManagementBindings(p),'all_interfaces');
});
test('a missing 3001 or 3002 must NEVER count as loopback',()=>{
  for(const port of ['3001/tcp','3002/tcp']){
    const p=valid();delete p[port];
    assert.equal(classifyManagementBindings(p),'unknown',port);
  }
});
test('bad publish ports and empty target binds cannot count as loopback',()=>{
  for(const bad of [undefined,[],null,[binding('127.0.0.1',9999)],[{HostIp:'127.0.0.1'}]]){
    const p=valid();if(bad===undefined)delete p['3002/tcp'];else p['3002/tcp']=bad;
    assert.equal(classifyManagementBindings(p),'unknown');
  }
});
test('malformed metadata and getters are rejected without executing them',()=>{
  for(const bad of [null,undefined,{},[],Object.create(valid())]){
    assert.equal(classifyManagementBindings(bad),'unknown');
  }
  const p=valid();
  Object.defineProperty(p,'3001/tcp',{enumerable:true,get(){throw Error('NEVER_READ');}});
  assert.equal(classifyManagementBindings(p),'unknown');
});
test('source results are only fixed diagnostic words; no raw addresses echoed',()=>{
  const p=valid();p['3002/tcp']=[binding('SECRET_HOST_DO_NOT_ECHO',3002)];
  const out=classifyManagementBindings(p);
  assert.equal(out,'all_interfaces');
  assert.doesNotMatch(out,/SECRET_HOST/);
});
