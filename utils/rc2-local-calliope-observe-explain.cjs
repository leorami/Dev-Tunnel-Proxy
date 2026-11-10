'use strict';
/**
 * Smallest read-only Calliope Ask extension beyond documentation retrieval.
 * Explains what fixed-host HTTP observation proves, and how the owner-reviewed
 * Next.js redirect heal works, WITHOUT probing arbitrary URLs, mutating config,
 * consuming review tickets, calling Docker, or contacting external models.
 */
const FLAGS=Object.freeze({
 usedAI:false,healingPerformed:false,liveAttested:false,
 executionAuthorized:false,productionChangeAuthorized:false,networkTransferAuthorized:false
});

function normalize(query){
 return String(query||'').toLowerCase().replace(/[^a-z0-9\s/_-]+/g,' ').replace(/\s+/g,' ').trim();
}

function hasAll(text,words){return words.every(w=>text.includes(w));}
function hasAny(text,words){return words.some(w=>text.includes(w));}

function answer(mode,answerText,sources){
 return Object.freeze({
  ok:true,mode,answer:answerText,sources:Object.freeze(sources.slice()),
  ...FLAGS
 });
}

/**
 * @param {string} query authenticated, already-bounded Ask query
 * @returns {{ok:true,mode:string,answer:string,sources:string[],...}|{ok:false}}
 */
function explainLocalCalliopeCapability(query){
 if(typeof query!=='string'||!query.trim()||Buffer.byteLength(query,'utf8')>512)
  return Object.freeze({ok:false,code:'INVALID_OBSERVE_EXPLAIN_QUERY'});
 const q=normalize(query);

 // What fixed-host observation proves (and does not prove).
 if(
  (hasAny(q,['observe','observation','observes','observed'])&&hasAny(q,['route','http','host','fixed','audit','head','prove','proves','proof']))||
  (hasAll(q,['fixed','host'])&&hasAny(q,['audit','observe','observation','head','prove','proves']))||
  (hasAny(q,['self-check','self check','local observation'])&&hasAny(q,['prove','proves','mean','means','what']))||
  (hasAll(q,['what','http'])&&hasAny(q,['audit','observation','observe']))
 ){
  return answer(
   'local_observation_limits',
   [
    'Fixed-host route observation (secure mode) proves only a bounded HTTP HEAD result through the private Docker DNS name `dev-proxy:80` for an allowlisted path derived from trusted origins or existing bundle diagnostics.',
    'It does NOT prove: browser rendering, JS MIME correctness, redirect-loop healing, nginx write success, Origin CSRF strength, liveAttested production health, or that an owner approved a change.',
    'It never follows redirects, never opens caller-supplied arbitrary URLs, never uses docker.sock, and never mutates nginx. Status codes are reachability evidence only (`LOCAL_HTTP_HEAD_ONLY` / inventory observation).',
    'To run an observation: use Self-check (heal:false) or the authenticated audit/scan endpoints — Ask will not auto-execute probes from chat text.'
   ].join('\n\n'),
   [
    'utils/rc2-secure-http-audit.cjs',
    'utils/rc2-readonly-app-http-scan.cjs',
    'utils/rc2-secure-self-check.cjs'
   ]
  );
 }

 // Reviewed heal path: explain only, never propose/apply/consume tickets here.
 if(
  (hasAny(q,['heal','healing','repair','fix'])&&hasAny(q,['redirect','next.js','nextjs','/_next/','/_next','loop']))||
  (hasAny(q,['how'])&&hasAny(q,['calliope'])&&hasAny(q,['redirect','/_next','next.js','nextjs']))||
  (hasAny(q,['review','reviewed','ticket'])&&hasAny(q,['heal','apply','propose','redirect']))
 ){
  return answer(
   'local_reviewed_heal_explain',
   [
    'Calliope can explain and assist a reviewed Next.js `/_next/` redirect repair; it does not auto-heal from this Ask answer.',
    'Owner path: (1) Fix /_next/ loop → propose issues before/after SHA-256 + one-use session-bound reviewTicket; (2) Confirm in the signed-in UI (ticket stays in memory, not chat storage); (3) apply consumes the ticket then CAS `editApp(...,{expectedBeforeSha256})` + HMAC host mediation; (4) disposable nginx -t / browser proof may still be required — liveAttested stays false until attested.',
    'Direct apply without a prior propose ticket is denied (403). Replay of a consumed ticket is denied. Observation/self-check never applies the repair. Docs excerpts are not proof that a heal completed.'
   ].join('\n\n'),
   [
    'utils/rc2-owner-heal-proposal-ticket.cjs',
    'utils/calliope-owner-nextjs-heal-skill.cjs',
    'utils/rc2-approved-owner-preimage.cjs',
    'status/common.js'
   ]
  );
 }

 return Object.freeze({ok:false,code:'NO_LOCAL_CAPABILITY_EXPLAIN'});
}

module.exports={explainLocalCalliopeCapability};
