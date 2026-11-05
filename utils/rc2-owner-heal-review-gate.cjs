'use strict';
/**
 * Glue between authenticated propose/apply handlers and the one-use
 * session-bound proposal ticket. Session binding MUST come from
 * extractSessionToken(req) after requireAuth — never from JSON body.
 * Consuming a ticket is NOT proof a human clicked Confirm.
 */
const {createOwnerHealProposalTicketService}=require('./rc2-owner-heal-proposal-ticket.cjs');

function createOwnerHealReviewGate(options={}){
 const tickets=options.ticketService||createOwnerHealProposalTicketService(options);
 function issueReviewTicket({sessionBinding,appName,route,beforeSha256,afterSha256}={}){
  return tickets.issue({sessionBinding,appName,route,beforeSha256,afterSha256});
 }
 function consumeReviewTicket({sessionBinding,appName,route,beforeSha256,afterSha256,reviewTicket}={}){
  if(typeof reviewTicket!=='string')
   return Object.freeze({ok:false,status:'PROPOSAL_TICKET_REJECTED',
    ownerApprovalGranted:false,executionAuthorized:false,healingPerformed:false,
    liveAttested:false,productionChangeAuthorized:false});
  return tickets.consume({
   sessionBinding,appName,route,beforeSha256,afterSha256,ticket:reviewTicket
  });
 }
 function revokeAll(){tickets.revokeAll();}
 return Object.freeze({issueReviewTicket,consumeReviewTicket,revokeAll,tickets});
}

/** Bounded JSON body for heal propose/apply — rejects oversized hostile input. */
async function readBoundedHealJsonBody(req,{maxBytes=4096}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<64||maxBytes>65536)
  return {ok:false,code:'INVALID_BODY_LIMIT'};
 return await new Promise(resolve=>{
  const chunks=[];let size=0;let done=false;
  const finish=(v)=>{if(done)return;done=true;resolve(v);};
  req.on('data',c=>{
   size+=c.length;
   if(size>maxBytes){finish({ok:false,code:'BODY_TOO_LARGE'});try{req.destroy();}catch{}return;}
   chunks.push(c);
  });
  req.on('end',()=>{
   try{
    const raw=Buffer.concat(chunks).toString('utf8');
    if(!raw.length)return finish({ok:true,body:{}});
    const body=JSON.parse(raw);
    if(body===null||typeof body!=='object'||Array.isArray(body)||
       Object.getPrototypeOf(body)!==Object.prototype)
     return finish({ok:false,code:'INVALID_JSON_OBJECT'});
    finish({ok:true,body});
   }catch{finish({ok:false,code:'INVALID_JSON'});}
  });
  req.on('error',()=>finish({ok:false,code:'BODY_READ_FAILED'}));
 });
}

module.exports={createOwnerHealReviewGate,readBoundedHealJsonBody};
