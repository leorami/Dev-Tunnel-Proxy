'use strict';
// Pure, redacted runtime port binding classifier. Never reads Docker or raw secrets.
// A non-loopback bind is exposed; incomplete or malformed evidence is UNKNOWN.
// Only BOTH management listeners published strictly on loopback count as loopback.
const LOOPBACK=new Set(['127.0.0.1','::1','[::1]']);
function own(o,k){
  if(!o||typeof o!=='object')return {found:false};
  const d=Object.getOwnPropertyDescriptor(o,k);
  return d&&Object.prototype.hasOwnProperty.call(d,'value')
    ?{found:true,value:d.value}:{found:false};
}
function plain(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return false;
  const p=Object.getPrototypeOf(o);
  return p===Object.prototype||p===null;
}
function classifyManagementBindings(ports){
  try{
    if(!plain(ports))return 'unknown';
    let incomplete=false;
    let exposed=false;
    for(const port of ['3001','3002']){
      const bindings=own(ports,port+'/tcp');
      if(!bindings.found||!Array.isArray(bindings.value)||bindings.value.length===0){
        incomplete=true;continue;
      }
      for(let i=0;i<bindings.value.length;i++){
        const d=Object.getOwnPropertyDescriptor(bindings.value,String(i));
        if(!d||!Object.prototype.hasOwnProperty.call(d,'value')||!plain(d.value)){
          incomplete=true;continue;
        }
        const host=own(d.value,'HostIp'),published=own(d.value,'HostPort');
        if(!host.found||!published.found||typeof host.value!=='string'||typeof published.value!=='string'){
          incomplete=true;continue;
        }
        if(!LOOPBACK.has(host.value))exposed=true;
        if(published.value!==port)incomplete=true;
      }
    }
    if(exposed)return 'all_interfaces';
    if(incomplete)return 'unknown';
    return 'loopback';
  }catch{return 'unknown';}
}
module.exports={classifyManagementBindings};
