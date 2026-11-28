import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const peerScript = fileURLToPath(new URL('./fixtures/v192-libsignal-peer.mjs', import.meta.url));
const packageRoot = process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const ACCEPT = Object.freeze({
  version: 1, sender: 'trajectory', recipient: 'calliope',
  project: 'demo-studio', purpose: 'artifact.describe',
  artifactSha256: 'a'.repeat(64)
});

class IsolatedPeer {
  constructor(name) {
    if (!packageRoot) throw Error('V192_LIBSIGNAL_PACKAGE_ROOT_REQUIRED');
    this.name = name;
    this.pending = new Map();
    this.stderr = '';
    this.child = spawn(process.execPath, [peerScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, V192_LIBSIGNAL_PACKAGE_ROOT: packageRoot, V192_PEER_NAME: name }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-1200); });
    readline.createInterface({ input: this.child.stdout }).on('line', line => {
      try {
        const msg = JSON.parse(line);
        const waiter = this.pending.get(msg.id);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.pending.delete(msg.id);
          msg.ok ? waiter.resolve(msg.result) : waiter.reject(Error(msg.error || 'PEER_REJECTED'));
        }
      } catch { /* malformed reply will time out and fail the test */ }
    });
    this.child.once('exit', () => {
      for (const [key,waiter] of this.pending) {
        clearTimeout(waiter.timer);
        waiter.reject(Error('PEER_EXITED_' + this.name));
        this.pending.delete(key);
      }
    });
  }
  command(op, details = {}) {
    return new Promise((resolve,reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error('PEER_TIMEOUT_' + this.name + '_' + op + '_' + this.stderr));
      }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, op, ...details }) + '\n');
    });
  }
  async close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

async function setup() {
  const trajectory = new IsolatedPeer('trajectory');
  const calliope = new IsolatedPeer('calliope');
  const intruder = new IsolatedPeer('intruder');
  const peers = { trajectory, calliope, intruder };
  try {
    const identities = Object.fromEntries(await Promise.all(
      Object.entries(peers).map(async ([name,p]) => [name, await p.command('identity')])
    ));
    await trajectory.command('pin', { peer: 'calliope', publicIdentity: identities.calliope.publicIdentity });
    await calliope.command('pin', { peer: 'trajectory', publicIdentity: identities.trajectory.publicIdentity });
    return { peers, identities, teardown: async () => Promise.all(Object.values(peers).map(p => p.close())) };
  } catch (error) {
    await Promise.all(Object.values(peers).map(p => p.close()));
    throw error;
  }
}

test('two OS-isolated named endpoints complete genuine PQXDH prekey and Double Ratchet reply', { timeout: 35000 }, async () => {
  const { peers, identities, teardown } = await setup();
  try {
    assert.notEqual(identities.trajectory.pid, identities.calliope.pid);
    assert.notEqual(identities.trajectory.publicIdentity, identities.calliope.publicIdentity);
    const bundle = await peers.calliope.command('bundle');
    await peers.trajectory.command('start', { to: 'calliope', bundle });
    const packet = await peers.trajectory.command('encrypt', { to: 'calliope', message: ACCEPT });
    assert.equal(packet.messageType, 3, 'first message must be a Signal PreKey message');
    assert.equal(Buffer.from(packet.ciphertext,'hex').includes(Buffer.from(JSON.stringify(ACCEPT),'utf8')),false, 'ciphertext must not contain literal plaintext');
    const received = await peers.calliope.command('decrypt', { from: 'trajectory', packet });
    assert.deepEqual(received, { accepted:true, status:'METADATA_ONLY', sender:'trajectory', purpose:'artifact.describe',
      ownerApprovalGranted:false, exportAuthorized:false, executionAuthorized:false });
    const reply = await peers.calliope.command('encrypt', { to: 'trajectory',
      message: { version:1, sender:'calliope', recipient:'trajectory', project:'demo-studio',
        purpose:'artifact.describe', artifactSha256:'b'.repeat(64) } });
    assert.equal(reply.messageType, 2, 'reply uses an established Signal ratchet session');
    const confirmation = await peers.trajectory.command('decrypt', { from:'calliope', packet:reply });
    assert.equal(confirmation.status,'METADATA_ONLY');
    assert.equal(confirmation.sender,'calliope');
  } finally { await teardown(); }
});

test('unknown identity and wrong recipient cannot decrypt another endpoint session', { timeout: 35000 }, async () => {
  const { peers, teardown } = await setup();
  try {
    const malicious = await peers.intruder.command('bundle');
    await assert.rejects(peers.trajectory.command('start', {to:'calliope',bundle:malicious}));
    const approved = await peers.calliope.command('bundle');
    await peers.trajectory.command('start', { to:'calliope',bundle:approved });
    const packet = await peers.trajectory.command('encrypt', { to:'calliope',message:ACCEPT });
    await assert.rejects(peers.intruder.command('decrypt',{from:'trajectory',packet}));
    const real = await peers.calliope.command('decrypt',{from:'trajectory',packet});
    assert.equal(real.accepted,true);
  } finally { await teardown(); }
});

test('tampering, replay and unauthorized encrypted intent cannot grant a file export', { timeout: 35000 }, async () => {
  const { peers, teardown } = await setup();
  try {
    await peers.trajectory.command('start',{to:'calliope',bundle:await peers.calliope.command('bundle')});
    const message = await peers.trajectory.command('encrypt',{to:'calliope',message:ACCEPT});
    const last = message.ciphertext.slice(-2);
    const mutated = { ...message, ciphertext:message.ciphertext.slice(0,-2)+(last==='00'?'ff':'00') };
    await assert.rejects(peers.calliope.command('decrypt',{from:'trajectory',packet:mutated}));
    const accepted = await peers.calliope.command('decrypt',{from:'trajectory',packet:message});
    assert.equal(accepted.accepted,true);
    await assert.rejects(peers.calliope.command('decrypt',{from:'trajectory',packet:message}));
    const denied = await peers.trajectory.command('encrypt',{to:'calliope',message:{...ACCEPT,purpose:'artifact.export'}});
    const report = await peers.calliope.command('decrypt',{from:'trajectory',packet:denied});
    assert.equal(report.accepted,false);
    assert.equal(report.status,'INTENT_DENIED');
    assert.equal(report.exportAuthorized,false);
    assert.equal(report.executionAuthorized,false);
  } finally { await teardown(); }
});
