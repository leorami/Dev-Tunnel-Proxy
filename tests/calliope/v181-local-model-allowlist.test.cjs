'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createLocalOllamaComplete, ENDPOINTS, MODEL} = require('../../utils/calliope-local-model-complete.cjs');

function fakeResponse(payload){
  const response = new EventEmitter();
  response.statusCode = 200;
  process.nextTick(() => {
    response.emit('data', Buffer.from(JSON.stringify(payload)));
    response.emit('end');
  });
  return response;
}

test('completion posts only to the fixed private endpoints and the pinned model', async () => {
  const seen = [];
  const requestImpl = (options, onResponse) => {
    seen.push({hostname: options.hostname, port: options.port, path: options.path, method: options.method});
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = (body) => {
      const parsed = JSON.parse(body.toString('utf8'));
      assert.equal(parsed.model, MODEL);
      assert.equal(parsed.stream, false);
      assert.equal(parsed.think, false);
      assert.equal(Object.hasOwn(parsed, 'tools'), false);
      assert.equal(Object.hasOwn(parsed, 'url'), false);
      assert.equal(parsed.messages.length, 2);
      assert.equal(parsed.messages[0].role, 'system');
      onResponse(fakeResponse({message: {content: '{"answer":"ok"}'}}));
    };
    return req;
  };
  const complete = createLocalOllamaComplete({requestImpl});
  const text = await complete({messages: [{role: 'system', content: 'policy'}, {role: 'user', content: '{}'}]});
  assert.equal(text, '{"answer":"ok"}');
  assert.equal(seen.length, 1);
  assert.deepEqual(
    seen[0],
    {hostname: ENDPOINTS[0].hostname, port: ENDPOINTS[0].port, path: '/api/chat', method: 'POST'}
  );
  assert.deepEqual(ENDPOINTS.map((item) => item.hostname), ['127.0.0.1', 'host.docker.internal']);
});

test('a refused loopback socket falls through to the existing container host path', async () => {
  const hosts = [];
  const requestImpl = (options, onResponse) => {
    hosts.push(options.hostname);
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () => {
      if (options.hostname === '127.0.0.1'){
        const error = new Error('refused');
        error.code = 'ECONNREFUSED';
        req.emit('error', error);
        return;
      }
      onResponse(fakeResponse({message: {content: '```json\n{"answer":"kept"}\n```'}}));
    };
    return req;
  };
  const complete = createLocalOllamaComplete({requestImpl});
  const text = await complete({messages: [{role: 'system', content: 'policy'}, {role: 'user', content: '{}'}]});
  assert.equal(text, '{"answer":"kept"}');
  assert.deepEqual(hosts, ['127.0.0.1', 'host.docker.internal']);
});
