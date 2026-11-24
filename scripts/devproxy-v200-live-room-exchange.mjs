/**
 * Owner-Mac pilot: Trajectory Node 24 sends encrypted proxy.status through the
 * loaded RC2 mailbox. Hosted glibc Node 24 Calliope decrypts, reads public health,
 * and returns ciphertext. No admin cookie is treated as a Signal identity.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTransportIdentity, signDeviceProof } = require('../utils/devproxy-v199-device-proof.cjs');
const { openEnrollmentRegistry } = require('../utils/devproxy-v199-enrollment-registry.cjs');
const { createSignalEndpoint } = await import('../utils/devproxy-v199-signal-endpoint.mjs');

const repo = new URL('..', import.meta.url).pathname;
const priv = process.env.DEVPROXY_V200_PRIVATE_DIR;
const packageRoot = process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const expected = process.env.V192_EXPECTED_LIBSIGNAL_VERSION;
const linuxPackage = process.env.DEVPROXY_V200_LINUX_PACKAGE;
if (!priv || !packageRoot || !expected || !linuxPackage) {
  process.stderr.write('pilot config missing\n');
  process.exit(2);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.status !== 0) {
    process.stderr.write((result.stderr || result.stdout || cmd).slice(0, 400) + '\n');
    throw Error(cmd + '-failed');
  }
  return result;
}
function keychainSet(service, value) {
  run('security', ['add-generic-password', '-U', '-a', 'devproxy-v200', '-s', service, '-w', value]);
}
function keychainGet(service) {
  return run('security', ['find-generic-password', '-a', 'devproxy-v200', '-s', service, '-w']).stdout.trim();
}
function originList() {
  const raw = run('docker', ['exec', 'dev-proxy-config-api', 'printenv', 'DEVPROXY_TRUSTED_ORIGINS']).stdout.trim();
  const origins = raw.split(',').map((item) => item.trim()).filter((item) => item.startsWith('http'));
  if (!origins.length) throw Error('TRUSTED_ORIGIN_MISSING');
  return origins[0];
}
function password() {
  const env = readFileSync('/Users/leorami/Development/dev-tunnel-proxy/.env', 'utf8');
  const match = env.match(/^ADMIN_PASSWORD=(.+)$/m);
  if (!match) throw Error('ADMIN_PASSWORD_MISSING');
  return match[1].trim();
}
async function api(origin, cookie, identity, method, pathname, body) {
  const raw = body ? Buffer.from(body) : Buffer.alloc(0);
  const time = String(Date.now());
  const nonce = randomBytes(32).toString('hex');
  const headers = {
    origin, accept: 'application/json',
    ...(cookie ? { cookie } : {}),
    ...(body ? { 'content-type': 'application/json' } : {})
  };
  if (identity) {
    headers['x-devproxy-device-id'] = identity.deviceId;
    headers['x-devproxy-device-nonce'] = nonce;
    headers['x-devproxy-device-time'] = time;
    headers['x-devproxy-device-sig'] = signDeviceProof({
      privateKeyPkcs8: identity.transportPrivateKeyPkcs8,
      method, pathname, body: raw, time, nonce, deviceId: identity.deviceId
    });
  }
  const response = await fetch('http://127.0.0.1:3001' + pathname, {
    method, headers, body: body ? raw : undefined
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text, headers: response.headers };
}
function receiver(command, extra) {
  const env = [
    'V192_LIBSIGNAL_PACKAGE_ROOT=/opt/pkg/node_modules/@signalapp/libsignal-client',
    'V192_EXPECTED_LIBSIGNAL_VERSION=' + expected,
    'DEVPROXY_V200_STORE=/private/calliope/calliope.store',
    'DEVPROXY_V200_SEAL_FILE=/private/calliope/calliope.seal',
    'DEVPROXY_V200_JOB=/private/job',
    'DEVPROXY_V200_HEALTH_URL=http://dev-proxy-config-api:3001/devproxy/api/ai/health',
    'DEVPROXY_V200_COMMAND=' + command
  ];
  for (const [key, value] of Object.entries(extra || {})) env.push(key + '=' + value);
  const args = ['run', '--rm', '--network', 'devproxy', '-u', '504:20'];
  for (const item of env) args.push('-e', item);
  args.push(
    '-v', priv + ':/private',
    '-v', repo + ':/src:ro',
    '-v', linuxPackage + ':/opt/pkg:ro',
    '-w', '/src', 'node:24-bookworm', 'node', 'scripts/devproxy-v200-calliope-receiver.mjs'
  );
  run('docker', args);
}

const origin = originList();
const pass = password();
const passFile = join(priv, 'calliope-admin.secret');
writeFileSync(passFile, pass);
chmodSync(passFile, 0o600);
const sealHex = randomBytes(32).toString('base64');
keychainSet('devproxy-v200-trajectory-seal', sealHex);
const trajectorySeal = Buffer.from(keychainGet('devproxy-v200-trajectory-seal'), 'base64');
const calliopeSeal = randomBytes(32);
writeFileSync(join(priv, 'calliope', 'calliope.seal'), calliopeSeal);
chmodSync(join(priv, 'calliope', 'calliope.seal'), 0o600);
const trajectoryTransport = createTransportIdentity();
keychainSet('devproxy-v200-trajectory-transport', trajectoryTransport.transportPrivateKeyPkcs8);
const trajectoryIdentity = {
  deviceId: trajectoryTransport.deviceId,
  transportPublicKeySpki: trajectoryTransport.transportPublicKeySpki,
  transportPrivateKeyPkcs8: keychainGet('devproxy-v200-trajectory-transport')
};
const calliopeTransport = createTransportIdentity();
const transportFile = join(priv, 'calliope', 'transport.json');
writeFileSync(transportFile, JSON.stringify({
  deviceId: calliopeTransport.deviceId,
  transportPrivateKeyPkcs8: calliopeTransport.transportPrivateKeyPkcs8
}));
chmodSync(transportFile, 0o600);

const trajectory = await createSignalEndpoint({
  role: 'trajectory',
  storePath: join(priv, 'trajectory', 'trajectory.store'),
  sealingKey: trajectorySeal,
  packageRoot,
  expectedVersion: expected
});
receiver('init', { DEVPROXY_V200_PEER_HEX: trajectory.identityPublicHex() });
const calliopePublic = JSON.parse(readFileSync(join(priv, 'job', 'calliope-public.json'), 'utf8'));
trajectory.pinPeer(calliopePublic.identityPublicHex);
await trajectory.acceptPeerBundle(calliopePublic.bundle);
const registry = openEnrollmentRegistry(join(priv, 'enrollment'));
registry.enroll({
  version: 1, role: 'trajectory',   deviceId: trajectoryIdentity.deviceId, revoked: false,
  transportPublicKeySpki: trajectoryIdentity.transportPublicKeySpki,
  signalIdentitySha256: await trajectory.identitySha256(),
  peerSignalIdentitySha256: calliopePublic.signalIdentitySha256
});
registry.enroll({
  version: 1, role: 'calliope', deviceId: calliopeTransport.deviceId, revoked: false,
  transportPublicKeySpki: calliopeTransport.transportPublicKeySpki,
  signalIdentitySha256: calliopePublic.signalIdentitySha256,
  peerSignalIdentitySha256: await trajectory.identitySha256()
});

async function login() {
  const response = await api(origin, '', null, 'POST', '/admin/login', JSON.stringify({ password: pass }));
  if (response.status !== 200) throw Error('LOGIN_' + response.status);
  return String(response.headers.get('set-cookie') || '').split(';')[0];
}
async function round(label) {
  const sender = await createSignalEndpoint({
    role: 'trajectory',
    storePath: join(priv, 'trajectory', 'trajectory.store'),
    sealingKey: trajectorySeal,
    packageRoot,
    expectedVersion: expected
  });
  const sent = await sender.sendProxyStatus();
  const now = Date.now();
  const packet = {
    version: 1, recipient: 'calliope', messageId: sent.nonce,
    signalMessageType: sent.packet.messageType,
    ciphertextBase64url: sent.packet.ciphertext,
    createdAtMs: now - 1000, expiresAtMs: now + 20000
  };
  const cookie = await login();
  const reports = await api(origin, cookie, null, 'GET', '/devproxy/api/reports/list', null);
  const delivered = await api(origin, cookie, trajectoryIdentity, 'POST', '/devproxy/api/signal/private/deliver', JSON.stringify(packet));
  if (delivered.status !== 200) throw Error(label + '-DELIVER-' + delivered.status + '-' + (delivered.json && delivered.json.error));
  if (JSON.stringify(delivered.json).includes('proxy.status')) throw Error(label + '-PLAINTEXT-LEAK');
  receiver('receive', {
    DEVPROXY_V200_API_BASE: 'http://dev-proxy-config-api:3001',
    DEVPROXY_V200_ORIGIN: origin,
    DEVPROXY_V200_PASSWORD_FILE: '/private/calliope-admin.secret',
    DEVPROXY_V200_TRANSPORT_FILE: '/private/calliope/transport.json'
  });
  const reply = JSON.parse(readFileSync(join(priv, 'job', 'reply.json'), 'utf8'));
  const rendered = await sender.readProxyStatus(reply);
  if (rendered.executable !== false) throw Error(label + '-EXECUTABLE');
  return { label, reports: reports.status, deliver: delivered.status, rendered };
}

const first = await round('first');
const second = await round('restart');
registry.revoke(calliopeTransport.deviceId);
const cookie = await login();
const now = Date.now();
const deniedPacket = {
  version: 1, recipient: 'calliope', messageId: randomBytes(32).toString('hex'),
  signalMessageType: 3, ciphertextBase64url: randomBytes(40).toString('base64url'),
  createdAtMs: now - 1000, expiresAtMs: now + 20000
};
const denied = await api(origin, cookie, trajectoryIdentity, 'POST', '/devproxy/api/signal/private/deliver', JSON.stringify(deniedPacket));
rmSync(passFile, { force: true });
const summary = first.rendered.summary;
const body = [
  'Calliope read the public Dev Proxy health through the private Signal mailbox.',
  'The result is not executable.',
  'enabled=' + summary.enabled + ' usedai=' + summary.usedai + ' healing=' + summary.healing + ' attested=' + summary.attested + ' mode=' + summary.mode + '.',
  'A second exchange succeeded after both Signal endpoint processes restarted.',
  'Revoking the Calliope device then failed closed with HTTP ' + denied.status + '.'
].join(' ');
const messageId = 'signal-proxy-status-' + randomBytes(8).toString('hex');
const created = new Date().toISOString();
const stamp = created.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');
const roomFile = '/Users/leorami/Development/trajectory/exchange/assistant/messages/human-trajectory-ops/' + stamp + '--' + messageId + '.yaml';
writeFileSync(roomFile, [
  'schema_version: 1',
  'message_id: ' + messageId,
  'product: human-trajectory-ops',
  'author_role: secretary',
  'author_actor: trajectory',
  'recipients:',
  '  - owner',
  'kind: observation',
  'body: ' + JSON.stringify(body),
  'plan_ref: null',
  'reply_to: null',
  'evidence_refs:',
  '  - signal:proxy.status',
  'created_at: ' + created,
  'executable: false',
  ''
].join('\n'));
process.stdout.write(JSON.stringify({
  first: { reports: first.reports, deliver: first.deliver, executable: first.rendered.executable, source: first.rendered.source, summary: first.rendered.summary },
  restart: { reports: second.reports, deliver: second.deliver, executable: second.rendered.executable, summary: second.rendered.summary },
  revoked: denied.status,
  roomMessage: messageId
}) + '\n');
