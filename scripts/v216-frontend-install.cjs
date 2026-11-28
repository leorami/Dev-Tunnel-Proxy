'use strict';

// Isolated fixture helper. This is not a live installer: every public
// operation refuses a target outside the temporary directory, and it
// refuses a git checkout. Nothing here removes that guard.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const STEPS = 5;
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];
const TEMP_PREFIX = '.v216-';
const OPEN_EXCLUSIVE = fs.constants.O_WRONLY
  | fs.constants.O_CREAT
  | fs.constants.O_EXCL
  | fs.constants.O_NOFOLLOW;
const OPEN_READ = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const PHASES = ['intent', 'created', 'written', 'metadata', 'pre-rename', 'renamed', 'journaled'];
const KNOWN_FLAGS = [
  [0x1, 'nodump'],
  [0x2, 'uchg'],
  [0x4, 'uappnd'],
  [0x8, 'opaque'],
  [0x8000, 'hidden'],
];

const CRASH_POINTS = ['journal:written'];
for (let step = 0; step < STEPS; step += 1) {
  for (const where of PHASES) CRASH_POINTS.push(`step:${step}:${where}`);
}
for (const name of DOCUMENTS) {
  for (const where of PHASES) CRASH_POINTS.push(`inverse:${name}:${where}`);
}

function crash(point) {
  if (point && process.env.V216_CRASH_AT === point) process.kill(process.pid, 'SIGKILL');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function hasGitAncestor(dir, stop) {
  let current = dir;
  while (current === stop || current.startsWith(stop + path.sep)) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    if (current === stop) break;
    current = path.dirname(current);
  }
  return false;
}

function assertIsolated(targetDir) {
  const target = fs.realpathSync(targetDir);
  const temp = fs.realpathSync(os.tmpdir());
  if (target !== temp && !target.startsWith(temp + path.sep)) {
    throw new Error('install target must stay under the temporary directory');
  }
  if (hasGitAncestor(target, temp)) throw new Error('install target must not be a git checkout');
  return target;
}

function assertNoSymlinkEntries(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const link = fs.lstatSync(file);
    if (link.isSymbolicLink()) throw new Error('custody symlink');
    if (link.isDirectory()) assertNoSymlinkEntries(file);
  }
}

function assertCustody(custodyDir, targetDir, docroot) {
  if (!docroot) throw new Error('docroot required');
  const custodyLink = fs.lstatSync(custodyDir);
  if (custodyLink.isSymbolicLink()) throw new Error('custody symlink');
  const custody = assertIsolated(custodyDir);
  const target = assertIsolated(targetDir);
  const root = assertIsolated(docroot);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('target must stay inside the document root');
  }
  if (custody === target || custody.startsWith(target + path.sep) || target.startsWith(custody + path.sep)) {
    throw new Error('custody must stay outside the served directory');
  }
  if (custody === root || custody.startsWith(root + path.sep) || root.startsWith(custody + path.sep)) {
    throw new Error('custody must stay outside the served document root');
  }
  if (!custodyLink.isDirectory() || (custodyLink.mode & 0o777) !== 0o700) {
    throw new Error('custody mode must be 0700');
  }
  if (custodyLink.uid !== process.getuid()) throw new Error('custody owner');
  assertNoSymlinkEntries(custody);
  return custody;
}

function fsyncDir(dir) {
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function runTool(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    const detail = (result.stderr || result.error && result.error.message || '').trim();
    throw new Error(`metadata uncopyable: ${cmd}${detail ? ` (${detail})` : ''}`);
  }
  return result.stdout || '';
}

function runToolOptional(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`metadata uncopyable: ${cmd} (${result.error.message})`);
  if (result.status !== 0) {
    const detail = (result.stderr || '').trim();
    if (!result.stdout && /no such attribute|no matches|operation not supported/i.test(detail)) return '';
    throw new Error(`metadata uncopyable: ${cmd}${detail ? ` (${detail})` : ''}`);
  }
  return result.stdout || '';
}

function readAcl(file) {
  if (process.platform === 'darwin') {
    const stdout = runTool('ls', ['-le', file]);
    return stdout.split('\n').map((line) => line.match(/^\s+\d+:\s+(.*)$/)).filter(Boolean).map((match) => match[1]);
  }
  if (process.platform === 'linux') {
    return runTool('getfacl', ['-c', '-p', '--', file]).replace(/\n$/, '');
  }
  throw new Error('metadata uncopyable: platform');
}

function writeAcl(file, acl) {
  if (process.platform === 'darwin') {
    runTool('chmod', ['-N', file]);
    for (const entry of acl || []) runTool('chmod', ['+a', entry, file]);
    return;
  }
  if (process.platform === 'linux') {
    if (!acl) return;
    runTool('setfacl', ['--set-file=-', '--', file], { input: `${acl}\n` });
    return;
  }
  throw new Error('metadata uncopyable: platform');
}

function encodeAttr(bytes) {
  return { encoding: 'base64', bytes: Buffer.from(bytes).toString('base64') };
}

function readXattrs(file) {
  if (process.platform === 'darwin') {
    const names = runToolOptional('xattr', [file]).split('\n').filter(Boolean);
    const attrs = {};
    for (const name of names) {
      const hex = runTool('xattr', ['-px', name, file]).replace(/\s+/g, '').toLowerCase();
      if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) throw new Error(`metadata uncopyable: ${name}`);
      attrs[name] = encodeAttr(Buffer.from(hex, 'hex'));
    }
    return attrs;
  }
  if (process.platform === 'linux') {
    const stdout = runToolOptional('getfattr', ['-d', '-m', '-', '-e', 'base64', '--absolute-names', '--', file]);
    const attrs = {};
    for (const line of stdout.split('\n')) {
      const match = line.match(/^([A-Za-z0-9_.-]+)=0s([A-Za-z0-9+/=]*)$/);
      if (!match) continue;
      attrs[match[1]] = { encoding: 'base64', bytes: match[2] };
    }
    return attrs;
  }
  throw new Error('metadata uncopyable: platform');
}

function writeXattrs(file, attrs) {
  const entries = Object.entries(attrs || {});
  if (entries.length === 0) return;
  if (process.platform === 'darwin') {
    for (const [name, spec] of entries) {
      const hex = Buffer.from(spec.bytes, 'base64').toString('hex');
      runTool('xattr', ['-wx', name, hex, file]);
    }
    return;
  }
  if (process.platform === 'linux') {
    const lines = ['# file: tracked'];
    for (const [name, spec] of entries) lines.push(`${name}=0s${spec.bytes}`);
    runTool('setfattr', ['--restore=-', '--', file], { input: `${lines.join('\n')}\n` });
    return;
  }
  throw new Error('metadata uncopyable: platform');
}

function readFlags(file) {
  if (process.platform !== 'darwin') return 0;
  const raw = runTool('stat', ['-f', '%f', file]).trim();
  const flags = Number(raw);
  if (!Number.isInteger(flags) || flags < 0) throw new Error('metadata uncopyable: flags');
  return flags;
}

function writeFlags(file, flags) {
  if (!flags) return;
  if (process.platform !== 'darwin') throw new Error('metadata uncopyable: flags');
  const names = [];
  let known = 0;
  for (const [bit, name] of KNOWN_FLAGS) {
    known |= bit;
    if (flags & bit) names.push(name);
  }
  if ((flags & ~known) !== 0 || names.length === 0) throw new Error('metadata uncopyable: flags');
  runTool('chflags', [names.join(','), file]);
}

function metadataEqual(left, right) {
  if (left.uid !== right.uid || left.gid !== right.gid || left.mode !== right.mode || left.flags !== right.flags) {
    return false;
  }
  if (right.acl != null && JSON.stringify(left.acl) !== JSON.stringify(right.acl)) return false;
  if (right.xattrs != null && JSON.stringify(left.xattrs) !== JSON.stringify(right.xattrs)) return false;
  return true;
}

function readFileNoFollow(file) {
  const fd = fs.openSync(file, OPEN_READ);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error(`single-link:${path.basename(file)}`);
    return { bytes: fs.readFileSync(fd), stat };
  } finally {
    fs.closeSync(fd);
  }
}

function inspectFile(dir, name) {
  const file = path.join(dir, name);
  const link = fs.lstatSync(file);
  if (link.isSymbolicLink() || !link.isFile()) throw new Error(`link drift:${name}`);
  if (link.nlink !== 1) throw new Error(`single-link:${name}`);
  const parent = fs.realpathSync(path.dirname(file));
  if (parent !== fs.realpathSync(dir)) throw new Error(`target drift:${name}`);
  const { bytes, stat } = readFileNoFollow(file);
  return {
    bytes,
    sha: sha256(bytes),
    uid: stat.uid,
    gid: stat.gid,
    mode: stat.mode & 0o777,
    flags: readFlags(file),
    dev: stat.dev,
    ino: stat.ino,
    acl: readAcl(file),
    xattrs: readXattrs(file),
  };
}

function rawExclusiveTemp(dir) {
  const name = `${TEMP_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
  const tmp = path.join(dir, name);
  const fd = fs.openSync(tmp, OPEN_EXCLUSIVE, 0o600);
  const stat = fs.fstatSync(fd);
  const link = fs.lstatSync(tmp);
  if (!stat.isFile() || stat.nlink !== 1 || link.isSymbolicLink() || !link.isFile() || link.nlink !== 1) {
    fs.closeSync(fd);
    throw new Error('temp was not an exclusive file');
  }
  return { fd, path: tmp, name, dev: stat.dev, ino: stat.ino };
}

function journalPath(custodyDir) {
  return path.join(custodyDir, 'journal.json');
}

function writeJournal(custodyDir, journal, point) {
  fs.mkdirSync(custodyDir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify(journal));
  const tmp = rawExclusiveTemp(custodyDir);
  try {
    fs.writeSync(tmp.fd, bytes);
    fs.fsyncSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    fs.renameSync(tmp.path, journalPath(custodyDir));
    fsyncDir(custodyDir);
  } catch (error) {
    if (tmp.fd != null) fs.closeSync(tmp.fd);
    try {
      const link = fs.lstatSync(tmp.path);
      if (link.isFile() && !link.isSymbolicLink() && link.dev === tmp.dev && link.ino === tmp.ino) fs.unlinkSync(tmp.path);
    } catch { /* already renamed */ }
    throw error;
  }
  if (point) crash(point);
}

function isSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function readJournal(custodyDir) {
  let bytes;
  try {
    bytes = readFileNoFollow(journalPath(custodyDir)).bytes;
  } catch (error) {
    throw new Error(`journal is not readable (${error.code || error.message})`);
  }
  let journal;
  try {
    journal = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('journal is not a V217 custody record');
  }
  if (!journal || journal.version !== 2 || !/^[0-9a-f]{32}$/.test(journal.transactionId || '')) {
    throw new Error('journal is not a V217 custody record');
  }
  if (!journal.identity || !Number.isInteger(journal.identity.docroot?.dev) || !Number.isInteger(journal.identity.target?.ino)) {
    throw new Error('journal is not a V217 custody record');
  }
  if (!journal.documents || !journal.assets || !Array.isArray(journal.temps)) {
    throw new Error('journal is not a V217 custody record');
  }
  for (const name of DOCUMENTS) {
    const spec = journal.documents[name];
    if (!spec || !isSha(spec.previousSha) || !isSha(spec.installedSha)) {
      throw new Error('journal is not a V217 custody record');
    }
  }
  if (!journal.assets[journal.cssName] || !isSha(journal.assets[journal.cssName].sha)) {
    throw new Error('journal is not a V217 custody record');
  }
  if (!journal.assets[journal.jsName] || !isSha(journal.assets[journal.jsName].sha)) {
    throw new Error('journal is not a V217 custody record');
  }
  for (const temp of journal.temps) {
    if (!temp || typeof temp.name !== 'string' || !temp.name.startsWith(TEMP_PREFIX)) {
      throw new Error('journal temp is not transaction owned');
    }
    if (temp.transactionId !== journal.transactionId || !isSha(temp.expectedHash)) {
      throw new Error('journal temp is not transaction owned');
    }
    if (temp.dev !== null && (!Number.isInteger(temp.dev) || !Number.isInteger(temp.ino))) {
      throw new Error('journal temp is not transaction owned');
    }
  }
  return journal;
}

function directoryIdentity(dir) {
  const stat = fs.statSync(dir);
  return { dev: stat.dev, ino: stat.ino };
}

function assertStableIdentity(journal, docroot, targetDir) {
  const root = directoryIdentity(docroot);
  const target = directoryIdentity(targetDir);
  if (root.dev !== journal.identity.docroot.dev || root.ino !== journal.identity.docroot.ino) {
    throw new Error('identity drift:docroot');
  }
  if (target.dev !== journal.identity.target.dev || target.ino !== journal.identity.target.ino) {
    throw new Error('identity drift:target');
  }
}

function trackedTemp(dir, journal, custodyDir, point, bytes) {
  const expectedHash = sha256(bytes);
  if (process.env.V216_TEMP_NAME) {
    const planted = path.join(dir, process.env.V216_TEMP_NAME);
    try {
      const link = fs.lstatSync(planted);
      if (link.isSymbolicLink() || link.isFile()) {
        // An existing name is not this transaction. Leave it in place.
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const name = `${TEMP_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
  const intent = {
    name,
    transactionId: journal.transactionId,
    dev: null,
    ino: null,
    expectedSize: bytes.length,
    expectedHash,
    phase: 'intent',
  };
  journal.temps.push(intent);
  writeJournal(custodyDir, journal);
  crash(point ? `${point}:intent` : '');
  const tmp = path.join(dir, name);
  let fd;
  try {
    fd = fs.openSync(tmp, OPEN_EXCLUSIVE, 0o600);
  } catch (error) {
    intent.phase = 'refused';
    writeJournal(custodyDir, journal);
    throw error;
  }
  const stat = fs.fstatSync(fd);
  const link = fs.lstatSync(tmp);
  if (!stat.isFile() || stat.nlink !== 1 || link.isSymbolicLink() || !link.isFile() || link.nlink !== 1) {
    fs.closeSync(fd);
    throw new Error('temp was not an exclusive file');
  }
  intent.dev = stat.dev;
  intent.ino = stat.ino;
  intent.phase = 'created';
  writeJournal(custodyDir, journal);
  crash(point ? `${point}:created` : '');
  return { fd, path: tmp, intent };
}

function releaseIntent(journal, intent) {
  journal.temps = journal.temps.filter((temp) => temp !== intent);
}

function commitBytes(dir, name, bytes, meta, point, journal, custodyDir, docroot) {
  assertStableIdentity(journal, docroot, dir);
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) {
    const current = fs.lstatSync(dest);
    const recorded = journal.documents[name];
    if (recorded && (current.dev !== recorded.dev || current.ino !== recorded.ino)) {
      throw new Error(`identity drift:${name}`);
    }
  }
  const tmp = trackedTemp(dir, journal, custodyDir, point, bytes);
  try {
    fs.writeSync(tmp.fd, bytes);
    crash(point ? `${point}:written` : '');
    fs.fsyncSync(tmp.fd);
    fs.fchmodSync(tmp.fd, meta.mode);
    try {
      fs.fchownSync(tmp.fd, meta.uid, meta.gid);
    } catch (error) {
      throw new Error(`metadata uncopyable: owner ${name} (${error.code || error.message})`);
    }
    fs.fsyncSync(tmp.fd);
    const beforeClose = fs.fstatSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    if (!beforeClose.isFile() || beforeClose.nlink !== 1 || (beforeClose.mode & 0o777) !== meta.mode) {
      throw new Error(`temp integrity:${name}`);
    }
    if (beforeClose.dev !== tmp.intent.dev || beforeClose.ino !== tmp.intent.ino) {
      throw new Error(`temp integrity:${name}`);
    }
    if (meta.acl != null) writeAcl(tmp.path, meta.acl);
    writeXattrs(tmp.path, meta.xattrs);
    writeFlags(tmp.path, meta.flags);
    crash(point ? `${point}:metadata` : '');
    const wrote = readFileNoFollow(tmp.path);
    const copied = {
      uid: wrote.stat.uid,
      gid: wrote.stat.gid,
      mode: wrote.stat.mode & 0o777,
      flags: readFlags(tmp.path),
      acl: readAcl(tmp.path),
      xattrs: readXattrs(tmp.path),
    };
    if (!wrote.bytes.equals(bytes) || wrote.stat.nlink !== 1 || !metadataEqual(copied, meta)) {
      throw new Error(`metadata uncopyable:${name}`);
    }
    assertStableIdentity(journal, docroot, dir);
    crash(point ? `${point}:pre-rename` : '');
    fs.renameSync(tmp.path, dest);
    fsyncDir(dir);
    crash(point ? `${point}:renamed` : '');
    const after = readFileNoFollow(dest);
    const link = fs.lstatSync(dest);
    if (!after.bytes.equals(bytes) || !link.isFile() || link.isSymbolicLink() || link.nlink !== 1) {
      throw new Error(`rename integrity:${name}`);
    }
    if ((link.mode & 0o777) !== meta.mode || link.uid !== meta.uid || link.gid !== meta.gid) {
      throw new Error(`metadata drift:${name}`);
    }
    assertStableIdentity(journal, docroot, dir);
    if (journal.documents[name]) {
      journal.documents[name].dev = link.dev;
      journal.documents[name].ino = link.ino;
    }
    releaseIntent(journal, tmp.intent);
  } catch (error) {
    if (tmp.fd != null) {
      try { fs.closeSync(tmp.fd); } catch { /* already closed */ }
    }
    try {
      const link = fs.lstatSync(tmp.path);
      if (link.isFile() && !link.isSymbolicLink() && link.dev === tmp.intent.dev && link.ino === tmp.intent.ino) {
        fs.unlinkSync(tmp.path);
      }
    } catch { /* temp already renamed or absent */ }
    throw error;
  }
}

function storedBytes(file, expectedSha) {
  const { bytes } = readFileNoFollow(file);
  if (sha256(bytes) !== expectedSha) throw new Error(`custody drift:${path.basename(file)}`);
  return bytes;
}

function payloadPath(custodyDir, name) {
  return path.join(custodyDir, 'payload', name);
}

function preimagePath(custodyDir, name) {
  return path.join(custodyDir, 'preimages', name);
}

function copyExclusive(dir, name, bytes, journal, custodyDir) {
  const tmp = trackedTemp(dir, journal, custodyDir, '', bytes);
  try {
    fs.writeSync(tmp.fd, bytes);
    fs.fsyncSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    const wrote = readFileNoFollow(tmp.path);
    if (!wrote.bytes.equals(bytes) || wrote.stat.dev !== tmp.intent.dev || wrote.stat.ino !== tmp.intent.ino) {
      throw new Error(`temp integrity:${name}`);
    }
    fs.renameSync(tmp.path, path.join(dir, name));
    fsyncDir(dir);
    releaseIntent(journal, tmp.intent);
  } catch (error) {
    if (tmp.fd != null) fs.closeSync(tmp.fd);
    try {
      const link = fs.lstatSync(tmp.path);
      if (link.isFile() && link.dev === tmp.intent.dev && link.ino === tmp.intent.ino) fs.unlinkSync(tmp.path);
    } catch { /* already gone */ }
    throw error;
  }
}

function probeMetadata(custodyDir, spec) {
  const tmp = rawExclusiveTemp(custodyDir);
  try {
    fs.fchmodSync(tmp.fd, spec.mode);
    try {
      fs.fchownSync(tmp.fd, spec.uid, spec.gid);
    } catch (error) {
      throw new Error(`metadata uncopyable: owner (${error.code || error.message})`);
    }
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    writeAcl(tmp.path, spec.acl);
    writeXattrs(tmp.path, spec.xattrs);
    writeFlags(tmp.path, spec.flags);
    const copied = {
      uid: fs.statSync(tmp.path).uid,
      gid: fs.statSync(tmp.path).gid,
      mode: fs.statSync(tmp.path).mode & 0o777,
      flags: readFlags(tmp.path),
      acl: readAcl(tmp.path),
      xattrs: readXattrs(tmp.path),
    };
    if (!metadataEqual(copied, spec)) throw new Error('metadata uncopyable: probe');
  } finally {
    if (tmp.fd != null) {
      try { fs.closeSync(tmp.fd); } catch { /* closed */ }
    }
    try {
      const link = fs.lstatSync(tmp.path);
      if (link.isFile() && link.dev === tmp.dev && link.ino === tmp.ino) fs.unlinkSync(tmp.path);
    } catch { /* already gone */ }
  }
}

function buildJournal(targetDir, custodyDir, docroot, release) {
  const documents = {};
  const inspected = {};
  for (const name of DOCUMENTS) {
    const info = inspectFile(targetDir, name);
    const key = name.replace('.html', '');
    if (info.sha !== release.previous[key]) throw new Error(`drift:${name}`);
    const installed = Buffer.from(release.documents[key]);
    documents[name] = {
      previousSha: info.sha,
      installedSha: sha256(installed),
      uid: info.uid,
      gid: info.gid,
      mode: info.mode,
      flags: info.flags,
      acl: info.acl,
      xattrs: info.xattrs,
      dev: info.dev,
      ino: info.ino,
      state: 'pending',
    };
    inspected[name] = installed;
    probeMetadata(custodyDir, documents[name]);
  }
  const journal = {
    version: 2,
    transactionId: crypto.randomBytes(16).toString('hex'),
    cssName: release.cssName,
    jsName: release.jsName,
    identity: {
      docroot: directoryIdentity(docroot),
      target: directoryIdentity(targetDir),
    },
    documents,
    assets: {},
    temps: [],
  };
  const css = Buffer.from(release.cssBytes);
  const js = Buffer.from(release.jsBytes);
  journal.assets[release.cssName] = { sha: sha256(css), state: 'pending' };
  journal.assets[release.jsName] = { sha: sha256(js), state: 'pending' };
  fs.mkdirSync(path.join(custodyDir, 'preimages'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(custodyDir, 'payload'), { recursive: true, mode: 0o700 });
  writeJournal(custodyDir, journal);
  for (const name of DOCUMENTS) {
    copyExclusive(path.join(custodyDir, 'preimages'), name, readFileNoFollow(path.join(targetDir, name)).bytes, journal, custodyDir);
    copyExclusive(path.join(custodyDir, 'payload'), name, inspected[name], journal, custodyDir);
  }
  copyExclusive(path.join(custodyDir, 'payload'), 'asset-css', css, journal, custodyDir);
  copyExclusive(path.join(custodyDir, 'payload'), 'asset-js', js, journal, custodyDir);
  writeJournal(custodyDir, journal, 'journal:written');
  return journal;
}

function currentMetadata(dir, name) {
  const info = inspectFile(dir, name);
  return {
    sha: info.sha,
    uid: info.uid,
    gid: info.gid,
    mode: info.mode,
    flags: info.flags,
    acl: info.acl,
    xattrs: info.xattrs,
  };
}

function assertDocumentReady(targetDir, name, spec, expectedSha) {
  const info = currentMetadata(targetDir, name);
  if (info.sha !== expectedSha) throw new Error(`drift:${name}`);
  if (!metadataEqual(info, spec)) throw new Error(`metadata drift:${name}`);
}

function applyAsset(targetDir, custodyDir, docroot, journal, name, payloadName, point) {
  const spec = journal.assets[name];
  const dest = path.join(targetDir, name);
  const bytes = storedBytes(payloadPath(custodyDir, payloadName), spec.sha);
  let exists = false;
  try {
    fs.lstatSync(dest);
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (exists) {
    const info = inspectFile(targetDir, name);
    if (info.sha !== spec.sha) throw new Error(`drift:${name}`);
    spec.state = 'installed';
    return;
  }
  const meta = {
    mode: 0o644,
    uid: process.getuid(),
    gid: process.getgid(),
    flags: 0,
    acl: null,
    xattrs: {},
  };
  commitBytes(targetDir, name, bytes, meta, point, journal, custodyDir, docroot);
  spec.state = 'installed';
}

function applyDocument(targetDir, custodyDir, docroot, journal, name, point) {
  const spec = journal.documents[name];
  assertDocumentReady(targetDir, name, spec, spec.previousSha);
  const bytes = storedBytes(payloadPath(custodyDir, name), spec.installedSha);
  commitBytes(targetDir, name, bytes, spec, point, journal, custodyDir, docroot);
  spec.state = 'installed';
}

function installRelease(targetDir, release, options = {}) {
  assertIsolated(targetDir);
  assertCustody(options.custodyDir, targetDir, options.docroot);
  const through = options.through == null ? STEPS : options.through;
  const from = options.from == null ? 0 : options.from;
  if (!Number.isInteger(through) || !Number.isInteger(from) || from < 0 || through > STEPS || from > through) {
    throw new Error('step out of range');
  }
  let journal;
  if (fs.existsSync(journalPath(options.custodyDir))) journal = readJournal(options.custodyDir);
  else journal = buildJournal(targetDir, options.custodyDir, options.docroot, release);
  assertStableIdentity(journal, options.docroot, targetDir);
  const steps = [
    () => applyAsset(targetDir, options.custodyDir, options.docroot, journal, journal.cssName, 'asset-css', 'step:0'),
    () => applyAsset(targetDir, options.custodyDir, options.docroot, journal, journal.jsName, 'asset-js', 'step:1'),
    () => applyDocument(targetDir, options.custodyDir, options.docroot, journal, 'health.html', 'step:2'),
    () => applyDocument(targetDir, options.custodyDir, options.docroot, journal, 'reports.html', 'step:3'),
    () => applyDocument(targetDir, options.custodyDir, options.docroot, journal, 'status.html', 'step:4'),
  ];
  for (let index = from; index < through; index += 1) {
    steps[index]();
    writeJournal(options.custodyDir, journal);
    crash(`step:${index}:journaled`);
  }
  return journal;
}

function restoreDocument(targetDir, custodyDir, docroot, journal, name) {
  const spec = journal.documents[name];
  if (spec.state !== 'installed') return;
  assertDocumentReady(targetDir, name, spec, spec.installedSha);
  const bytes = storedBytes(preimagePath(custodyDir, name), spec.previousSha);
  commitBytes(targetDir, name, bytes, spec, `inverse:${name}`, journal, custodyDir, docroot);
  spec.state = 'restored';
}

function rollbackRelease(targetDir, custodyDir, docroot) {
  assertIsolated(targetDir);
  assertCustody(custodyDir, targetDir, docroot);
  const journal = readJournal(custodyDir);
  assertStableIdentity(journal, docroot, targetDir);
  for (const name of [...DOCUMENTS].reverse()) {
    restoreDocument(targetDir, custodyDir, docroot, journal, name);
    writeJournal(custodyDir, journal);
    crash(`inverse:${name}:journaled`);
  }
  return journal;
}

function removeOwnedTemps(dir, journal) {
  for (const temp of journal.temps) {
    if (temp.dev === null || temp.ino === null) continue;
    const file = path.join(dir, temp.name);
    let link;
    try {
      link = fs.lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (link.isSymbolicLink() || !link.isFile()) continue;
    if (link.dev !== temp.dev || link.ino !== temp.ino) continue;
    fs.unlinkSync(file);
  }
}

function recoverRelease(targetDir, custodyDir, docroot) {
  assertIsolated(targetDir);
  assertCustody(custodyDir, targetDir, docroot);
  const journal = readJournal(custodyDir);
  assertStableIdentity(journal, docroot, targetDir);
  removeOwnedTemps(targetDir, journal);
  removeOwnedTemps(custodyDir, journal);
  journal.temps = [];
  for (const name of DOCUMENTS) {
    const spec = journal.documents[name];
    const info = inspectFile(targetDir, name);
    if (info.sha === spec.previousSha) spec.state = 'pending';
    else if (info.sha === spec.installedSha) spec.state = 'installed';
    else throw new Error(`unrecoverable:${name}`);
    if (!metadataEqual(info, spec)) throw new Error(`metadata drift:${name}`);
    spec.dev = info.dev;
    spec.ino = info.ino;
  }
  for (const [name, spec] of Object.entries(journal.assets)) {
    const file = path.join(targetDir, name);
    let link = null;
    try { link = fs.lstatSync(file); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!link) {
      spec.state = 'pending';
      continue;
    }
    const info = inspectFile(targetDir, name);
    if (info.sha !== spec.sha) throw new Error(`unrecoverable:${name}`);
    spec.state = 'installed';
  }
  writeJournal(custodyDir, journal);
  return journal;
}

function decodeRelease(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const documents = {};
  for (const [key, value] of Object.entries(raw.documents)) documents[key] = Buffer.from(value, 'base64');
  return {
    cssName: raw.cssName,
    jsName: raw.jsName,
    cssBytes: Buffer.from(raw.cssBytes, 'base64'),
    jsBytes: Buffer.from(raw.jsBytes, 'base64'),
    documents,
    previous: raw.previous,
  };
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'install') {
    const [targetDir, custodyDir, releaseFile, docroot, through, from] = rest;
    installRelease(targetDir, decodeRelease(releaseFile), {
      custodyDir,
      docroot,
      through: through == null ? undefined : Number(through),
      from: from == null ? undefined : Number(from),
    });
    return;
  }
  if (command === 'rollback') {
    const [targetDir, custodyDir, docroot] = rest;
    rollbackRelease(targetDir, custodyDir, docroot);
    return;
  }
  if (command === 'recover') {
    const [targetDir, custodyDir, docroot] = rest;
    recoverRelease(targetDir, custodyDir, docroot);
    return;
  }
  throw new Error('usage: install|rollback|recover');
}

module.exports = {
  STEPS,
  DOCUMENTS,
  CRASH_POINTS,
  TEMP_PREFIX,
  sha256,
  assertIsolated,
  assertCustody,
  inspectFile,
  installRelease,
  rollbackRelease,
  recoverRelease,
  decodeRelease,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}
