/** RED-first: tar can collapse sub-second mtimes; restore exact manifest mtimeMs for route winners. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  restoreManifestMtimes,
  precedenceWinner,
} = require('../../utils/restore-manifest-mtimes.cjs');

function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

test('native tar round-trip can tie two winners that differed by tens of milliseconds', (t) => {
  const root = fs.mkdtempSync(path.join('/private/tmp', 'devproxy-mtime-tar-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const a = path.join(root, 'old.conf');
  const b = path.join(root, 'new.conf');
  fs.writeFileSync(a, 'OLD');
  fs.writeFileSync(b, 'NEW');
  const sec = Math.trunc(Date.now() / 1000);
  fs.utimesSync(a, new Date(sec * 1000 + 10), new Date(sec * 1000 + 10));
  fs.utimesSync(b, new Date(sec * 1000 + 60), new Date(sec * 1000 + 60));
  assert.equal(path.basename(precedenceWinner([a, b])), 'new.conf');
  const tar = path.join(root, 't.tar');
  assert.equal(spawnSync('tar', ['-cf', tar, '-C', root, 'old.conf', 'new.conf']).status, 0);
  const out = path.join(root, 'out');
  fs.mkdirSync(out);
  assert.equal(spawnSync('tar', ['-xf', tar, '-C', out]).status, 0);
  const oa = path.join(out, 'old.conf');
  const ob = path.join(out, 'new.conf');
  assert.equal(fs.statSync(oa).mtimeMs, fs.statSync(ob).mtimeMs, 'Mac bsdtar collapses these mtimes');
});

test('manifest mtime reapplication restores generateAppsBundle winner order', (t) => {
  const root = fs.mkdtempSync(path.join('/private/tmp', 'devproxy-mtime-restore-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const apps = path.join(root, 'apps');
  fs.mkdirSync(apps);
  // Two app configs; newer mtimeMs must win after restore, matching generateAppsBundle.
  const left = path.join(apps, 'same.conf');
  const right = path.join(apps, 'same-other.conf');
  fs.writeFileSync(left, 'LOSER');
  fs.writeFileSync(right, 'WINNER');
  const sec = Math.trunc(Date.now() / 1000);
  const loseMs = sec * 1000 + 10;
  const winMs = sec * 1000 + 80;
  fs.utimesSync(left, new Date(loseMs), new Date(loseMs));
  fs.utimesSync(right, new Date(winMs), new Date(winMs));
  const manifest = {
    files: [
      {
        path: 'apps/same.conf',
        bytes: 5,
        mode: fs.statSync(left).mode & 0o777,
        mtimeMs: loseMs,
        sha256: sha(left),
      },
      {
        path: 'apps/same-other.conf',
        bytes: 6,
        mode: fs.statSync(right).mode & 0o777,
        mtimeMs: winMs,
        sha256: sha(right),
      },
    ],
  };
  // Simulate tar precision loss
  fs.utimesSync(left, new Date(sec * 1000), new Date(sec * 1000));
  fs.utimesSync(right, new Date(sec * 1000), new Date(sec * 1000));
  assert.equal(fs.statSync(left).mtimeMs, fs.statSync(right).mtimeMs);
  restoreManifestMtimes(root, manifest);
  assert.equal(path.basename(precedenceWinner([left, right])), 'same-other.conf');
});

test('restore refuses path traversal and symlink targets', (t) => {
  const root = fs.mkdtempSync(path.join('/private/tmp', 'devproxy-mtime-unsafe-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'ok.conf'), 'x');
  assert.throws(
    () => restoreManifestMtimes(root, {
      files: [{path: '../ok.conf', bytes: 1, mode: 0o644, mtimeMs: Date.now(), sha256: sha(path.join(root, 'ok.conf'))}],
    }),
    /UNSAFE_RESTORE_PATH/,
  );
  const link = path.join(root, 'link.conf');
  fs.symlinkSync(path.join(root, 'ok.conf'), link);
  assert.throws(
    () => restoreManifestMtimes(root, {
      files: [{
        path: 'link.conf',
        bytes: 1,
        mode: 0o644,
        mtimeMs: Date.now(),
        sha256: sha(path.join(root, 'ok.conf')),
      }],
    }),
    /UNSAFE_RESTORE_NODE/,
  );
});
