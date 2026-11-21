'use strict';
/**
 * Authenticated, non-persistent owner-session adapter for local Calliope turns.
 * The model and evidence providers are injected. This module does not open
 * sockets, read files, execute tools, or accept client history, roles, or URLs.
 */
const {buildGroundedReadOnlyMessages, validateGroundedReadOnlyReply} = require('./calliope-grounded-local-turn.cjs');

const ASK_FIELDS = ['authenticated', 'ownerSessionId', 'query'];
const MAX_SESSIONS = 32;
const MAX_HISTORY = 6;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETE_TIMEOUT_MS = 22000;
const FALSE_FLAGS = Object.freeze({
  healingPerformed: false,
  executionAuthorized: false,
  productionChangeAuthorized: false,
  liveAttested: false,
  networkTransferAuthorized: false,
});

function plain(value){
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function denied(code){
  return Object.freeze({ok: false, usedAI: false, mode: 'local_model_readonly', code, ...FALSE_FLAGS});
}
function storeText(value, max){
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function createCalliopeOwnerSessionBrain({complete, getEvidence} = {}){
  if (typeof complete !== 'function' || typeof getEvidence !== 'function'){
    throw new TypeError('CALLIOPE_SESSION_DEPENDENCIES_REQUIRED');
  }
  const sessions = new Map();

  function dropExpired(now){
    for (const [id, row] of sessions){
      if (!row || now - row.touched > SESSION_TTL_MS) sessions.delete(id);
    }
  }
  function historyFor(id){
    const row = sessions.get(id);
    if (!row) return [];
    row.touched = Date.now();
    sessions.delete(id);
    sessions.set(id, row);
    return row.turns.slice(-MAX_HISTORY);
  }
  function remember(id, query, answer){
    const user = storeText(query, 512);
    const assistant = storeText(answer, 700);
    if (!user || !assistant) return;
    let row = sessions.get(id);
    if (!row){
      if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
      row = {turns: [], touched: Date.now()};
    }
    row.turns.push({role: 'user', content: user}, {role: 'assistant', content: assistant});
    if (row.turns.length > MAX_HISTORY) row.turns.splice(0, row.turns.length - MAX_HISTORY);
    row.touched = Date.now();
    sessions.delete(id);
    sessions.set(id, row);
  }
  function invalidate(ownerSessionId){
    if (typeof ownerSessionId === 'string') sessions.delete(ownerSessionId);
  }
  async function ask(input){
    dropExpired(Date.now());
    if (!plain(input)) return denied('INVALID_CALLIOPE_SESSION_REQUEST');
    const keys = Object.keys(input);
    if (keys.some((key) => !ASK_FIELDS.includes(key)) ||
        !keys.includes('authenticated') || !keys.includes('ownerSessionId') || !keys.includes('query')){
      return denied('INVALID_CALLIOPE_SESSION_REQUEST');
    }
    if (input.authenticated !== true || typeof input.ownerSessionId !== 'string' ||
        !input.ownerSessionId.trim() || input.ownerSessionId.length > 128){
      return denied('CALLIOPE_SESSION_REQUIRED');
    }
    const ownerSessionId = input.ownerSessionId;
    let evidence;
    try {
      evidence = await getEvidence({query: input.query, ownerSessionId});
    } catch {
      return denied('CALLIOPE_EVIDENCE_UNAVAILABLE');
    }
    const built = buildGroundedReadOnlyMessages({
      query: input.query,
      history: historyFor(ownerSessionId),
      evidence: Array.isArray(evidence) ? evidence : [],
    });
    if (!built.ok) return denied(built.code);
    let raw;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('LOCAL_MODEL_TIMEOUT')), COMPLETE_TIMEOUT_MS);
    });
    try {
      raw = await Promise.race([
        Promise.resolve(complete({messages: built.messages})),
        timeout,
      ]);
    } catch {
      return denied('LOCAL_MODEL_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    if (typeof raw !== 'string') return denied('INVALID_CALLIOPE_COMPLETION');
    const checked = validateGroundedReadOnlyReply(raw, {allowedEvidenceIds: built.evidenceIds});
    if (!checked.ok) return denied(checked.code);
    remember(ownerSessionId, input.query, checked.answer);
    return Object.freeze({
      ok: true,
      usedAI: true,
      mode: 'local_model_readonly',
      answer: checked.answer,
      evidenceIds: checked.evidenceIds,
      hypotheses: checked.hypotheses,
      nextStep: checked.nextStep,
      ...FALSE_FLAGS,
    });
  }
  return Object.freeze({ask, invalidate});
}

module.exports = Object.freeze({createCalliopeOwnerSessionBrain});
