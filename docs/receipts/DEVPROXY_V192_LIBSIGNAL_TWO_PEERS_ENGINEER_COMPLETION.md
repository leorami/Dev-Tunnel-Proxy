# V192 Engineer completion — official libsignal two-process offline proof (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v192-libsignal-two-peers-source-20261123@4677ba00c757177eff0ac14c8ee6b8dcb19cd199:docs/handoffs/DEVPROXY_V192_SIGNAL_TWO_PEERS.md`  
**STARTED:** Issue #234 comment [#7107066680](https://github.com/leorami/Dev-Tunnel-Proxy/issues/234#issuecomment-7107066680)  
**Scope:** SOURCE ONLY / test-only. No live Signal service, enrollment, product dependency, Nginx/Compose/API/worker/proxy/ngrok, credentials, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V191 Engineer return | `1f58c57bc407add17d88e41037164604a9b7fee8` (issue #231 STARTED #7105229260 → RETURNED/STOPPED #7105374315, PR #232) |
| CTO V192 pin | `4677ba00c757177eff0ac14c8ee6b8dcb19cd199` (draft PR #233, ancestor of the V191 return) |
| Competing primary | none; CTO VERIFIED #7106786265 is not a launched Engineer |

## Independent source audit

CTO delta vs V191 is five add-only paths: the test, the synthetic peer fixture, the runner-temp workflow, the architecture note, and the handoff. Dev Proxy `package.json` does not depend on libsignal. V191 `utils/calliope-agent-envelope.cjs` is unchanged (Ed25519 metadata verification, not Signal).

The fixture imports the installed official module and calls `processPreKeyBundle`, `signalEncrypt`, `signalDecryptPreKey`, and `signalDecrypt`. Installed `dist/index.d.ts` declares `CiphertextMessageType.Whisper = 2` and `PreKey = 3`, which are the types the test requires. Each named endpoint is a separate OS process with its own in-memory identity private key, EC prekey, signed prekey, Kyber prekey, and session map. The coordinator pins public identities before `processPreKeyBundle` and forwards only the public bundle and ciphertext. Decrypt returns a bounded metadata verdict; authority flags stay false. Ratchet state dies when the process exits.

| Check | Result |
|---|---|
| Official package, disposable prefix only | `@signalapp/libsignal-client@0.106.0`, `license: AGPL-3.0-only` |
| Distinct PIDs and public identity keys | **PASS** |
| First message type 3 (PreKey / PQXDH) and reply type 2 (Whisper ratchet) | **PASS** |
| Ciphertext bytes do not contain the fixture plaintext | **PASS** |
| Impersonated bundle, wrong receiver, tamper, replay, encrypted `artifact.export` | **PASS** (fail closed, export/execution flags false) |
| New RED for a further code defect | **Not required** — no root-cause gap found beyond CTO's already observed missing-fixture RED |
| Product runtime / Node 22 owner app | **Not integrated.** Upstream `@signalapp/types@0.3.0` asks for Node >=24.18.1. Embedding is an **integration blocker** (AGPL-3.0-only, upstream unsupported outside Signal, runtime mismatch). |

## Tests actually run

Disposable install (not the repo):

```bash
npm install --prefix /private/tmp/devproxy-v192-libsignal-pkg --no-save --no-package-lock --no-audit --no-fund --ignore-scripts @signalapp/libsignal-client@0.106.0
```

Node **v24.18.1**:

```text
node --check tests/security/v192-libsignal-two-peers.test.mjs          # exit 0
node --check tests/security/fixtures/v192-libsignal-peer.mjs            # exit 0
V192_LIBSIGNAL_PACKAGE_ROOT=.../node_modules/@signalapp/libsignal-client \
  node --test tests/security/v192-libsignal-two-peers.test.mjs
# tests 3  pass 3  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

No skipped or todo tests. No release-scope full suite claimed. Exact-SHA GitHub Actions is the `workflow_dispatch` recorded in the RETURNED/STOPPED comment (a receipt-only PR does not match the path-filtered `pull_request` trigger; a synthetic merge checkout, if any, is not the returned SHA).

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — coupled test-only libsignal fixture. One primary read the official API surface, ran the native two-process suite, and wrote this receipt. No provider specialist run ID.

## Explicit non-claims

- **NO LIVE ACTIVATION / NO SIGNAL SERVICE.** This is not Trajectory↔Calliope delivery, identity enrollment, durable sessions, a relay, or owner approval.
- In-memory ratchet state does not survive process exit.
- AGPL-3.0-only / unsupported-outside-Signal remains a blocker for any product install.
- Source outcome is **not** runtime/owner UAT.

## Engineer delta

This completion receipt is the only Engineer addition atop the audited CTO tip. Test, fixture, workflow, and architecture bytes remain the CTO candidate.
