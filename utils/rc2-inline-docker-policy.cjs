'use strict';
/**
 * Fail closed on inline Docker privilege in production activation mode.
 * An obsolete DEVPROXY_DENY_INLINE_DOCKER=0 must NEVER overrule a configured
 * authenticated spool. This module does not execute Docker or change state.
 */
function ownValue(o,key){
 const desc=Object.getOwnPropertyDescriptor(o,key);
 return !desc?undefined:Object.hasOwn(desc,'value')?desc.value:Symbol.for('invalid_accessor');
}
function shouldBlockInlineDocker(input={}){
 try{
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.getPrototypeOf(input)!==Object.prototype)return true;
  const keys=Reflect.ownKeys(input);
  if(keys.some(k=>typeof k!=='string'||!['spoolDirectory','denyFlag','allowFlag','nodeEnv','dockerSocketPresent'].includes(k)))return true;
  const spool=ownValue(input,'spoolDirectory');
  const deny=ownValue(input,'denyFlag');
  const allow=ownValue(input,'allowFlag');
  const env=ownValue(input,'nodeEnv');
  const socket=ownValue(input,'dockerSocketPresent');
  // An empty, null or otherwise invalid EXPLICIT spool configuration must
  // block, not silently fall back to the legacy privileged Docker route.
  if(spool!==undefined)return true;
  if(![undefined,'0','1'].includes(deny)||![undefined,'0','1'].includes(allow)||
     ![undefined,'production','development','test'].includes(env)||
     ![undefined,true,false].includes(socket))return true;
  if(env==='production'||deny==='1')return true;
  // A valid dev fixture is the ONLY remaining case where inline Docker may
  // be available. The historical allow=1 switch has no production authority.
  return false;
 }catch{return true;}
}
module.exports={shouldBlockInlineDocker};
