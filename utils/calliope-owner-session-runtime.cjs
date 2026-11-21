'use strict';
/**
 * One process-local Calliope brain. Session keys are hashes, never raw tokens.
 * Evidence is server-derived documentation plus the last trusted HEAD, if the
 * existing audit parser accepted it. Nothing here is written to disk.
 */
const crypto = require('node:crypto');
const {createCalliopeOwnerSessionBrain} = require('./calliope-owner-session-brain.cjs');
const {createLocalOllamaComplete} = require('./calliope-local-model-complete.cjs');
const {answerFromLocalProjectDocs} = require('./rc2-local-calliope-evidence.cjs');
const {parseVerifiedAuditObservation} = require('./rc2-calliope-grounded-followup.cjs');

const FALSE_FLAGS = Object.freeze({
  healingPerformed: false,
  executionAuthorized: false,
  productionChangeAuthorized: false,
  liveAttested: false,
  networkTransferAuthorized: false,
});

function sessionKey(token){
  if (typeof token !== 'string' || !token) return '';
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);
}

function docEvidence(answer){
  if (!answer || answer.ok !== true || typeof answer.answer !== 'string') return [];
  const summary = answer.answer.replace(/\s+/g, ' ').trim().slice(0, 680);
  if (summary.length < 10) return [];
  return [{id: 'doc:local-project', kind: 'document', summary}];
}

function observationEvidence(observation){
  if (!observation || typeof observation.route !== 'string' || !Number.isInteger(observation.status)) return null;
  const summary = `Trusted fixed-host HEAD for ${observation.route} returned HTTP ${observation.status}. Redirects were not followed and no repair was performed. Cause is not established.`;
  if (summary.length > 700) return null;
  return {id: 'obs:last-fixed-host-head', kind: 'observation', summary};
}

function presentCalliopeReply(result){
  const lines = [result.answer];
  if (Array.isArray(result.hypotheses) && result.hypotheses.length){
    lines.push('', 'What this does not prove:');
    for (const item of result.hypotheses) lines.push('- ' + item);
  }
  if (typeof result.nextStep === 'string' && result.nextStep){
    lines.push('', 'Next read-only check: ' + result.nextStep);
  }
  return lines.join('\n');
}

function createCalliopeAskRuntime({root, complete} = {}){
  if (typeof root !== 'string' || !root) throw new TypeError('CALLIOPE_DOCS_ROOT_REQUIRED');
  const observations = new Map();
  const brain = createCalliopeOwnerSessionBrain({
    complete: complete || createLocalOllamaComplete(),
    getEvidence: async ({query, ownerSessionId} = {}) => {
      const items = [];
      const observed = observations.get(ownerSessionId);
      if (observed) items.push(observed);
      const docs = answerFromLocalProjectDocs({root, query, maxDocs: 1});
      items.push(...docEvidence(docs));
      return items.slice(0, 6);
    },
  });
  return Object.freeze({
    sessionKey,
    ask(input){
      return brain.ask({
        authenticated: true,
        ownerSessionId: input && input.ownerSessionId,
        query: input && input.query,
      });
    },
    rememberAudit(ownerSessionId, auditResult){
      if (typeof ownerSessionId !== 'string' || !ownerSessionId) return;
      const parsed = parseVerifiedAuditObservation(auditResult);
      const evidence = observationEvidence(parsed);
      if (evidence) observations.set(ownerSessionId, evidence);
    },
    invalidate(ownerSessionId){
      if (typeof ownerSessionId !== 'string') return;
      observations.delete(ownerSessionId);
      brain.invalidate(ownerSessionId);
    },
    present: presentCalliopeReply,
    flags: FALSE_FLAGS,
  });
}

module.exports = Object.freeze({
  createCalliopeAskRuntime,
  presentCalliopeReply,
  sessionKey,
});
