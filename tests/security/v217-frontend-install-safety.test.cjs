'use strict';

// RED against installer blob 0eb276df27c28fa668b4de46cdab4fd9125cbcb6.
// These tests call the exported installer. They do not weaken its
// temporary-directory guard and they never point it at the owner tree.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  CRASH_POINTS,
  TEMP_PREFIX,
  sha256,
  inspectFile,
  installRelease,
  recoverRelease,
} = require('../../scripts/v216-frontend-install.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS = path.join(ROOT, 'status');
const BASELINE = path.join(__dirname, 'fixtures', 'v216-served-baseline');
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];

function baseline(name) {
  return fs.readFileSync(path.join(BASELINE, name));
}

function releaseFromRepo() {
  const health = fs.readFileSync(path.join(STATUS, 'health.html'), 'utf8');
  const cssName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.css)/)[1];
  const jsName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.js)/)[1];
  const previous = {};
  const documents = {};
  for (const name of DOCUMENTS) {
    previous[name.replace('.html', '')] = sha256(baseline(name));
    documents[name.replace('.html', '')] = fs.readFileSync(path.join(STATUS, name));
  }
  return {
    cssName,
    jsName,
    cssBytes: fs.readFileSync(path.join(STATUS, cssName)),
    jsBytes: fs.readFileSync(path.join(STATUS, jsName)),
    documents,
    previous,
  };
}

function makeFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-v217-'));
  const docroot = path.join(base, 'www');
  const target = path.join(docroot, 'status');
  const custody = path.join(base, 'custody');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(custody, { mode: 0o700 });
  for (const name of DOCUMENTS) fs.writeFileSync(path.join(target, name), baseline(name));
  fs.writeFileSync(path.join(target, 'common.js'), baseline('common.js'));
  fs.writeFileSync(path.join(target, 'common.css'), baseline('common.css'));
  return { base, docroot, target, custody };
}

function options(fixture) {
  return { custodyDir: fixture.custody, docroot: fixture.docroot };
}

function writeExecutable(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
}

test('recover without a valid journal does not unlink unrelated owner work', () => {
  const fixture = makeFixture();
  const note = path.join(fixture.target, `${TEMP_PREFIX}owner-note`);
  fs.writeFileSync(note, 'owner-work');
  try {
    assert.throws(() => recoverRelease(fixture.target, fixture.custody, fixture.docroot), /journal/);
    assert.equal(fs.readFileSync(note, 'utf8'), 'owner-work');
    for (const name of DOCUMENTS) {
      assert.deepEqual(fs.readFileSync(path.join(fixture.target, name)), baseline(name));
    }
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('recovery deletes only a temp whose journal identity matches', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  const note = path.join(fixture.target, `${TEMP_PREFIX}owner-note`);
  try {
    installRelease(fixture.target, release, { ...options(fixture), through: 0 });
    fs.writeFileSync(note, 'owner-work');
    const journalFile = path.join(fixture.custody, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    journal.temps = [{
      name: `${TEMP_PREFIX}owner-note`,
      transactionId: journal.transactionId || 'missing',
      dev: 1,
      ino: 1,
      expectedSize: 1,
      expectedHash: 'ab',
    }];
    fs.writeFileSync(journalFile, JSON.stringify(journal));
    try {
      recoverRelease(fixture.target, fixture.custody, fixture.docroot);
    } catch {
      // A rejected journal is acceptable only when it did not already delete owner work.
    }
    assert.equal(fs.readFileSync(note, 'utf8'), 'owner-work');
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('a journal without a transaction id stops before any cleanup', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  const note = path.join(fixture.target, `${TEMP_PREFIX}owner-note`);
  try {
    installRelease(fixture.target, release, { ...options(fixture), through: 0 });
    const journalFile = path.join(fixture.custody, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    delete journal.transactionId;
    fs.writeFileSync(journalFile, JSON.stringify(journal));
    fs.writeFileSync(note, 'owner-work');
    assert.throws(() => recoverRelease(fixture.target, fixture.custody, fixture.docroot), /journal/);
    assert.equal(fs.readFileSync(note, 'utf8'), 'owner-work');
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('custody inside the served document root is refused before any write', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  const inside = path.join(fixture.docroot, 'private');
  fs.mkdirSync(inside, { mode: 0o700 });
  try {
    assert.throws(
      () => installRelease(fixture.target, release, { custodyDir: inside, docroot: fixture.docroot }),
      /document root/,
    );
    assert.equal(fs.existsSync(path.join(inside, 'journal.json')), false);
    for (const name of DOCUMENTS) {
      assert.deepEqual(fs.readFileSync(path.join(fixture.target, name)), baseline(name));
    }
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('custody must be mode 0700, owned by the operator, and not a symlink', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  const loose = path.join(fixture.base, 'loose');
  const real = path.join(fixture.base, 'custody-real');
  const link = path.join(fixture.base, 'custody-link');
  fs.mkdirSync(loose, { mode: 0o755 });
  fs.mkdirSync(real, { mode: 0o700 });
  fs.symlinkSync(real, link);
  try {
    assert.throws(
      () => installRelease(fixture.target, release, { custodyDir: loose, docroot: fixture.docroot }),
      /custody/,
    );
    assert.equal(fs.existsSync(path.join(loose, 'journal.json')), false);
    assert.throws(
      () => installRelease(fixture.target, release, { custodyDir: link, docroot: fixture.docroot }),
      /symlink/,
    );
    assert.equal(fs.existsSync(path.join(real, 'journal.json')), false);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('a replaced target directory is an identity stop and does not write', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  try {
    installRelease(fixture.target, release, { ...options(fixture), through: 0 });
    const retired = `${fixture.target}-retired`;
    fs.renameSync(fixture.target, retired);
    fs.mkdirSync(fixture.target);
    for (const name of DOCUMENTS) fs.writeFileSync(path.join(fixture.target, name), baseline(name));
    fs.writeFileSync(path.join(fixture.target, 'common.js'), baseline('common.js'));
    fs.writeFileSync(path.join(fixture.target, 'common.css'), baseline('common.css'));
    assert.throws(
      () => installRelease(fixture.target, release, { ...options(fixture), from: 0 }),
      /identity/,
    );
    assert.equal(sha256(fs.readFileSync(path.join(fixture.target, 'health.html'))), sha256(baseline('health.html')));
    assert.equal(fs.existsSync(path.join(fixture.target, release.cssName)), false);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('crash points cover intent, temp creation, metadata copy, and the pre-rename check', () => {
  const joined = CRASH_POINTS.join('\n');
  assert.match(joined, /intent/);
  assert.match(joined, /metadata/);
  assert.match(joined, /pre-rename/);
});

test('metadata inventory keeps binary and non-user attributes and refuses an uncopyable one before commit', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-v217-tools-'));
  const previous = process.env.PATH;
  if (process.platform === 'darwin') {
    writeExecutable(bin, 'xattr', `#!/bin/sh
if [ "$1" = "-px" ]; then
  if [ "$2" = "user.bin" ]; then printf '00 01 02 03\\n'; exit 0; fi
  if [ "$2" = "com.apple.provenance" ]; then printf 'ff\\n'; exit 0; fi
  exit 1
fi
if [ "$1" = "-p" ]; then
  printf 'text-dropped\\n'
  exit 0
fi
if [ "$1" = "-wx" ]; then
  if [ "$2" = "com.apple.provenance" ]; then echo refused >&2; exit 1; fi
  exit 0
fi
if [ "$1" = "-w" ]; then exit 0; fi
printf 'user.bin\\ncom.apple.provenance\\n'
exit 0
`);
  } else if (process.platform === 'linux') {
    writeExecutable(bin, 'getfattr', `#!/bin/sh
printf '%s\\n' '# file: fixture' 'user.bin=0sAAECAw==' 'security.selinux=0sc3lz'
exit 0
`);
    writeExecutable(bin, 'setfattr', `#!/bin/sh
data=$(printf '%s\\n' "$@"; cat)
printf '%s\\n' "$data" | grep -q 'security' && { echo refused >&2; exit 1; }
exit 0
`);
  } else {
    fs.rmSync(fixture.base, { recursive: true, force: true });
    fs.rmSync(bin, { recursive: true, force: true });
    throw new Error('metadata unsupported: platform');
  }
  process.env.PATH = `${bin}${path.delimiter}${previous}`;
  try {
    const info = inspectFile(fixture.target, 'health.html');
    const binary = info.xattrs['user.bin'];
    assert.equal(binary && binary.encoding, 'base64');
    assert.equal(binary.bytes, Buffer.from([0, 1, 2, 3]).toString('base64'));
    if (process.platform === 'darwin') assert.ok(info.xattrs['com.apple.provenance']);
    else assert.ok(info.xattrs['security.selinux']);
    assert.throws(
      () => installRelease(fixture.target, release, options(fixture)),
      /metadata|uncopyable|refused/,
    );
    for (const name of DOCUMENTS) {
      assert.deepEqual(fs.readFileSync(path.join(fixture.target, name)), baseline(name), name);
    }
    assert.equal(fs.existsSync(path.join(fixture.target, release.cssName)), false);
  } finally {
    process.env.PATH = previous;
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('macOS file flags are part of the metadata inventory', () => {
  const fixture = makeFixture();
  try {
    const health = path.join(fixture.target, 'health.html');
    if (process.platform === 'darwin') {
      const flagged = spawnSync('chflags', ['hidden', health], { encoding: 'utf8' });
      assert.equal(flagged.status, 0, flagged.stderr);
    }
    const info = inspectFile(fixture.target, 'health.html');
    assert.equal(typeof info.flags, 'number');
    if (process.platform === 'darwin') assert.ok((info.flags & 0x8000) !== 0);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});

test('the release record names its transaction before a temp file exists', () => {
  const release = releaseFromRepo();
  const fixture = makeFixture();
  try {
    const journal = installRelease(fixture.target, release, { ...options(fixture), through: 0 });
    assert.equal(typeof journal.transactionId, 'string');
    assert.match(journal.transactionId, /^[0-9a-f]{32}$/);
    assert.ok(Array.isArray(journal.temps));
    assert.equal(journal.identity.docroot.dev, fs.statSync(fixture.docroot).dev);
    assert.equal(journal.identity.target.ino, fs.statSync(fixture.target).ino);
  } finally {
    fs.rmSync(fixture.base, { recursive: true, force: true });
  }
});
