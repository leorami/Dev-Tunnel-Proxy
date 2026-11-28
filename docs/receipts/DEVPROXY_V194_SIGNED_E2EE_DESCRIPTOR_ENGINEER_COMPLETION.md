# V194 Engineer completion — encrypted, signed, inert artifact.describe (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v194-signal-signed-describe-integration-20261123@9796125b3447db141dcd29800cdacd964828a4d2:docs/handoffs/DEVPROXY_V194_SIGNED_E2EE_DESCRIPTOR.md`  
**STARTED:** Issue #240 comment [#7112239352](https://github.com/leorami/Dev-Tunnel-Proxy/issues/240#issuecomment-7112239352)  
**Scope:** SOURCE ONLY. No live Signal service, enrollment, file export, Nginx/Compose/API/worker/proxy/ngrok, credentials, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V192 Engineer return | `636bbca02b9e72f8505b29b3275ca2288c3c651c` (#234 STARTED #7107066680 → RETURNED/STOPPED #7107162813) |
| V193 Engineer return (ancestor) | `1f3452a0a40183d1f5ef678c5d0f4a1119469a72` (#237 STARTED #7109179053 → RETURNED/STOPPED #7109222934, CTO accepted #7109284994) |
| CTO V194 pin | `9796125b3447db141dcd29800cdacd964828a4d2` (draft PR #239) |
| Competing primary | none; issue #240 had no prior STARTED |

## Independent source audit

The V194 tip descends from the V193 Engineer return. Five of the six V192 add-only files match that return's blobs exactly (test, V192 workflow, architecture, handoff, receipt). The peer fixture blob differs because V194 adds test-only `configure-describe`, `encrypt-signed-describe`, and `decrypt-and-describe`. V191 and V193 helpers are unchanged. Dev Proxy `package.json` does not depend on libsignal.

| Check | Result |
|---|---|
| Signal identity vs Ed25519 signer | **Separate.** `Signal.PrivateKey.generate()` is the E2EE identity; `generateKeyPairSync('ed25519')` is the metadata signer. The coordinator sees only both public values |
| Coordinator role | **Synthetic bootstrap only.** It pins Signal public identities and installs the sender's public signing key. It does not receive a private key or a grant taken from ciphertext |
| Grant / manifest | Hard-coded inside the Calliope process. `withGrant:false` denies a valid encrypted signature. `ownerConsentProven` is returned false |
| Plaintext | Decryption and `descriptorGate.describe` run in the recipient process. The relay result is inert `DESCRIPTOR_CANDIDATE_ONLY` metadata. Authority flags stay false |
| Fail-closed negatives | Missing grant, `artifact.export`, forged `ownerApproved`, tampered signature, digest mismatch, and a second Signal ciphertext with the same V191 nonce deny. Existing V192 wrong-recipient/identity/tamper tests still pass |
| New in-scope hole | **Not demonstrated.** No RED cycle added |

Live-integration blockers, unchanged by this proof: synthetic grant is not owner consent; Signal and Ed25519 keys are not one enrolled principal; ratchet and nonce state die at exit; `sourceCommit` is not loaded-byte attestation; libsignal is **AGPL-3.0-only** and unsupported outside Signal; the test runtime is Node 24.18.1, not the historical Node 22 owner API.

## Tests actually run

Disposable install (not the repo): `@signalapp/libsignal-client@0.106.0`, license `AGPL-3.0-only`. Node **v24.18.1**.

```text
node --check tests/security/fixtures/v192-libsignal-peer.mjs          # exit 0
node --check tests/security/v194-signal-signed-descriptor.test.mjs    # exit 0
node --check utils/calliope-agent-envelope.cjs                        # exit 0
node --check utils/calliope-artifact-descriptor-gate.cjs              # exit 0
node --test tests/security/v191-calliope-agent-envelope.test.cjs \
            tests/security/v193-calliope-artifact-descriptor-gate.test.cjs \
            tests/security/v192-libsignal-two-peers.test.mjs \
            tests/security/v194-signal-signed-descriptor.test.mjs
# tests 21  pass 21  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

No skipped or todo tests. No release-scope full suite. Exact-SHA GitHub Actions is the `workflow_dispatch` recorded in the RETURNED/STOPPED comment (a receipt-only PR does not match the path-filtered `pull_request` trigger).

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — coupled test-only proof. One primary read the fixture diff and helpers, ran the suite, and wrote this receipt. No provider specialist run ID.

## Explicit non-claims

- **NO LIVE ACTIVATION / NO SIGNAL SERVICE.** This is not Trajectory↔Calliope delivery, owner enrollment, or file export.
- Source outcome is **not** runtime/owner UAT.
- The handoff's next step, after CTO accepts this return, is a decision-ready real enrollment/license/persistence proposal, not another synthetic demo.

## Engineer delta

This completion receipt is the only Engineer addition atop the audited CTO tip.
