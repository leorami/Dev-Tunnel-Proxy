'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const STEPS = 5;

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
  if (hasGitAncestor(target, temp)) {
    throw new Error('install target must not be a git checkout');
  }
}

function fsyncDir(dir) {
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeSameDirectory(dir, name, bytes, mode) {
  const dest = path.join(dir, name);
  const tmp = path.join(dir, `.${name}.v215-tmp`);
  const fd = fs.openSync(tmp, 'w', mode);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    throw error;
  }
  fs.closeSync(fd);
  fs.renameSync(tmp, dest);
  fsyncDir(dir);
}

function addAsset(dir, name, bytes) {
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) {
    const currentStat = fs.lstatSync(dest);
    if (currentStat.isSymbolicLink() || !currentStat.isFile()) {
      throw new Error(`refusing non-file asset ${name}`);
    }
    const current = fs.readFileSync(dest);
    if (!current.equals(bytes)) throw new Error(`drift:${name}`);
    return { kind: 'asset', name, unchanged: true };
  }
  writeSameDirectory(dir, name, bytes, 0o644);
  const after = fs.lstatSync(dest);
  if (after.isSymbolicLink() || !after.isFile()) throw new Error(`asset was not a file after rename ${name}`);
  return { kind: 'asset', name, unchanged: false };
}

function replaceDocument(dir, name, bytes, expectedSha) {
  const dest = path.join(dir, name);
  const before = fs.lstatSync(dest);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`refusing non-file document ${name}`);
  const previous = fs.readFileSync(dest);
  const previousSha = sha256(previous);
  if (previousSha !== expectedSha) throw new Error(`drift:${name}`);
  writeSameDirectory(dir, name, bytes, before.mode);
  const after = fs.lstatSync(dest);
  if (after.isSymbolicLink() || !after.isFile()) throw new Error(`document was not a file after rename ${name}`);
  if ((after.mode & 0o777) !== (before.mode & 0o777)) throw new Error(`mode changed:${name}`);
  return {
    kind: 'document',
    name,
    previous,
    previousSha,
    installedSha: sha256(bytes),
    mode: before.mode & 0o777,
  };
}

function installRelease(targetDir, release, through = STEPS, from = 0) {
  assertIsolated(targetDir);
  if (!Number.isInteger(through) || !Number.isInteger(from) || from < 0 || through > STEPS || from > through) {
    throw new Error('step out of range');
  }
  const steps = [
    () => addAsset(targetDir, release.cssName, release.cssBytes),
    () => addAsset(targetDir, release.jsName, release.jsBytes),
    () => replaceDocument(targetDir, 'health.html', release.documents.health, release.previous.health),
    () => replaceDocument(targetDir, 'reports.html', release.documents.reports, release.previous.reports),
    () => replaceDocument(targetDir, 'status.html', release.documents.status, release.previous.status),
  ];
  const journal = [];
  for (let index = from; index < through; index += 1) journal.push(steps[index]());
  return journal;
}

function rollbackRelease(targetDir, journal) {
  assertIsolated(targetDir);
  const documents = journal.filter((entry) => entry.kind === 'document').reverse();
  for (const entry of documents) {
    replaceDocument(targetDir, entry.name, entry.previous, entry.installedSha);
  }
}

module.exports = {
  STEPS,
  sha256,
  assertIsolated,
  installRelease,
  rollbackRelease,
};
