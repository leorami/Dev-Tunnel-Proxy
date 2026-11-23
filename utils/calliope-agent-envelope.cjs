'use strict';
/**
 * Source-only, transport-independent verification for a future Calliope agent
 * inbox. An Ed25519 signature authenticates a tiny metadata request; it NEVER
 * authorizes reading/exporting a file, inspecting an app or executing a heal.
 *
 * This is NOT the Signal Protocol, end-to-end encryption, an HTTP endpoint,
 * an agent launcher, an owner grant or a deployable service.
 */
const crypto = require('node:crypto');
const AUDIENCE = 'devproxy.calliope.agent.v1';
const PURPOSE = 'artifact.describe';
const DOMAIN = 'DEVPROXY-CALLIOPE-AGENT-ENVELOPE-V1\n';
const SIGNED = Object.freeze([
  'version','audience','sender','project','purpose','artifactSha256',
  'issuedAtMs','expiresAtMs','nonce'
]);
const ALL = Object.freeze([...SIGNED,'signature']);
const NAME = /^[a-z][a-z0-9-]{0,47}$/;
const HASH = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SIG = /^[A-Za-z0-9_-]{86}$/;
const NO_AUTHORITY = Object.freeze({ownerApprovalGranted:false,exportAuthorized:false,
  executionAuthorized:false,healingPerformed:false,liveAttested:false,
  productionChangeAuthorized:false});
const FAIL = Object.freeze({ok:false,status:'MESSAGE_REJECTED',...NO_AUTHORITY});

function publicEd25519Only(material) {
  // Verifier config must never accept private key material. createPublicKey()
  // would otherwise derive a public key from PKCS8/JWK/KeyObject secrets.
  if (material instanceof crypto.KeyObject) {
    if (material.type !== 'public') throw Error('INVALID_AGENT_PUBLIC_KEY');
  } else {
    let privateMaterial = false;
    try { crypto.createPrivateKey(material); privateMaterial = true; } catch { /* public encodings fail here */ }
    if (privateMaterial) throw Error('INVALID_AGENT_PUBLIC_KEY');
    try { material = crypto.createPublicKey(material); }
    catch { throw Error('INVALID_AGENT_PUBLIC_KEY'); }
  }
  if (material.asymmetricKeyType !== 'ed25519' || material.type !== 'public')
    throw Error(material.asymmetricKeyType === 'ed25519' ? 'INVALID_AGENT_PUBLIC_KEY' : 'ONLY_ED25519_KEYS_ALLOWED');
  return material;
}
function ownExactData(obj, keys) {
  try {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj) ||
        Object.getPrototypeOf(obj) !== Object.prototype ||
        Reflect.ownKeys(obj).length !== keys.length) return null;
    const result = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(obj,key);
      if (!descriptor || !Object.hasOwn(descriptor,'value')) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch { return null; }
}
function messageSigningBytes(message) {
  // Fixed-field ordered encoding; no JSON-object key order, client keys or
  // path-dependent canonicalization. Domain separation prevents other uses.
  const fields = SIGNED.map(key => {
    const descriptor = message && Object.getOwnPropertyDescriptor(message,key);
    if (!descriptor || !Object.hasOwn(descriptor,'value')) throw Error('INVALID_AGENT_MESSAGE');
    return descriptor.value;
  });
  return Buffer.from(DOMAIN + JSON.stringify(fields),'utf8');
}
function createCalliopeAgentEnvelopeVerifier({identities,now=Date.now,maxSeen=128}={}) {
  if (!identities || Object.getPrototypeOf(identities)!==Object.prototype ||
      typeof now!=='function' || !Number.isSafeInteger(maxSeen) ||
      maxSeen<1 || maxSeen>1024) throw Error('INVALID_AGENT_VERIFIER_CONFIG');
  const registry = new Map();
  for (const [sender, entry] of Object.entries(identities)) {
    if (!NAME.test(sender) || !entry || Object.getPrototypeOf(entry)!==Object.prototype ||
        !Array.isArray(entry.projects) || entry.projects.length<1 ||
        entry.projects.length>32 || !entry.projects.every(p=>typeof p==='string'&&NAME.test(p)))
      throw Error('INVALID_AGENT_IDENTITY_CONFIG');
    const publicKey = publicEd25519Only(entry.publicKey);
    registry.set(sender,{publicKey,projects:new Set(entry.projects)});
  }
  if (!registry.size || registry.size>64) throw Error('INVALID_AGENT_IDENTITY_CONFIG');
  const seen = new Map();
  function verifyEnvelope(input) {
    const data = ownExactData(input,ALL);
    if (!data) return FAIL;
    const {version,audience,sender,project,purpose,artifactSha256,
      issuedAtMs,expiresAtMs,nonce,signature} = data;
    if (version!==1 || audience!==AUDIENCE || purpose!==PURPOSE ||
        typeof sender!=='string'||!NAME.test(sender)||
        typeof project!=='string'||!NAME.test(project)||
        typeof artifactSha256!=='string'||!HASH.test(artifactSha256)||
        typeof nonce!=='string'||!NONCE.test(nonce)||
        typeof signature!=='string'||!SIG.test(signature)||
        !Number.isSafeInteger(issuedAtMs)||!Number.isSafeInteger(expiresAtMs)||
        issuedAtMs<=0||expiresAtMs<=issuedAtMs ||
        expiresAtMs-issuedAtMs>60000) return FAIL;
    let at;
    try{at=now();}catch{return FAIL;}
    if(!Number.isSafeInteger(at)||at<=0 || issuedAtMs>at+15000 ||
       issuedAtMs<at-60000 || expiresAtMs<=at) return FAIL;
    const identity=registry.get(sender);
    if(!identity || !identity.projects.has(project))return FAIL;
    let decoded;
    try{decoded=Buffer.from(signature,'base64url');}catch{return FAIL;}
    if(decoded.length!==64||decoded.toString('base64url')!==signature)return FAIL;
    try{
      if(!crypto.verify(null,messageSigningBytes(data),identity.publicKey,decoded))return FAIL;
    }catch{return FAIL;}
    // Mark each verified sender+nonce synchronously, before a caller can
    // perform another action. No eviction of unexpired entries at capacity.
    for (const [key,expiry] of seen) if(expiry<=at) seen.delete(key);
    const marker=sender+'\0'+nonce;
    if(seen.has(marker)||seen.size>=maxSeen)return FAIL;
    seen.set(marker,expiresAtMs);
    return Object.freeze({ok:true,status:'SIGNED_METADATA_ONLY',sender,project,
      purpose,artifactSha256,...NO_AUTHORITY});
  }
  return Object.freeze({verifyEnvelope});
}
module.exports={createCalliopeAgentEnvelopeVerifier,messageSigningBytes};
