'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  CRASH_POINTS,
  TEMP_PREFIX,
  sha256,
  assertIsolated,
  inspectFile,
  installRelease,
  rollbackRelease,
  recoverRelease,
} = require('../../scripts/v216-frontend-install.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS = path.join(ROOT, 'status');
const BASELINE = path.join(__dirname, 'fixtures', 'v216-served-baseline');
const INSTALLER = path.join(ROOT, 'scripts', 'v216-frontend-install.cjs');
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];
const BASELINE_BLOBS = {
  'status.html': '1728475984c35569b5b45caac0bed944ca7535a9',
  'health.html': 'dd58d4b9fbde72dd2be06fd54682366a0aae9e04',
  'reports.html': '42aebbec2626703a8b2d9ee671ff387e637e5546',
  'common.js': '33d757a78f2d65edcaad93d543fa955010a7e069',
  'common.css': '28f006befdc02bc93f460abf04d2241a7a05ef4b',
};

function gitBlob(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

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

function makeDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-v216-'));
  const docroot = path.join(root, 'www');
  const target = path.join(docroot, 'status');
  const custody = path.join(root, 'custody');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(custody, { mode: 0o700 });
  for (const name of DOCUMENTS) fs.writeFileSync(path.join(target, name), baseline(name));
  fs.writeFileSync(path.join(target, 'common.js'), baseline('common.js'));
  fs.writeFileSync(path.join(target, 'common.css'), baseline('common.css'));
  fs.writeFileSync(path.join(target, 'owner-note.txt'), 'preserve-me');
  return { root, docroot, target, custody };
}

function releaseOptions(dirs, extra = {}) {
  return { custodyDir: dirs.custody, docroot: dirs.docroot, ...extra };
}

function encodeRelease(release, file) {
  const documents = {};
  for (const [key, value] of Object.entries(release.documents)) documents[key] = Buffer.from(value).toString('base64');
  fs.writeFileSync(file, JSON.stringify({
    cssName: release.cssName,
    jsName: release.jsName,
    cssBytes: Buffer.from(release.cssBytes).toString('base64'),
    jsBytes: Buffer.from(release.jsBytes).toString('base64'),
    documents,
    previous: release.previous,
  }));
}

function runInstaller(args, env) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 20000,
  });
}

function dotTemps(dir) {
  return fs.readdirSync(dir).filter((name) => name.startsWith(TEMP_PREFIX) || name.startsWith('.'));
}

test('the served baseline fixture is the public V213 status tree', () => {
  for (const [name, blob] of Object.entries(BASELINE_BLOBS)) {
    assert.equal(gitBlob(baseline(name)), blob, name);
  }
  const oldJs = baseline('common.js').toString('utf8');
  assert.doesNotMatch(oldJs, /registerHeaderRefresh/);
  assert.match(oldJs, /\/status\/common\.css/);
  for (const name of DOCUMENTS) {
    const oldHtml = baseline(name).toString('utf8');
    const fresh = fs.readFileSync(path.join(STATUS, name), 'utf8');
    assert.match(oldHtml, /\/status\/common\.js/);
    assert.match(oldHtml, /\/status\/common\.css/);
    assert.doesNotMatch(oldHtml, /common\.v215-/);
    assert.match(fresh, /common\.v215-/);
    assert.doesNotMatch(fresh, /src="\/status\/common\.js"/);
    assert.doesNotMatch(fresh, /href="\/status\/common\.css"/);
  }
});

test('old and new documents keep their own shared assets when both trees are present', () => {
  const release = releaseFromRepo();
  const pairs = [
    { documents: 'old', assets: 'old' },
    { documents: 'old', assets: 'new' },
    { documents: 'new', assets: 'old' },
    { documents: 'new', assets: 'new' },
  ];
  for (const pair of pairs) {
    const { root, target } = makeDirs();
    try {
      if (pair.assets === 'old') {
        fs.rmSync(path.join(target, release.cssName), { force: true });
        fs.rmSync(path.join(target, release.jsName), { force: true });
      } else {
        fs.writeFileSync(path.join(target, release.cssName), release.cssBytes);
        fs.writeFileSync(path.join(target, release.jsName), release.jsBytes);
      }
      for (const name of DOCUMENTS) {
        const bytes = pair.documents === 'old' ? baseline(name) : release.documents[name.replace('.html', '')];
        fs.writeFileSync(path.join(target, name), bytes);
        const html = bytes.toString('utf8');
        if (pair.documents === 'old') {
          assert.match(html, /src="\/status\/common\.js"/);
          assert.doesNotMatch(html, /common\.v215-/);
        } else {
          assert.match(html, new RegExp(release.jsName));
          assert.match(html, new RegExp(release.cssName));
          assert.doesNotMatch(html, /src="\/status\/common\.js"/);
        }
      }
      assert.equal(fs.existsSync(path.join(target, 'common.js')), true);
      assert.equal(fs.existsSync(path.join(target, release.jsName)), pair.assets === 'new');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('a drifted later document does not change the earlier document and leaves no journal', () => {
  const release = releaseFromRepo();
  const { root, docroot, target, custody } = makeDirs();
  try {
    const health = path.join(target, 'health.html');
    const before = fs.readFileSync(health);
    fs.writeFileSync(path.join(target, 'reports.html'), Buffer.concat([baseline('reports.html'), Buffer.from('x')]));
    assert.throws(() => installRelease(target, release, releaseOptions({ custody, docroot })), /drift:reports\.html/);
    assert.deepEqual(fs.readFileSync(health), before);
    assert.equal(fs.existsSync(path.join(custody, 'journal.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a preexisting temporary-name symlink cannot overwrite an unrelated file', () => {
  const release = releaseFromRepo();
  const { root, docroot, target, custody } = makeDirs();
  const victim = path.join(target, 'victim.txt');
  fs.writeFileSync(victim, 'owned-by-test');
  fs.symlinkSync(victim, path.join(target, `${TEMP_PREFIX}planted`));
  process.env.V216_TEMP_NAME = `${TEMP_PREFIX}planted`;
  try {
    installRelease(target, release, releaseOptions({ custody, docroot }));
    assert.equal(fs.readFileSync(victim, 'utf8'), 'owned-by-test');
    const health = fs.lstatSync(path.join(target, 'health.html'));
    assert.equal(health.isSymbolicLink(), false);
    assert.equal(health.isFile(), true);
    assert.equal(health.nlink, 1);
    assert.equal(sha256(fs.readFileSync(path.join(target, 'health.html'))), sha256(release.documents.health));
  } finally {
    delete process.env.V216_TEMP_NAME;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a hardlinked preimage is refused before any byte changes', () => {
  const release = releaseFromRepo();
  const { root, docroot, target, custody } = makeDirs();
  try {
    const health = path.join(target, 'health.html');
    const link = path.join(target, 'health-link');
    fs.linkSync(health, link);
    const before = fs.readFileSync(health);
    assert.throws(() => installRelease(target, release, releaseOptions({ custody, docroot })), /single-link:health\.html/);
    assert.equal(fs.statSync(health).nlink, 2);
    assert.deepEqual(fs.readFileSync(health), before);
    assert.deepEqual(fs.readFileSync(link), before);
    assert.equal(fs.existsSync(path.join(custody, 'journal.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ownership, mode, ACL, and xattrs survive install and rollback, and later metadata drift is refused', () => {
  const release = releaseFromRepo();
  const { root, docroot, target, custody } = makeDirs();
  try {
    const health = path.join(target, 'health.html');
    fs.chmodSync(health, 0o640);
    const user = spawnSync('id', ['-un'], { encoding: 'utf8' }).stdout.trim();
    if (process.platform === 'darwin') {
      assert.equal(spawnSync('chmod', ['+a', `user:${user} allow read,write`, health], { encoding: 'utf8' }).status, 0);
      assert.equal(spawnSync('xattr', ['-w', 'user.v216', 'kept', health], { encoding: 'utf8' }).status, 0);
    } else {
      assert.equal(spawnSync('setfacl', ['-m', `u:${user}:rw`, health], { encoding: 'utf8' }).status, 0);
      assert.equal(spawnSync('setfattr', ['-n', 'user.v216', '-v', 'kept', health], { encoding: 'utf8' }).status, 0);
    }
    const before = inspectFile(target, 'health.html');
    installRelease(target, release, releaseOptions({ custody, docroot }, { through: 3 }));
    const installed = inspectFile(target, 'health.html');
    assert.equal(installed.sha, sha256(release.documents.health));
    assert.equal(installed.mode, before.mode);
    assert.equal(installed.uid, before.uid);
    assert.equal(installed.gid, before.gid);
    assert.deepEqual(installed.acl, before.acl);
    assert.deepEqual(installed.xattrs, before.xattrs);
    const reports = path.join(target, 'reports.html');
    const reportsBefore = fs.readFileSync(reports);
    fs.chmodSync(reports, 0o604);
    assert.throws(() => installRelease(target, release, releaseOptions({ custody, docroot }, { from: 3 })), /metadata drift:reports\.html/);
    assert.deepEqual(fs.readFileSync(reports), reportsBefore);
    fs.chmodSync(reports, before.mode & 0o777 || 0o644);
    rollbackRelease(target, custody, docroot);
    const restored = inspectFile(target, 'health.html');
    assert.equal(restored.sha, sha256(baseline('health.html')));
    assert.equal(restored.mode, before.mode);
    assert.deepEqual(restored.acl, before.acl);
    assert.deepEqual(restored.xattrs, before.xattrs);
    assert.equal(fs.readFileSync(path.join(target, 'owner-note.txt'), 'utf8'), 'preserve-me');
    assert.deepEqual(fs.readFileSync(path.join(target, 'common.js')), baseline('common.js'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a killed install or inverse recovers from custody without a hidden docroot backup', { timeout: 180000 }, () => {
  const release = releaseFromRepo();
  assert.ok(CRASH_POINTS.some((point) => point.startsWith('step:')) && CRASH_POINTS.some((point) => point.startsWith('inverse:')));
  for (const point of CRASH_POINTS) {
    const { root, docroot, target, custody } = makeDirs();
    const releaseFile = path.join(root, 'release.json');
    encodeRelease(release, releaseFile);
    try {
      const install = runInstaller(
        ['install', target, custody, releaseFile, docroot],
        point.startsWith('inverse:') ? {} : { V216_CRASH_AT: point },
      );
      if (!point.startsWith('inverse:')) assert.equal(install.signal, 'SIGKILL', point);
      else assert.equal(install.status, 0, install.stderr);
      if (point.startsWith('inverse:')) {
        const inverse = runInstaller(['rollback', target, custody, docroot], { V216_CRASH_AT: point });
        assert.equal(inverse.signal, 'SIGKILL', `${point} ${inverse.stderr}`);
      }
      const recovered = runInstaller(['recover', target, custody, docroot], { V216_CRASH_AT: '' });
      assert.equal(recovered.status, 0, `${point} ${recovered.stderr}`);
      const rolled = runInstaller(['rollback', target, custody, docroot], { V216_CRASH_AT: '' });
      assert.equal(rolled.status, 0, `${point} ${rolled.stderr}`);
      for (const name of DOCUMENTS) {
        assert.deepEqual(fs.readFileSync(path.join(target, name)), baseline(name), `${point} ${name}`);
        assert.equal(fs.lstatSync(path.join(target, name)).nlink, 1);
      }
      assert.deepEqual(fs.readFileSync(path.join(target, 'common.js')), baseline('common.js'));
      assert.deepEqual(dotTemps(target), []);
      assert.equal(custody.startsWith(target + path.sep), false);
      assert.equal(fs.existsSync(path.join(custody, 'journal.json')), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('custody inside the served directory and the source tree are refused', () => {
  const release = releaseFromRepo();
  const { root, docroot, target, custody } = makeDirs();
  try {
    assert.throws(() => installRelease(target, release, { custodyDir: target, docroot }), /outside the served directory|temporary directory|git checkout/);
    assert.throws(() => assertIsolated(STATUS), /temporary directory|git checkout/);
    assert.equal(fs.existsSync(path.join(custody, 'journal.json')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
