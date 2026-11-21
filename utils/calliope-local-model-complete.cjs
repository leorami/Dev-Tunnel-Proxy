'use strict';
/**
 * Fixed private Ollama completion. No caller-supplied URL, model, tools, or remote fallback.
 * 127.0.0.1 is the host loopback. host.docker.internal is the existing container-to-host path.
 */
const http = require('node:http');

const ENDPOINTS = Object.freeze([
  Object.freeze({hostname: '127.0.0.1', port: 11434}),
  Object.freeze({hostname: 'host.docker.internal', port: 11434}),
]);
const MODEL = 'qwen3:4b-instruct-2507-q4_K_M';
const CHAT_PATH = '/api/chat';
const CONNECT_FAILURES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'EAI_AGAIN']);

function extractJsonObject(text){
  const trimmed = String(text || '').trim();
  let candidate = trimmed;
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))){
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) candidate = trimmed.slice(start, end + 1);
  }
  try {
    const value = JSON.parse(candidate);
    if (value && Array.isArray(value.hypotheses)) value.hypotheses = value.hypotheses.slice(0, 3);
    if (value && Array.isArray(value.evidenceIds)){
      value.evidenceIds = [...new Set(value.evidenceIds)].slice(0, 6);
    }
    return JSON.stringify(value);
  } catch {
    return candidate;
  }
}

function postChat(request, endpoint, messages){
  const body = Buffer.from(JSON.stringify({
    model: MODEL,
    messages,
    stream: false,
    format: 'json',
    think: false,
    options: {temperature: 0.3, num_predict: 360},
  }));
  if (body.length > 16000) return Promise.reject(new Error('LOCAL_PROMPT_TOO_LARGE'));
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: 'http:',
      hostname: endpoint.hostname,
      port: endpoint.port,
      path: CHAT_PATH,
      method: 'POST',
      headers: {'content-type': 'application/json', 'content-length': body.length},
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > 32768){
          req.destroy();
          reject(new Error('LOCAL_MODEL_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(buf);
      });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(Object.assign(new Error('LOCAL_MODEL_HTTP'), {code: 'HTTP'}));
        let parsed;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return reject(new Error('LOCAL_MODEL_BAD_ENVELOPE')); }
        const content = parsed && parsed.message && parsed.message.content;
        if (typeof content !== 'string' || !content.trim()) return reject(new Error('LOCAL_MODEL_EMPTY'));
        resolve(extractJsonObject(content));
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('LOCAL_MODEL_TIMEOUT'), {code: 'ETIMEDOUT'}));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function createLocalOllamaComplete({requestImpl} = {}){
  const request = requestImpl || http.request;
  return async function complete(input){
    if (!input || !Array.isArray(input.messages) || input.messages.length !== 2){
      throw new Error('INVALID_LOCAL_MESSAGES');
    }
    let lastError = new Error('LOCAL_MODEL_UNREACHABLE');
    for (const endpoint of ENDPOINTS){
      try {
        return await postChat(request, endpoint, input.messages);
      } catch (error){
        lastError = error;
        if (error && CONNECT_FAILURES.has(error.code)) continue;
        throw error;
      }
    }
    throw lastError;
  };
}

module.exports = Object.freeze({
  ENDPOINTS,
  MODEL,
  createLocalOllamaComplete,
});
