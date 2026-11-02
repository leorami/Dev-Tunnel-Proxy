'use strict';
/**
 * Re-apply exact manifest mtimeMs onto an isolated extracted tree.
 * Refuse path traversal, symlinks, and hash/mode mismatches.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(abs) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(abs, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function assertSafeRel(rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) {
    throw new Error('UNSAFE_RESTORE_PATH');
  }
  const normalized = path.posix.normalize(rel.replaceAll('\\', '/'));
  if (normalized !== rel.replaceAll('\\', '/') || normalized.startsWith('../') || normalized === '..') {
    throw new Error('UNSAFE_RESTORE_PATH');
  }
  return normalized;
}

function restoreManifestMtimes(extractRoot, manifest) {
  if (!extractRoot || typeof extractRoot !== 'string' || !path.isAbsolute(extractRoot)) {
    throw new Error('UNSAFE_EXTRACT_ROOT');
  }
  const rootReal = fs.realpathSync(extractRoot);
  const files = manifest && Array.isArray(manifest.files) ? manifest.files : null;
  if (!files) throw new Error('INVALID_MANIFEST');
  let restored = 0;
  for (const item of files) {
    const rel = assertSafeRel(item.path);
    const abs = path.join(rootReal, ...rel.split('/'));
    if (!abs.startsWith(rootReal + path.sep) && abs !== rootReal) {
      throw new Error('UNSAFE_RESTORE_PATH');
    }
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || !st.isFile()) throw new Error('UNSAFE_RESTORE_NODE');
    if ((st.mode & 0o777) !== item.mode) throw new Error('RESTORE_MODE_MISMATCH');
    if (sha256File(abs) !== item.sha256) throw new Error('RESTORE_HASH_MISMATCH');
    const mtimeMs = Number(item.mtimeMs);
    if (!Number.isFinite(mtimeMs)) throw new Error('RESTORE_MTIME_MISMATCH');
    // Node on macOS accepts Date / epoch-seconds here; bigint ns is not portable.
    const when = new Date(mtimeMs);
    fs.utimesSync(abs, when, when);
    const after = fs.lstatSync(abs);
    if (Math.abs(after.mtimeMs - mtimeMs) > 1) {
      throw new Error('RESTORE_MTIME_MISMATCH');
    }
    restored += 1;
  }
  return {restored};
}

/** Sort paths like generateAppsBundle: newest mtimeMs first. */
function precedenceWinner(paths) {
  const ranked = paths
    .map((p) => ({p, mtime: fs.statSync(p).mtimeMs}))
    .sort((a, b) => b.mtime - a.mtime);
  return ranked[0] ? ranked[0].p : null;
}

module.exports = {
  restoreManifestMtimes,
  precedenceWinner,
  assertSafeRel,
  sha256File,
};
