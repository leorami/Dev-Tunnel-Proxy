'use strict';
/**
 * Confined, observation-only RC2 route scan. It cannot execute Docker, spawn
 * scanApps.js, regenerate nginx, write owner data, browse arbitrary URLs or
 * claim feature parity. An authenticated caller supplies the trusted fixed-host
 * HTTP-only audit adapter; API wiring requires separate source review.
 */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=fs;
const MAX_BYTES=256*1024;
const MAX_ENTRIES=128;
const MAX_PROBES=32;
const SOURCE=/^(apps|overrides)\/[A-Za-z0-9_-]{1,80}\.conf$/;
const BLOCKED_TOP=new Set(['admin','devproxy','api','config','status','dashboard',
  '.artifacts','nginx_status','server-status','_internal']);
const baseline=Object.freeze({productionChangeAuthorized:false,liveAttested:false,
  deployed:false,ownerUatApproved:false,browserAudited:false,healingPerformed:false,
  sourceCurrent:'UNKNOWN',realAppVerified:'UNKNOWN'});
const noRead=()=>Object.freeze({ok:false,code:'READONLY_HTTP_SCAN_UNAVAILABLE'});
function identity(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
  a.mode===b.mode&&a.size===b.size&&a.ctimeNs===b.ctimeNs&&a.mtimeNs===b.mtimeNs;}
function readExistingRoutes({diagnosticsFile}={}){
  if(typeof diagnosticsFile!=='string'||!path.isAbsolute(diagnosticsFile)||
    path.normalize(diagnosticsFile)!==diagnosticsFile||diagnosticsFile.length>1024||
    path.basename(diagnosticsFile)!=='bundle-diagnostics.json'||
    /[\x00-\x1f\x7f]/.test(diagnosticsFile))return noRead();
  let fd;
  try{
    const a=fs.lstatSync(diagnosticsFile,{bigint:true});
    if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||
      (a.mode&0o022n)!==0n||a.size<2n||a.size>BigInt(MAX_BYTES))return noRead();
    fd=fs.openSync(diagnosticsFile,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const b=fs.fstatSync(fd,{bigint:true});
    if(!b.isFile()||!identity(a,b))return noRead();
    const bytes=fs.readFileSync(fd);
    const c=fs.fstatSync(fd,{bigint:true});
    const d=fs.lstatSync(diagnosticsFile,{bigint:true});
    if(!identity(b,c)||!identity(c,d)||BigInt(bytes.length)!==c.size)return noRead();
    let value;
    try{value=JSON.parse(bytes.toString('utf8'));}catch{return noRead();}
    if(!value||typeof value!=='object'||Array.isArray(value)||
       Object.getPrototypeOf(value)!==Object.prototype||!Array.isArray(value.included)||
       value.included.length>MAX_ENTRIES)return noRead();
    const entries=[];
    for(const row of value.included){
      if(!row||typeof row!=='object'||Array.isArray(row)||
        Object.getPrototypeOf(row)!==Object.prototype||
        !['app','override'].includes(row.kind)||typeof row.pathSpec!=='string'||
        row.pathSpec.length>256||!SOURCE.test(row.source)||
        row.source.split('/')[0]!== (row.kind==='app'?'apps':'overrides'))return noRead();
      entries.push(Object.freeze({kind:row.kind,pathSpec:row.pathSpec}));
    }
    return Object.freeze({ok:true,code:'READONLY_HTTP_SCAN_INPUT_EXISTS',entries:Object.freeze(entries)});
  }catch{return noRead();}
  finally{if(fd!==undefined){try{fs.closeSync(fd);}catch{}}}
}
function deriveSafeAuditRoute(spec){
  if(typeof spec!=='string'||spec.length>256)return null;
  const s=spec.trim();
  const m=/^(?:\^~\s+|=\s+)?(\/[A-Za-z0-9._~/-]{1,254})$/.exec(s);
  if(!m)return null;
  const route=m[1];
  if(route==='/'||route.includes('//')||route.includes('/./')||route.includes('/../')||
    route.endsWith('/.')||route.endsWith('/..')||route.split('/').some(p=>p.startsWith('.'))||
    BLOCKED_TOP.has((route.split('/')[1]||'').toLowerCase()))return null;
  return route;
}
const failed=()=>Object.freeze({code:'READONLY_HTTP_SCAN_UNAVAILABLE',...baseline});
async function scanExistingAppHttpRoutes({diagnosticsFile,probe}={}){
  if(!probe||typeof probe.audit!=='function')return failed();
  const parsed=readExistingRoutes({diagnosticsFile});
  if(!parsed.ok)return failed();
  let skipped=0,truncated=false;
  const seen=new Set(),paths=[];
  for(const item of parsed.entries){
    const route=deriveSafeAuditRoute(item.pathSpec);
    if(route===null||seen.has(route)){skipped++;continue;}
    seen.add(route);
    if(paths.length>=MAX_PROBES){truncated=true;skipped++;continue;}
    paths.push(route);
  }
  // Four independently bounded fixed-host HEADs avoid 32 x 3.5-second serial
  // latency. Stable output ordering is preserved regardless of completion order.
  const results=new Array(paths.length);let next=0;
  async function worker(){
    for(;;){
      const index=next++;
      if(index>=paths.length)return;
      const route=paths[index];
      let response;
      try{response=await probe.audit({url:route});}catch{response=null;}
      const valid=response&&typeof response==='object'&&
        (response.code==='LOCAL_HTTP_OK'||response.code==='LOCAL_HTTP_NOT_GREEN')&&
        typeof response.summary?.status==='number'&&
        response.summary.status>=100&&response.summary.status<=599;
      const green=valid&&response.code==='LOCAL_HTTP_OK'&&response.ok===true&&
        response.summary.status>=200&&response.summary.status<300;
      const notGreen=valid&&response.code==='LOCAL_HTTP_NOT_GREEN'&&response.ok===false&&
        !(response.summary.status>=200&&response.summary.status<300);
      const code=green?'LOCAL_HTTP_OK':notGreen?'LOCAL_HTTP_NOT_GREEN':'LOCAL_HTTP_PROBE_UNAVAILABLE';
      results[index]=Object.freeze({route,code,status:valid?response.summary.status:null});
    }
  }
  await Promise.all(Array.from({length:Math.min(4,paths.length)},()=>worker()));
  const httpGreen=results.filter(r=>r.code==='LOCAL_HTTP_OK').length;
  const httpNotGreen=results.length-httpGreen;
  return Object.freeze({code:'READONLY_HTTP_SCAN_EVIDENCE_ONLY',observed:results.length,
    httpGreen,httpNotGreen,skipped,truncated,results:Object.freeze(results),...baseline});
}
module.exports={readExistingRoutes,deriveSafeAuditRoute,scanExistingAppHttpRoutes};
