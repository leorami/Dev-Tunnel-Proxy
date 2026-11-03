#!/usr/bin/env node
'use strict';
/**
 * Read-only, no-secret local RC1 post-release integrity check.
 * Uses seven narrowly formatted Docker inspect reads. NEVER call full
 * docker inspect (contains Config.Env secrets); no compose or mutations.
 * Redacted codes are diagnostics, not authorization to start/stop services.
 */
const {execFileSync}=require('node:child_process');
const {assessRuntimeIsolation}=require('../utils/rc1-runtime-isolation.cjs');
const F={
 running:'{{json .State.Running}}',
 image:'{{json .Image}}',
 user:'{{json .Config.User}}',
 privileged:'{{json .HostConfig.Privileged}}',
 mounts:'{{json .Mounts}}',
 ports:'{{json .NetworkSettings.Ports}}',
};
function unknown(){return Object.freeze({state:'UNKNOWN',findings:Object.freeze(['INSPECTION_UNAVAILABLE']),
 productionChangeAuthorized:false,performedActions:false,sourceIntegrityVerified:false,deployed:false});}
function auditDockerRuntime({run=execFileSync}={}){
 try{
  if(typeof run!=='function')return unknown();
  function read(name,format){
   const raw=run('docker',['inspect','--format',format,name],{
    encoding:'utf8',timeout:8000,maxBuffer:64*1024,
    stdio:['ignore','pipe','pipe']
   });
   // Any Docker error messages, secret source paths or output values are
   // intentionally never printed or copied into result objects.
   return JSON.parse(String(raw).trim());
  }
  const proxyRunning=read('dev-proxy',F.running);
  const apiRunning=read('dev-proxy-config-api',F.running);
  if(proxyRunning!==true||apiRunning!==true)return unknown();
  const facts={
   proxyImage:read('dev-proxy',F.image),
   apiUser:read('dev-proxy-config-api',F.user),
   apiPrivileged:read('dev-proxy-config-api',F.privileged),
   apiMounts:read('dev-proxy-config-api',F.mounts),
   apiPorts:read('dev-proxy-config-api',F.ports)
  };
  return assessRuntimeIsolation(facts);
 }catch{return unknown();}
}
if(require.main===module){
 const result=auditDockerRuntime();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.state==='PLAN_ONLY'?0:2;
}
module.exports={auditDockerRuntime};
