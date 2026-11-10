'use strict';
/**
 * Pure preimage comparator to be invoked INSIDE the existing route mutation
 * cross-process lock before a journal or any write. Does not itself grant
 * authorization, read a file or perform an action.
 */
const crypto=require('node:crypto');
const SHA=/^[0-9a-f]{64}$/;
const result=status=>Object.freeze({
 status,ownerApprovalGranted:false,productionChangeAuthorized:false,healingPerformed:false
});
function verifyApprovedOwnerPreimage(input){
 if(input===null||typeof input!=='object'||Array.isArray(input)||
    Object.getPrototypeOf(input)!==Object.prototype||
    Reflect.ownKeys(input).length!==2||
    !['expectedBeforeSha256','currentBytes'].every(k=>Object.hasOwn(input,k)&&
      Object.hasOwn(Object.getOwnPropertyDescriptor(input,k),'value')))
   return result('INVALID');
 const {expectedBeforeSha256,currentBytes}=input;
 if(typeof expectedBeforeSha256!=='string'||!SHA.test(expectedBeforeSha256)||
    (currentBytes!==null&&!Buffer.isBuffer(currentBytes)))return result('INVALID');
 if(currentBytes===null)return result('STALE');
 const actual=crypto.createHash('sha256').update(currentBytes).digest();
 const expected=Buffer.from(expectedBeforeSha256,'hex');
 return result(crypto.timingSafeEqual(actual,expected)?'MATCH':'STALE');
}
module.exports={verifyApprovedOwnerPreimage};
