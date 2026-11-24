'use strict';
/**
 * Hosted Calliope Signal receiver. Runs on glibc Node 24.
 * Reads only the private job directory and the already-public Dev Proxy health URL.
 */
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createSignalEndpoint } from '../utils/devproxy-v199-signal-endpoint.mjs';

const require = createRequire(import.meta.url);
const { signDeviceProof } = require('../utils/devproxy-v199-device-proof.cjs');

const expected = process.env.V192_EXPECTED_LIBSIGNAL_VERSION;
const packageRoot = process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const storePath = process.env.DEVPROXY_V200_STORE;
const sealFile = process.env.DEVPROXY_V200_SEAL_FILE;
const job = process.env.DEVPROXY_V200_JOB;
const healthUrl = process.env.DEVPROXY_V200_HEALTH_URL;
const command = process.env.DEVPROXY_V200_COMMAND;

function fail(message){
  process.stderr.write(message + '\n');
  process.exit(1);
}
if (!expected || !packageRoot || !storePath || !sealFile || !job || !command) fail('RECEIVER_CONFIG_DENIED');
const sealingKey = readFileSync(sealFile);
if (sealingKey.length !== 32) fail('RECEIVER_SEAL_DENIED');

function boundedHealth(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const mode = raw.mode === 'local_documentation' ? 'localdocs' : null;
  if (mode === null) return null;
  if (typeof raw.enabled !== 'boolean' || typeof raw.usedAI !== 'boolean' ||
      typeof raw.healingPerformed !== 'boolean' || typeof raw.liveAttested !== 'boolean') return null;
  return {
    enabled: raw.enabled,
    usedai: raw.usedAI,
    healing: raw.healingPerformed,
    attested: raw.liveAttested,
    mode
  };
}

const endpoint = await createSignalEndpoint({
  role: 'calliope',
  storePath,
  sealingKey,
  packageRoot,
  expectedVersion: expected,
  async readPublicHealth(){
    const response = await fetch(healthUrl);
    if (!response.ok) throw Error('HEALTH_HTTP_' + response.status);
    const summary = boundedHealth(await response.json());
    if (!summary) throw Error('HEALTH_SUMMARY_DENIED');
    return summary;
  }
});

if (command === 'init'){
  const peer = process.env.DEVPROXY_V200_PEER_HEX;
  if (!peer) fail('PEER_HEX_REQUIRED');
  endpoint.pinPeer(peer);
  const bundle = await endpoint.publicBundle();
  const identity = {
    identityPublicHex: endpoint.identityPublicHex(),
    signalIdentitySha256: await endpoint.identitySha256(),
    bundle
  };
  const out = job + '/calliope-public.json';
  writeFileSync(out, JSON.stringify(identity));
  chmodSync(out, 0o600);
  process.stdout.write('calliope-init-ok\n');
} else if (command === 'receive'){
  const api = process.env.DEVPROXY_V200_API_BASE;
  const origin = process.env.DEVPROXY_V200_ORIGIN;
  const password = readFileSync(process.env.DEVPROXY_V200_PASSWORD_FILE, 'utf8').trim();
  const identity = JSON.parse(readFileSync(process.env.DEVPROXY_V200_TRANSPORT_FILE, 'utf8'));
  if (!api || !origin || !password || !identity.transportPrivateKeyPkcs8) fail('RECEIVER_TRANSPORT_DENIED');
  const login = await fetch(api + '/admin/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!login.ok) fail('RECEIVER_LOGIN_DENIED');
  const cookie = String(login.headers.get('set-cookie') || '').split(';')[0];
  async function signed(method, pathname, body){
    const time = String(Date.now());
    const nonce = (await import('node:crypto')).randomBytes(32).toString('hex');
    const sig = signDeviceProof({
      privateKeyPkcs8: identity.transportPrivateKeyPkcs8,
      method, pathname, body, time, nonce, deviceId: identity.deviceId
    });
    const response = await fetch(api + pathname, {
      method,
      headers: {
        origin, cookie, accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        'x-devproxy-device-id': identity.deviceId,
        'x-devproxy-device-nonce': nonce,
        'x-devproxy-device-time': time,
        'x-devproxy-device-sig': sig
      },
      body: body || undefined
    });
    const text = await response.text();
    if (!response.ok) fail('RECEIVER_MAILBOX_' + response.status);
    return JSON.parse(text);
  }
  const inbox = await signed('GET', '/devproxy/api/signal/private/inbox', null);
  const item = inbox.items && inbox.items[0];
  if (!item) fail('RECEIVER_INBOX_EMPTY');
  const received = await endpoint.receiveProxyStatus({
    messageType: item.signalMessageType,
    ciphertext: item.ciphertextBase64url
  });
  const ackBody = Buffer.from(JSON.stringify({ messageId: item.messageId }));
  await signed('POST', '/devproxy/api/signal/private/ack', ackBody);
  const out = job + '/reply.json';
  writeFileSync(out, JSON.stringify(received.reply));
  chmodSync(out, 0o600);
  process.stdout.write('calliope-receive-ok\n');
} else fail('RECEIVER_COMMAND_DENIED');
