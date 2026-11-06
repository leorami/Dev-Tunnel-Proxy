# CTO V109 — recovered HMAC activation-secret byte continuity, not new-key bootstrap

## Coordination status

This is independent source work on isolated `cto/devproxy-rc2-v109-recovered-hmac-proof-20261106`, started from the last genuinely RETURNED primary `f3dd8ffc4cafd7023ecc140a6793c1eceb2a6468`. Sole primary Engineer-I is **already STARTED/IMPLEMENTING V108**, owner-authorized durable RC2 recovery (PR #79 #6674068959/#6674072477). Preserve that work. **Do not import this PR into active V108 or add a new mandatory release gate.** No live Mac interaction was performed.

## Source-derived consequential observation

`scripts/rc2-provision-private-host-worker.cjs` creates `activation.secret` with `crypto.randomBytes(32)` during its one-shot INITIAL stage bootstrap. That is legitimate for a brand-new system, but **not** proof of recovery of the previous production HMAC key. Accidentally using initial bootstrap as a restoration path can substitute a fresh signing key, invalidate in-flight HMAC transactions and lose signed replay/lease continuity. The separate `scripts/rc2-verify-api-spool-access.cjs` proves the container's configured UID can read the mounted secret; it does **not** establish that the secret's bytes match the original.

## CTO implementation, security properties

`utils/rc2-recovered-activation-secret-continuity.cjs` is a **read-only, fail-closed** checker of two pre-existing owner-private extracted files named `activation.secret`: independently authenticated original-backup copy and restored-stage copy. It checks owner UID, exact 0700 parent and 0600 regular file, symlink/hardlink/race protection, 32–128-byte nontrivial secret length, distinct parents, canonical paths and exact bytes with `crypto.timingSafeEqual`; zeroes buffers afterward. It refuses missing, predictable, mismatched or improperly permissioned files. It never calls `randomBytes`, creates/restores files, reads Docker secrets into logs, changes host worker state or prints private paths or hashes.

**Hard honesty boundary:** EVEN WHEN bytes match, the return code is `RC2_SECRET_COPIES_IDENTICAL_NOT_AUTHENTICATED` with `backupProvenanceVerified:false`, `spoolReplayHistoryVerified:false`, `productionChangeAuthorized:false`, `filesystemModified:false`, `liveRuntimeAttested:false`. Independent backup authentication and entire spool/lease/replay restoration remain mandatory. Two matching newly created files would **not** prove original continuity. No direct CLI is provided that can be misused as live restoration.

## Tests executed

RED-first `tests/security/rc2-recovered-activation-secret-continuity.test.cjs` was committed before module existed. Then both **exact GitHub blobs** (source `03fb2e8930cc1219c93edc96c2a3bdf8cfa42f6a`; test `79a9cce11371c894e3c5c2d610fed7035b05d817`) were copied into an isolated Linux Node v22.16.0 environment and each was independently matched using `git hash-object` before native `node --test`. **11/11 PASS, exit 0.** No macOS filesystem test, owner cryptographic backup inspection, host Docker test, whole-project `./smart-build.sh test:unit` run or production recovery performed by CTO. The owner system's real original secret is **not** known to this module and was never accessed.

## Safe sequencing

If primary V108 finds an authenticated original key AND original spool/lease records, this bounded checker can support a private source-level evidence step at a **later coordination boundary**; do not hold up V108 or claim original-key continuity from this code alone. If original material is absent, V108 should STOP the specific HMAC-dependent live action and surface the exact missing material for a real owner decision, not silently generate a replacement or manufacture PASS. Owner's approved durable recovery remains intact; this PR changes no approved scope. The medium-priority app-backend startup issue remains deferred as GitHub #109.
