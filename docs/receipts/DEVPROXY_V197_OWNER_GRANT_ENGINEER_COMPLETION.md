# V197 Engineer completion — owner-issuer-signed artifact.describe grant candidate (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v197-owner-grant-signature-20261123@7aa94b971e3a7de9a98a89dd24daacec8ac2d00e:docs/handoffs/DEVPROXY_V197_OWNER_GRANT_SOURCE_REVIEW.md`  
**STARTED:** Issue #249 comment [#7121083423](https://github.com/leorami/Dev-Tunnel-Proxy/issues/249#issuecomment-7121083423)  
**Scope:** SOURCE ONLY. No real issuer, grant minting, Keychain, libsignal, listener, Nginx/Compose/API/worker/proxy/ngrok, Trajectory/Calliope live write, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V196 Engineer return | `59f2719800768cab2ccc499395a365116b8ab3a1` (#246 STARTED #7120552544 → RETURNED/STOPPED #7120582256; CTO accepted #7120882029) |
| CTO V197 pin | `7aa94b971e3a7de9a98a89dd24daacec8ac2d00e` (draft PR #248), based directly on that V196 return |
| Competing V197 primary | none; issue #249 had no prior STARTED |
| Loaded owner apps | **not re-inspected.** V195 receipt stands. V197 source is **not** installed |

## Independent source audit

Five add-only paths vs V196 Engineer: grant module, V197 tests, workflow, architecture, handoff. Executable grant/test blobs at the pin match `fb74c865d721a058744d48930d9d8beda6f3c450`; later commits are documentation only.

| Check | Result |
|---|---|
| Issuer vs sender keys | SPKI DER SHA-256 of pinned public keys must differ or construction throws `ISSUER_SIGNER_KEY_SEPARATION`. Dedicated RED test. Observed CTO RED [Actions #45318366829](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45318366829) before `fb74c86` |
| Public-only config | Private issuer KeyObject / PKCS material throws `INVALID_ISSUER_PUBLIC_KEY`. Outsider issuer signature and outsider V191 request denied |
| Canonical grant bytes | Fixed ordered `SIGNED` fields under `DEVPROXY-CALLIOPE-OWNER-DESCRIBE-GRANT-V1\n`. Extra fields, `ownerApproved`, path/bytes/export, prototype inheritance fail closed |
| Pinning | Grant must match configured issuer name, sender, recipient, project, owner session hash, sender signing-key hash, recipient Signal-key hash, artifact SHA-256, sourceCommit, purpose `artifact.describe` |
| Request binding | Grant `requestNonce` must equal V191 nonce; request issuedAt ≤ grant issuedAt; request expiresAt ≥ grant expiresAt; window ≤ 60s. Invalid/forged V191 never admitted |
| V191 + V196 | Verifier always constructs `requireDurableReplay:true` with a branded ledger. Missing/forged ledger throws `DURABLE_REPLAY_REQUIRED`. Duplicate after reconstruction denied by disk reservation. Grant checks run **before** `verifyEnvelope`, so a bad grant does not burn a nonce |
| Revocation / enrollment | `isRevoked` must be exactly `false`; `isEnrollmentActive` must be exactly `true`. Throw, Promise, or other truthy/falsey values deny |
| Success / deny payloads | Success is frozen `SIGNED_OWNER_GRANT_CANDIDATE_ONLY` with all authority flags false. Deny is frozen `SIGNED_OWNER_GRANT_REJECTED` without grant contents, session/Signal hashes, path, bytes, or consent fields |
| Imports | Grant module uses `node:crypto` and V191 envelope only. No fs/net/http/child_process |

A valid candidate **does not** prove human consent, loaded-byte attestation, or a real enrolled recipient. Callers can inject always-safe callbacks; that is a production blocker, not an in-scope defect. No trusted issuer private key exists in this tree. No Engineer source/test fix was required.

## Tests actually run

Isolated worktree at `7aa94b971e3a7de9a98a89dd24daacec8ac2d00e`. Disposable `os.tmpdir()` only. Local Node **v25.9.0**:

```text
node --check utils/calliope-owner-describe-grant.cjs
node --check utils/calliope-agent-envelope.cjs
node --check utils/calliope-durable-replay-ledger.cjs
node --check tests/security/v197-signed-owner-grant-admission.test.cjs
node --test tests/security/v191-calliope-agent-envelope.test.cjs \
            tests/security/v193-calliope-artifact-descriptor-gate.test.cjs \
            tests/security/v196-durable-replay-ledger.test.cjs \
            tests/security/v197-signed-owner-grant-admission.test.cjs
# tests 33  pass 33  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

Independent original GitHub logs on the **exact CTO pin**, PR synthetic merge `362342d` = `Merge 7aa94b971e3a7de9a98a89dd24daacec8ac2d00e into 59f2719800768cab2ccc499395a365116b8ab3a1` (V197 executable files unchanged vs pin):

- [Actions #45318440984](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45318440984) Node **v18.20.8** `# tests 33` `# pass 33` `# fail 0` `# skipped 0`
- Same run Node **v22.23.5** `# tests 33` `# pass 33` `# fail 0` `# skipped 0`

Earlier RED/GREEN re-read, not reclaimed as this tip: missing module [#45318085125](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45318085125); 32/32 before key-separation [#45318149478](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45318149478); key-separation RED [#45318366829](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45318366829).

`./smart-build.sh` was not invoked.

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — coupled issuer-verification review. No launched provider license/maintenance session. No specialist run ID.

## Honest production blockers (not in-scope defects)

- Injected `isRevoked` / `isEnrollmentActive` are not a trusted owner-session or enrollment service
- No issuer key, Keychain, grant store, recipient pairing, or ratchet/prekey persistence
- Signature verification is **not** proof of owner's actual consent
- V195 **PILOT NO-GO** and AGPL-3.0-only libsignal (now also observed upstream **0.108.5**, still unsupported outside Signal) are not overridden
- After this return the next product artifact must be a single owner-approval proposal, not another standalone crypto proof

## Explicit non-claims

- **NO LIVE ACTIVATION / NO OWNER UAT.**
- GitHub receipts are not owner consent.
- Protected `main`, owner Mac source, Trajectory, hosted Calliope, Docker/NGINX/ngrok/Config API/worker, Keychain, and listeners were not changed.

## Engineer delta

This completion receipt is the only Engineer addition atop the audited CTO tip.
