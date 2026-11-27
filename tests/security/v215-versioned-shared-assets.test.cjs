'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sha256,
  assertIsolated,
  installRelease,
  rollbackRelease,
} = require('../../scripts/v215-frontend-install.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS = path.join(ROOT, 'status');
const PREIMAGE = path.join(__dirname, 'fixtures', 'v215-v214-documents');
const OLD_JS_BLOB = '121ea9440a357fb79b8e896b5ae9cbef4f69acb3';
const OLD_CSS_BLOB = 'e2da6231d921893311bda441be3a0161454bd72a';
const OLD_DOCUMENT_BLOBS = {
  'health.html': 'cdc245be0ddbef49d5171f8d15a89bfdce6c4bef',
  'reports.html': '08e84d0398894b3b7f11520b9e3b7fd10d207d07',
  'status.html': '765584fef92244a02e8d919d89ca2eb86f05c520',
};
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];

function preimage(name) {
  return fs.readFileSync(path.join(PREIMAGE, name));
}

function gitBlob(bytes) {
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function releaseFromRepo() {
  const health = fs.readFileSync(path.join(STATUS, 'health.html'), 'utf8');
  const cssName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.css)/)[1];
  const jsName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.js)/)[1];
  const previous = {};
  const documents = {};
  for (const name of DOCUMENTS) {
    previous[name.replace('.html', '')] = sha256(preimage(name));
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

function oldTree(release) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-v215-install-'));
  fs.cpSync(STATUS, dir, { recursive: true });
  for (const name of DOCUMENTS) {
    fs.writeFileSync(path.join(dir, name), preimage(name));
  }
  fs.rmSync(path.join(dir, release.cssName), { force: true });
  fs.rmSync(path.join(dir, release.jsName), { force: true });
  fs.writeFileSync(path.join(dir, 'owner-note.txt'), 'preserve-me');
  return dir;
}

function documentSha(dir, name) {
  return sha256(fs.readFileSync(path.join(dir, name)));
}

test('unversioned shared assets stay the V214 bytes', () => {
  const js = fs.readFileSync(path.join(STATUS, 'common.js'));
  const css = fs.readFileSync(path.join(STATUS, 'common.css'));
  assert.equal(gitBlob(js), OLD_JS_BLOB);
  assert.equal(gitBlob(css), OLD_CSS_BLOB);
  for (const name of DOCUMENTS) assert.equal(gitBlob(preimage(name)), OLD_DOCUMENT_BLOBS[name]);
  assert.match(js.toString('utf8'), /link\[href\$="\/status\/common\.css"\]/);
  assert.match(js.toString('utf8'), /l\.href='\/status\/common\.css'/);
});

test('the three documents name one shared css and js, and the names are their hashes', () => {
  const release = releaseFromRepo();
  assert.equal(release.cssName, `common.v215-${sha256(release.cssBytes).slice(0, 12)}.css`);
  assert.equal(release.jsName, `common.v215-${sha256(release.jsBytes).slice(0, 12)}.js`);
  assert.deepEqual(release.cssBytes, fs.readFileSync(path.join(STATUS, 'common.css')));
  const js = release.jsBytes.toString('utf8');
  assert.match(js, /link\[data-dtp-shared-style\]/);
  assert.match(js, new RegExp(`l\\.href = '/status/${release.cssName}'`));
  assert.doesNotMatch(js, /href\s*=\s*['"]\/status\/common\.css['"]/);
  for (const name of DOCUMENTS) {
    const html = fs.readFileSync(path.join(STATUS, name), 'utf8');
    assert.match(html, new RegExp(`href="/status/${release.cssName}" data-dtp-shared-style="v215"`));
    assert.match(html, new RegExp(`src="/status/${release.jsName}"`));
    assert.doesNotMatch(html, /href="\/status\/common\.css"/);
    assert.doesNotMatch(html, /src="\/status\/common\.js"/);
  }
});

test('each install boundary can stop and roll back without touching old shared assets', () => {
  const release = releaseFromRepo();
  const old = {};
  for (const name of DOCUMENTS) old[name] = sha256(preimage(name));
  for (let step = 0; step <= 5; step += 1) {
    const dir = oldTree(release);
    try {
      const cached = fs.readFileSync(path.join(dir, 'common.js'));
      const preserved = sha256(fs.readFileSync(path.join(dir, 'vendor', 'lucide.min.js')));
      const journal = installRelease(dir, release, step);
      assert.equal(fs.existsSync(path.join(dir, release.cssName)), step >= 1);
      assert.equal(fs.existsSync(path.join(dir, release.jsName)), step >= 2);
      assert.equal(documentSha(dir, 'health.html'), step >= 3 ? sha256(release.documents.health) : old['health.html']);
      assert.equal(documentSha(dir, 'reports.html'), step >= 4 ? sha256(release.documents.reports) : old['reports.html']);
      assert.equal(documentSha(dir, 'status.html'), step >= 5 ? sha256(release.documents.status) : old['status.html']);
      assert.deepEqual(fs.readFileSync(path.join(dir, 'common.js')), cached);
      assert.equal(fs.readFileSync(path.join(dir, 'owner-note.txt'), 'utf8'), 'preserve-me');
      rollbackRelease(dir, journal);
      for (const name of DOCUMENTS) assert.equal(documentSha(dir, name), old[name], `${name} after rollback from ${step}`);
      assert.deepEqual(fs.readFileSync(path.join(dir, 'common.js')), cached);
      assert.equal(sha256(fs.readFileSync(path.join(dir, 'vendor', 'lucide.min.js'))), preserved);
      assert.equal(fs.existsSync(path.join(dir, release.cssName)), step >= 1);
      assert.equal(fs.readFileSync(path.join(dir, 'owner-note.txt'), 'utf8'), 'preserve-me');
      if (step >= 3) {
        assert.doesNotMatch(fs.readFileSync(path.join(dir, 'health.html'), 'utf8'), /src="\/status\/common\.v215-/);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a drifted or linked document is left untouched', () => {
  const release = releaseFromRepo();
  const dir = oldTree(release);
  try {
    const health = path.join(dir, 'health.html');
    const original = fs.readFileSync(health);
    fs.writeFileSync(health, Buffer.concat([original, Buffer.from(' ')]));
    assert.throws(() => installRelease(dir, release, 3), /drift:health\.html/);
    assert.deepEqual(fs.readFileSync(health), Buffer.concat([original, Buffer.from(' ')]));
    assert.equal(fs.existsSync(path.join(dir, 'reports.html')), true);
    fs.rmSync(health);
    fs.symlinkSync(path.join(dir, 'reports.html'), health);
    assert.throws(() => installRelease(dir, release, 3), /non-file document health\.html/);
    assert.equal(fs.readlinkSync(health), path.join(dir, 'reports.html'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the installer refuses the source status directory', () => {
  assert.throws(() => assertIsolated(STATUS), /temporary directory|git checkout/);
});
