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

const CRASH_POINTS = ['journal:written'];
for (let step = 0; step < STEPS; step += 1) {
  for (const where of ['created', 'written', 'renamed', 'journaled']) {
    CRASH_POINTS.push(`step:${step}:${where}`);
  }
}
for (const name of DOCUMENTS) {
  CRASH_POINTS.push(`inverse:${name}:renamed`, `inverse:${name}:journaled`);
}

function crash(point) {
  if (process.env.V216_CRASH_AT === point) process.kill(process.pid, 'SIGKILL');
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

function assertCustody(custodyDir, targetDir) {
  const custody = assertIsolated(custodyDir);
  const target = fs.realpathSync(targetDir);
  if (custody === target || custody.startsWith(target + path.sep) || target.startsWith(custody + path.sep)) {
    throw new Error('custody must stay outside the served directory');
  }
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
    throw new Error(`metadata unsupported: ${cmd}${detail ? ` (${detail})` : ''}`);
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
  throw new Error('metadata unsupported: platform');
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
  throw new Error('metadata unsupported: platform');
}

function readXattrs(file) {
  if (process.platform === 'darwin') {
    const names = runTool('xattr', [file]).split('\n').filter(Boolean);
    const attrs = {};
    for (const name of names) attrs[name] = runTool('xattr', ['-p', name, file]).replace(/\n$/, '');
    return attrs;
  }
  if (process.platform === 'linux') {
    const stdout = runTool('getfattr', ['-d', '--absolute-names', '--', file]);
    const attrs = {};
    for (const line of stdout.split('\n')) {
      const match = line.match(/^(user\.[^=]+)="(.*)"$/);
      if (match) attrs[match[1]] = match[2].replace(/\\"/g, '"');
    }
    return attrs;
  }
  throw new Error('metadata unsupported: platform');
}

function writeXattrs(file, attrs) {
  if (process.platform === 'darwin') {
    for (const [name, value] of Object.entries(attrs)) runTool('xattr', ['-w', name, value, file]);
    return;
  }
  if (process.platform === 'linux') {
    for (const [name, value] of Object.entries(attrs)) runTool('setfattr', ['-n', name, '-v', value, '--', file]);
    return;
  }
  throw new Error('metadata unsupported: platform');
}

function metadataEqual(left, right) {
  return left.uid === right.uid && left.gid === right.gid && left.mode === right.mode
    && JSON.stringify(left.acl) === JSON.stringify(right.acl)
    && JSON.stringify(left.xattrs) === JSON.stringify(right.xattrs);
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
    acl: readAcl(file),
    xattrs: readXattrs(file),
  };
}

function exclusiveTemp(dir, forceName) {
  const names = [];
  if (forceName && process.env.V216_TEMP_NAME) names.push(process.env.V216_TEMP_NAME);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    names.push(`${TEMP_PREFIX}${crypto.randomBytes(8).toString('hex')}`);
  }
  let last = new Error('temp create failed');
  for (const name of names) {
    const tmp = path.join(dir, name);
    let fd;
    try {
      fd = fs.openSync(tmp, OPEN_EXCLUSIVE, 0o600);
    } catch (error) {
      last = error;
      if (error.code === 'EEXIST' || error.code === 'ELOOP' || error.code === 'EPERM') continue;
      throw error;
    }
    const stat = fs.fstatSync(fd);
    const link = fs.lstatSync(tmp);
    if (!stat.isFile() || stat.nlink !== 1 || link.isSymbolicLink() || !link.isFile() || link.nlink !== 1) {
      fs.closeSync(fd);
      throw new Error('temp was not an exclusive file');
    }
    return { fd, path: tmp };
  }
  throw last;
}

function writeExclusive(dir, name, bytes, mode) {
  const tmp = exclusiveTemp(dir);
  try {
    fs.writeSync(tmp.fd, bytes);
    fs.fsyncSync(tmp.fd);
    fs.fchmodSync(tmp.fd, mode);
    fs.fsyncSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    fs.renameSync(tmp.path, path.join(dir, name));
    fsyncDir(dir);
  } catch (error) {
    if (tmp.fd != null) fs.closeSync(tmp.fd);
    if (tmp.path) {
      try {
        const link = fs.lstatSync(tmp.path);
        if (link.isFile() && !link.isSymbolicLink()) fs.unlinkSync(tmp.path);
      } catch { /* already gone */ }
    }
    throw error;
  }
}

function journalPath(custodyDir) {
  return path.join(custodyDir, 'journal.json');
}

function writeJournal(custodyDir, journal, point) {
  fs.mkdirSync(custodyDir, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(JSON.stringify(journal));
  const tmp = exclusiveTemp(custodyDir, false);
  try {
    fs.writeSync(tmp.fd, bytes);
    fs.fsyncSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    fs.renameSync(tmp.path, journalPath(custodyDir));
    fsyncDir(custodyDir);
  } catch (error) {
    if (tmp.fd != null) fs.closeSync(tmp.fd);
    throw error;
  }
  if (point) crash(point);
}

function readJournal(custodyDir) {
  const { bytes } = readFileNoFollow(journalPath(custodyDir));
  const journal = JSON.parse(bytes.toString('utf8'));
  if (!journal || journal.version !== 1 || !journal.documents || !journal.assets) {
    throw new Error('journal is not a V216 custody record');
  }
  return journal;
}

function payloadPath(custodyDir, name) {
  return path.join(custodyDir, 'payload', name);
}

function preimagePath(custodyDir, name) {
  return path.join(custodyDir, 'preimages', name);
}

function buildJournal(targetDir, custodyDir, release) {
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
      acl: info.acl,
      xattrs: info.xattrs,
      state: 'pending',
    };
    inspected[name] = installed;
  }
  fs.mkdirSync(path.join(custodyDir, 'preimages'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(custodyDir, 'payload'), { recursive: true, mode: 0o700 });
  for (const name of DOCUMENTS) {
    writeExclusive(path.join(custodyDir, 'preimages'), name, readFileNoFollow(path.join(targetDir, name)).bytes, 0o600);
    writeExclusive(path.join(custodyDir, 'payload'), name, inspected[name], 0o600);
  }
  const assets = {};
  const css = Buffer.from(release.cssBytes);
  const js = Buffer.from(release.jsBytes);
  assets[release.cssName] = { sha: sha256(css), state: 'pending' };
  assets[release.jsName] = { sha: sha256(js), state: 'pending' };
  writeExclusive(path.join(custodyDir, 'payload'), 'asset-css', css, 0o600);
  writeExclusive(path.join(custodyDir, 'payload'), 'asset-js', js, 0o600);
  const journal = {
    version: 1,
    cssName: release.cssName,
    jsName: release.jsName,
    documents,
    assets,
  };
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
    acl: info.acl,
    xattrs: info.xattrs,
  };
}

function assertDocumentReady(targetDir, name, spec, expectedSha) {
  const info = currentMetadata(targetDir, name);
  if (info.sha !== expectedSha) throw new Error(`drift:${name}`);
  if (!metadataEqual(info, spec)) throw new Error(`metadata drift:${name}`);
}

function commitBytes(dir, name, bytes, meta, point) {
  const dest = path.join(dir, name);
  const tmp = exclusiveTemp(dir, true);
  crash(`${point}:created`);
  try {
    fs.writeSync(tmp.fd, bytes);
    crash(`${point}:written`);
    fs.fsyncSync(tmp.fd);
    fs.fchmodSync(tmp.fd, meta.mode);
    try {
      fs.fchownSync(tmp.fd, meta.uid, meta.gid);
    } catch (error) {
      throw new Error(`metadata unsupported: owner ${name} (${error.code || error.message})`);
    }
    fs.fsyncSync(tmp.fd);
    const beforeClose = fs.fstatSync(tmp.fd);
    fs.closeSync(tmp.fd);
    tmp.fd = null;
    if (!beforeClose.isFile() || beforeClose.nlink !== 1 || (beforeClose.mode & 0o777) !== meta.mode) {
      throw new Error(`temp integrity:${name}`);
    }
    writeAcl(tmp.path, meta.acl);
    writeXattrs(tmp.path, meta.xattrs);
    const wrote = readFileNoFollow(tmp.path);
    if (!wrote.bytes.equals(bytes) || wrote.stat.nlink !== 1) throw new Error(`temp integrity:${name}`);
    fs.renameSync(tmp.path, dest);
    fsyncDir(dir);
    crash(`${point}:renamed`);
    const after = readFileNoFollow(dest);
    const link = fs.lstatSync(dest);
    if (!after.bytes.equals(bytes) || !link.isFile() || link.isSymbolicLink() || link.nlink !== 1) {
      throw new Error(`rename integrity:${name}`);
    }
    if ((link.mode & 0o777) !== meta.mode || link.uid !== meta.uid || link.gid !== meta.gid) {
      throw new Error(`metadata drift:${name}`);
    }
  } catch (error) {
    if (tmp.fd != null) {
      try { fs.closeSync(tmp.fd); } catch { /* already closed */ }
    }
    try {
      const link = fs.lstatSync(tmp.path);
      if ((link.isFile() || link.isSymbolicLink()) && path.basename(tmp.path).startsWith(TEMP_PREFIX)) {
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

function applyAsset(targetDir, custodyDir, journal, name, payloadName, point) {
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
    acl: process.platform === 'linux' ? '' : [],
    xattrs: {},
  };
  commitBytes(targetDir, name, bytes, meta, point);
  spec.state = 'installed';
}

function applyDocument(targetDir, custodyDir, journal, name, point) {
  const spec = journal.documents[name];
  assertDocumentReady(targetDir, name, spec, spec.previousSha);
  const bytes = storedBytes(payloadPath(custodyDir, name), spec.installedSha);
  commitBytes(targetDir, name, bytes, spec, point);
  spec.state = 'installed';
}

function installRelease(targetDir, release, options = {}) {
  assertIsolated(targetDir);
  assertCustody(options.custodyDir, targetDir);
  const through = options.through == null ? STEPS : options.through;
  const from = options.from == null ? 0 : options.from;
  if (!Number.isInteger(through) || !Number.isInteger(from) || from < 0 || through > STEPS || from > through) {
    throw new Error('step out of range');
  }
  let journal;
  if (fs.existsSync(journalPath(options.custodyDir))) journal = readJournal(options.custodyDir);
  else journal = buildJournal(targetDir, options.custodyDir, release);
  const steps = [
    () => applyAsset(targetDir, options.custodyDir, journal, journal.cssName, 'asset-css', 'step:0'),
    () => applyAsset(targetDir, options.custodyDir, journal, journal.jsName, 'asset-js', 'step:1'),
    () => applyDocument(targetDir, options.custodyDir, journal, 'health.html', 'step:2'),
    () => applyDocument(targetDir, options.custodyDir, journal, 'reports.html', 'step:3'),
    () => applyDocument(targetDir, options.custodyDir, journal, 'status.html', 'step:4'),
  ];
  for (let index = from; index < through; index += 1) {
    steps[index]();
    writeJournal(options.custodyDir, journal);
    crash(`step:${index}:journaled`);
  }
  return journal;
}

function restoreDocument(targetDir, custodyDir, journal, name) {
  const spec = journal.documents[name];
  if (spec.state !== 'installed') return;
  assertDocumentReady(targetDir, name, spec, spec.installedSha);
  const bytes = storedBytes(preimagePath(custodyDir, name), spec.previousSha);
  commitBytes(targetDir, name, bytes, spec, `inverse:${name}`);
  spec.state = 'restored';
}

function rollbackRelease(targetDir, custodyDir) {
  assertIsolated(targetDir);
  assertCustody(custodyDir, targetDir);
  const journal = readJournal(custodyDir);
  for (const name of [...DOCUMENTS].reverse()) {
    restoreDocument(targetDir, custodyDir, journal, name);
    writeJournal(custodyDir, journal);
    crash(`inverse:${name}:journaled`);
  }
  return journal;
}

function removeTemps(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const file = path.join(dir, name);
    const link = fs.lstatSync(file);
    if (link.isSymbolicLink() || link.isFile()) fs.unlinkSync(file);
  }
}

function recoverRelease(targetDir, custodyDir) {
  assertIsolated(targetDir);
  assertCustody(custodyDir, targetDir);
  removeTemps(targetDir);
  removeTemps(custodyDir);
  const journal = readJournal(custodyDir);
  for (const name of DOCUMENTS) {
    const spec = journal.documents[name];
    const info = inspectFile(targetDir, name);
    if (info.sha === spec.previousSha) spec.state = 'pending';
    else if (info.sha === spec.installedSha) spec.state = 'installed';
    else throw new Error(`unrecoverable:${name}`);
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
  const [command, targetDir, custodyDir, releaseFile, through, from] = argv;
  if (command === 'install') {
    installRelease(targetDir, decodeRelease(releaseFile), {
      custodyDir,
      through: through == null ? undefined : Number(through),
      from: from == null ? undefined : Number(from),
    });
    return;
  }
  if (command === 'rollback') {
    rollbackRelease(targetDir, custodyDir);
    return;
  }
  if (command === 'recover') {
    recoverRelease(targetDir, custodyDir);
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
