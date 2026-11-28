# V196 — crash-durable signed-message replay barrier (source-only)

**Status: CTO CANDIDATE / NOT INSTALLED / NOT RELEASED / NO SIGNAL ENDPOINT.**

This source change directly addresses a genuine engineering blocker from the owner-Mac V195 preflight: V191's valid Ed25519 `artifact.describe` verifier retains sender nonces **only in a process-local Map**. A restarted or second receiver process would accept the same otherwise valid signed message again. A working Signal-encrypted transport does not solve that independent application replay problem. We are **not** building another synthetic Signal conversation.

## Actual evidence and ancestry

- Last genuine primary V195 Issue [#243](https://github.com/leorami/Dev-Tunnel-Proxy/issues/243): STARTED [#7113057490](https://github.com/leorami/Dev-Tunnel-Proxy/issues/243#issuecomment-7113057490) → RETURNED/STOPPED [#7113129581](https://github.com/leorami/Dev-Tunnel-Proxy/issues/243#issuecomment-7113129581) with a pointer-only reconciliation [#7119790908](https://github.com/leorami/Dev-Tunnel-Proxy/issues/243#issuecomment-7119790908). Engineer [PR #244](https://github.com/leorami/Dev-Tunnel-Proxy/pull/244) exact `engineer/devproxy-v195-real-owner-signal-readiness-20261123@faeaae4637f5cfdd2c8faea0c76b5617e7ed0b0d` adds **one 51-line read-only original-host receipt**; no installed code change. CTO independently reviewed the actual diff and accepted **PILOT NO-GO** in #243 comment #7119808594.
- Actual V195 owner-host evidence: current Dev Proxy Config API Node **18.20.8**, Trajectory Node **22.23.3**, hosted Calliope Node **22.23.2**; all mounted checkouts **dirty**, so source HEAD is **not** loaded-byte attestation. No official libsignal installed in those applications, no trusted Signal recipient, private encrypted transport, actual signed consent grant issuer, crash-safe ratchet store or verified chosen artifact. All live GO gates remain blocked.
- Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7` has not changed. V196 is an isolated branch **directly from accepted V195 Engineer source**. It is not a replacement for the installed `master@150d0e792bfca886a1509d07618aa2c5eedd5500` dirty owner runtime.

## Source contract

New `utils/calliope-durable-replay-ledger.cjs` exports `createDurableCalliopeReplayLedger({directory,maxEntries})` and a module-private authenticity check `isDurableCalliopeReplayLedger` backed by WeakSet membership. The function **never creates the directory or starts a daemon**. A future authorized service must explicitly create an isolated pre-existing **owner-only 0700** directory; the module rejects relative, symlinked, noncanonical, root, wrong-owner and group-readable directories. All actual test writes are confined to disposable CI temp directories.

The ledger accepts only exact fields `sender`, `project`, `nonce`, `expiresAtMs`, `at`. It hashes **sender + nonce** (cross-project sender-wide scope matching the existing V191 verifier) with a fixed domain separator into an opaque lowercase SHA-256 filename. It never stores sender, project, the raw nonce, credentials, private keys, a path requested by the agent, or decrypted content. A file contains only version and expiry metadata and uses private **0600** mode.

Per-nonce reservation uses `O_CREAT | O_EXCL | O_NOFOLLOW` to deny the same nonce even under independent Node process concurrency. It fsyncs the written file **and** the containing directory before returning success, checks the directory identity has not changed, and fails closed on duplicate, parse, permission, capacity, race or I/O error. A partially created entry is never auto-removed after failure because deletion could allow a replay. No automatic pruning; **storage exhaustion blocks new messages rather than silently reusing a nonce**.

Existing `utils/calliope-agent-envelope.cjs` remains default-compatible for historical source-only V191–V194 behavior. For future privileged/operational caller code, `requireDurableReplay:true` requires the *authentic* ledger object, refusing missing or forged `{reserve:()=>true}` objects. After genuine Ed25519 signature, registered sender/project, domain, expiry and intent verification, the verifier must reserve the nonce **before** reporting the metadata-only verdict. Failure of the durability primitive denies; a signed-invalid message cannot burn or reserve a genuine nonce. All authority flags remain false. This does **not** issue actual owner consent or a file disclosure capability.

## RED-first contracts and independent verification

Focused `tests/security/v196-durable-replay-ledger.test.cjs` verifies:
- Original signed envelope accepted once, then rejected by a **reconstructed verifier** using the same persisted ledger after a simulated restart.
- Six actual independent Node processes racing the same nonce admit exactly one claimant.
- Private existing 0700 directory, rejection of aliases/symlinks, owner-untrusted mode and relative paths.
- Strict input schema, expiry bounds, unexpected directory entries, bounded capacity, private 0600 file mode, no plaintext sender/project/nonce in storage.
- Signed-invalid requests never mark a nonce; missing/fabricated durable ledger refused in strict mode.
- Reusing a valid sender nonce across two different projects rejects according to V191's sender-wide replay scope.

`.github/workflows/devproxy-v196-durable-replay.yml` runs **Node 18.20.8 and 22.23.5** syntax and V191+V193+V196 security tests, with zero owner-machine writes, installs or new dependencies. Existing V191 source-only CI independently runs its 6 tests. RED-first CI initially failed because the new ledger file did not exist; later a second observed targeted RED exposed a real cross-project scope mismatch and was root-fixed. Final Green evidence is supplied in the coordination issue after actual run completion, not assumed from code.

## Limits — do NOT deploy as a Signal message receiver yet

1. **The on-disk ledger is a replay building block, not full crash-safe Signal session persistence.** Signal ratchet/prekey state, sender identities, encryption keys, response idempotency and logout/revocation remain separate. An endpoint must atomically coordinate message decryption, ratchet advancement, nonce admission and any effect; this isolated contract does not solve multi-state transactions.
2. **The reserve directory must be provisioned under explicit owner authority.** No Mac Keychain access, grant issuance or ownership attestation is implemented. Do not point it at the owner's current working tree, private files, app state, Docker mounts or `.artifacts` without separate consent and source/mount review.
3. **No automatic expiry reclamation, wall-clock rollback proof or strict multi-writer aggregate quota coordination.** Bounded per-call entry count is a fail-closed safety valve, not guaranteed strict maximum under races of distinct nonces. A complete production retention, rollback and private storage lifecycle must be designed/tested separately. At capacity the service refuses; it must never turn off replay checking to restore availability.
4. **A signed message, encryption, metadata consent, and host execution are distinct.** V193 synthetic `trustedGrants` is not owner consent. Trajectory's signed-in macOS session is not an export grant. The enrolled Calliope recipient and private ciphertext channel do not exist in the running owner apps yet.
5. **Legal/runtime blocker remains.** Official libsignal@0.106.0 is AGPL-3.0-only and unsupported for third-party use; its test runtime Node24 is not the owner API Node18. A qualified review and authorized one-app integration are required before installing/distributing. The replay ledger itself uses Node core only and does not grant approval to install libsignal.
6. **No runtime UI edits.** V189 original authenticated Calliope screenshot bytes remain unavailable to CTO inline verification. This source-only backend contract requires no new screenshots; any eventual UI pairing flow needs true owner-rendered pixels and inline CTO review.

## Boundary for the next actual product milestone

The next major decision is a genuine owner-approved, legally compatible **private single-device** Trajectory→Calliope pairing + grant + real ratchet store, with a user-visible read-only descriptor response. That work should be a separately authorized multi-repository plan reconciled against the *actual dirty loaded source* and one canonical running app. Do **not** keep manufacturing synthetic PQXDH exchanges while the legal/grant/runtime requirements remain unresolved.
