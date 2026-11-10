'use strict';
/**
 * Decision-ready inventory of owner-used AI/heal management paths that remain
 * blocked under settlement-secure / Dockerless API mode. This module does NOT
 * authorize docker.sock, root API, host shell, or a production GO. It exists so
 * Engineer returns can request an explicit owner scope decision instead of
 * repeating a bare NO-GO with no corrective source.
 */
const DEGRADED_POST=Object.freeze([
 'ai/ask','ai/restart-containers','ai/audit-and-heal',
 'ai/advanced-heal','ai/fix-react-bundle','ai/fix-storybook-vite',
 'ai/fix-mxtk-api','ai/snapshot-analyze','ai/code-review-container',
 'ai/code-review','ai/review-code','ai/inspect-container'
]);
const PARTIAL_SAFE_POST=Object.freeze([
 'ai/audit', // HEAD-only local reachability — not browser audit
 'ai/self-check', // inventory (+ optional http observation) — not heal
 'apps/scan' // inventory (+ optional diagnostics HEAD scan) — not scanApps.js
]);
const PRESERVED_TRANSACTIONAL_POST=Object.freeze([
 'apps/install','apps/create-route','apps/regenerate','overrides/promote',
 'apps/propose-nextjs-redirect-heal','apps/apply-reviewed-nextjs-redirect'
]);
const HOST_MEDIATED_FIXED_ACTION=Object.freeze([
 'apps/apply-reviewed-nextjs-redirect' // CAS editApp + HMAC; not AI chat/docker.sock
]);
function listAiHealDegradedScope(){
 return Object.freeze({
  code:'OWNER_SCOPE_DECISION_REQUIRED',
  reason:'AI_HEAL_REQUIRES_INLINE_DOCKER_OR_ACCEPTED_DEGRADATION',
  degradedPostPaths:DEGRADED_POST,
  partialSafePostPaths:PARTIAL_SAFE_POST,
  preservedTransactionalPostPaths:PRESERVED_TRANSACTIONAL_POST,
  hostMediatedFixedActions:HOST_MEDIATED_FIXED_ACTION,
  safeReplacementStatus:'PARTIAL_OBSERVATION_PLUS_ONE_REVIEWED_REDIRECT_SKILL',
  productionChangeAuthorized:false,
  deployed:false,
  ownerUatApproved:false
 });
}
module.exports={listAiHealDegradedScope,DEGRADED_POST,PARTIAL_SAFE_POST,PRESERVED_TRANSACTIONAL_POST,HOST_MEDIATED_FIXED_ACTION};
