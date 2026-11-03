'use strict';
/** Pure PR/receipt reconciliation. No network, Git, or state changes.
 * Lifecycle, CTO review, and release readiness are separate axes.
 */
const SHA=/^[0-9a-f]{40}$/;
function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function get(o,k){if(!plain(o))return undefined;const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}
function safeBodies(comments){if(!Array.isArray(comments))return [];return comments.map(c=>get(c,'body')).filter(x=>typeof x==='string'&&x.length<=50000);}
function reconcilePrimaryReturn(input){
 const empty=()=>Object.freeze({lifecycle:'UNVERIFIED',review:'PENDING',release:'UNVERIFIED',currentSha:null,needsNewDispatch:false});
 if(!plain(input))return empty();
 const child=get(input,'childPR'),sha=get(child,'head_sha');
 if(typeof sha!=='string'||!SHA.test(sha))return empty();
 const base={review:'PENDING',release:'UNVERIFIED',currentSha:sha,needsNewDispatch:false};
 const parents=safeBodies(get(input,'parentComments'));
 const reviews=safeBodies(get(input,'reviewComments'));
 const parentReturn=parents.some(body=>/^(?:##\s*)?Engineer-I RETURNED\b/im.test(body)&&
    body.includes('Receipt SHA: '+sha));
 const receipt=get(input,'childReceipt');
 const receiptValid=plain(receipt)&&get(receipt,'commitSha')===sha&&
    /^docs\/receipts\/[A-Za-z0-9_.\/-]+\.md$/.test(get(receipt,'path'))&&
    /\bRETURNED\b/.test(get(receipt,'body')||'');
 // When an original SHA-pinned return exists but head changed, never present old
 // receipt as a current RETURNED release.
 const priorReturn=parents.some(body=>/^(?:##\s*)?Engineer-I RETURNED\b/im.test(body)&&
    /Receipt SHA: ([0-9a-f]{40})/.test(body)&&!body.includes('Receipt SHA: '+sha));
 const review=reviews.some(body=>/CTO (?:SOURCE\/RECEIPT )?REVIEW\b/i.test(body)||
    /CTO REVIEW:\s*COMPLETED/i.test(body))?'REVIEWED':'PENDING';
 const release=review==='REVIEWED'&&reviews.some(body=>
    /(?:RELEASE ACCEPTANCE\s*:\s*|RO_ROUTE_MUTATION_PARITY_)BLOCKED|REJECT READY-FOR-GO LABEL/i.test(body))?'BLOCKED':'UNVERIFIED';
 if(parentReturn&&receiptValid)return Object.freeze({...base,lifecycle:'RETURNED',review,release});
 if(priorReturn)return Object.freeze({...base,lifecycle:'RETURN_SHA_DRIFT'});
 const hasStarted=parents.some(body=>/\bEngineer-I STARTED\b/.test(body));
 if(hasStarted)return Object.freeze({...base,lifecycle:'STARTED'});
 return Object.freeze({...base,lifecycle:'UNVERIFIED'});
}
module.exports={reconcilePrimaryReturn};
