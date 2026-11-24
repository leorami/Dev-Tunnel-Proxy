# V196 Engineer completion — crash-durable signed-message replay (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v196-crash-durable-replay-20261123@788d11700a84b8224534ca5fd1ef98227ddff46a:docs/handoffs/DEVPROXY_V196_REPLAY_RESTART_SECURITY.md`  
**STARTED:** Issue #246 comment [#7120552544](https://github.com/leorami/Dev-Tunnel-Proxy/issues/246#issuecomment-7120552544)  
**Scope:** SOURCE ONLY. No live Signal service, Keychain, persistence directory on the owner host, Nginx/Compose/API/worker/proxy/ngrok, credentials, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V195 Engineer return | `faeaae4637f5cfdd2c8faea0c76b5617e7ed0b0d` (#243 STARTED #7113057490 → RETURNED/STOPPED #7113129581; CTO accepted NO-GO #7119808594) |
| CTO V196 pin | `788d11700a84b8224534ca5fd1ef98227ddff46a` (draft PR #245) |
| Competing V196 primary | none; issue #246 had no prior STARTED |
| Loaded owner apps | **not re-inspected.** V195 receipt stands: dirty Dev Proxy API Node 18.20.8, Trajectory Node 22.23.3, hosted Calliope Node 22.23.2. V196 source is **not** installed |

## Independent source audit

In-scope blobs at the CTO pin: ledger, envelope opt-in, V196 tests, workflow, architecture, handoff. Implementation tree for those four executable paths is **identical** to `f94f6fc17616649b2be30699bb3bd1d816a29690`; only later documentation commits differ.

| Check | Result |
|---|---|
| Cross-process single-nonce | **O_CREAT\|O_EXCL\|O_NOFOLLOW** on an opaque SHA-256 filename. Six real OS children admit exactly one. WeakSet branding is in-process authenticity only; the arbiter is the filesystem |
| Private-root / fail-closed | Existing absolute 0700 directory required; symlink, relative, `/`, wrong mode, missing path, I/O, quota, and unexpected filenames return false or throw `INVALID_REPLAY_DIRECTORY`. Partial writes are **not** deleted |
| Sender-wide nonce domain | Hash is `DEVPROXY-CALLIOPE-DURABLE-REPLAY-V1\n` + `sender\0nonce`, matching V191 in-memory `sender\0nonce`. Project is validated then ignored in the key. Observed CTO RED at [Actions #45310655083](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45310655083) (duplicate nonce accepted across projects) was fixed in `f94f6fc` |
| Storage contents | Filename is hex digest; file body is `V1\n` + expiry. No sender, project, nonce, or key material |
| Strict mode | `requireDurableReplay:true` without a branded ledger, or any non-null forged `{reserve:()=>true}`, throws `DURABLE_REPLAY_REQUIRED` at construction |
| Signature-before-reserve | Invalid signer never writes a ledger file. Reserve runs only after Ed25519, audience/purpose, sender/project, and time checks |
| Historical default | V191 tests construct the verifier with no `replayLedger`. Six V191 cases still pass. No new HTTP endpoint, listener, or runtime capability |

No further in-scope hole found that this contract claims to close. No Engineer source/test fix was required.

## Tests actually run

Isolated worktree at `788d11700a84b8224534ca5fd1ef98227ddff46a`. Disposable `os.tmpdir()` only. Local Node **v25.9.0**:

```text
node --check utils/calliope-agent-envelope.cjs
node --check utils/calliope-durable-replay-ledger.cjs
node --check tests/security/v196-durable-replay-ledger.test.cjs
node --test tests/security/v191-calliope-agent-envelope.test.cjs \
            tests/security/v193-calliope-artifact-descriptor-gate.test.cjs \
            tests/security/v196-durable-replay-ledger.test.cjs
# tests 23  pass 23  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

Independent original GitHub logs on the **exact CTO pin**, PR workflow synthetic merge `e0ce96d` = `Merge 788d11700a84b8224534ca5fd1ef98227ddff46a into faeaae4637f5cfdd2c8faea0c76b5617e7ed0b0d` (V196 files unchanged vs pin):

- [Actions #45310812454](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45310812454) Node **v18.20.8** `# tests 23` `# pass 23` `# fail 0` `# skipped 0`
- Same run Node **v22.23.5** `# tests 23` `# pass 23` `# fail 0` `# skipped 0`
- [Actions #45310812404](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45310812404) V191 workflow Node **v22.23.5** `# tests 6` `# pass 6` `# fail 0` `# skipped 0`

Earlier RED/GREEN cited in the handoff was re-read, not reclaimed as this tip: initial `MODULE_NOT_FOUND` [#45310479811](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45310479811); sender-wide scope RED [#45310655083](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45310655083).

`./smart-build.sh` was not invoked.

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — one primary source review, local Node tests, and original CI log inspection. No provider specialist run ID.

## Honest production blockers (not in-scope defects)

- No automatic nonce cleanup, expiry reclamation, or clock-rollback attestation
- No globally serialized quota for racing **distinct** nonces
- No ratchet/prekey/session persistence, revocation, or owner grant
- This is **not** a deployed durable Signal session service and **not** a complete replay/idempotency transaction
- V195 **NO-GO** is not overridden. Source-only replay does not authorize pairing, libsignal install, or live ciphertext

## Explicit non-claims

- **NO LIVE ACTIVATION / NO OWNER UAT.**
- GitHub receipts are not owner consent.
- Protected `main`, owner Mac source, Trajectory, hosted Calliope, Docker/NGINX/ngrok/Config API/worker, Keychain, and listeners were not changed.

## Engineer delta

This completion receipt is the only Engineer addition atop the audited CTO tip.
