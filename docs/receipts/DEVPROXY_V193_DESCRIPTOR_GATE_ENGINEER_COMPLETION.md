# V193 Engineer completion — source-locked artifact descriptor gate (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v193-descriptor-consent-boundary-20261123@fa74da5bb8d5edd72a9aec5e17d8232f170f2ee1:docs/handoffs/DEVPROXY_V193_DESCRIBE_SOURCE_ONLY.md`  
**STARTED:** Issue #237 comment [#7109179053](https://github.com/leorami/Dev-Tunnel-Proxy/issues/237#issuecomment-7109179053)  
**Scope:** SOURCE ONLY. No API listener, Signal transport, file read/export, owner-consent issuance, Nginx/Compose/API/worker/proxy/ngrok, credentials, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V191 Engineer return (ancestor) | `1f58c57bc407add17d88e41037164604a9b7fee8` |
| V192 Engineer return (sibling, not an ancestor) | `636bbca02b9e72f8505b29b3275ca2288c3c651c` (issue #234 STARTED #7107066680 → RETURNED/STOPPED #7107162813; CTO source-accepted #7107196479) |
| CTO V193 pin | `fa74da5bb8d5edd72a9aec5e17d8232f170f2ee1` (draft PR #236) |
| Competing primary | none; cross-project note #7107368219 is not a launched Engineer |

V192 was not rebased onto this branch.

## Independent source audit

CTO delta vs V191 is five add-only paths: the descriptor gate, focused tests, Node 22 workflow, architecture note, and this handoff. No `package.json`, Config API, Nginx, Docker, or runtime-version change.

`createCalliopeArtifactDescriptorGate` builds the real V191 `createCalliopeAgentEnvelopeVerifier`. `strictValues` requires a plain object, exact own keys, and data properties (getters, symbols, and a non-`Object.prototype` prototype fail). Manifest and grant rows are validated, copied, and frozen at construction; duplicate keys throw. `describe` accepts only a V191-verified `artifact.describe` envelope whose sender, project, and digest match both records and whose grant `sourceCommit` equals the manifest. Success is frozen `DESCRIPTOR_CANDIDATE_ONLY` plus inert `mediaType` / `byteLength` / `sourceCommit` / `capturedAtMs`. Every authority flag is an own `false`. A caller object `{verified:true}` is not an envelope and is denied. The module does not import `fs`, `net`, `http`, `child_process`, or read `process.env`.

| Live-integration blocker (not a missing V193 test) | Status |
|---|---|
| `trustedGrants` / manifests are caller-supplied policy inputs, not a cryptographic owner-consent attestation | **Unsolved here** |
| Passing match must not be reported as `ownerApprovalGranted:true` | **Held** (always false) |
| V191 nonce replay is per verifier process, not restart- or multi-process durable | **Unsolved here** |
| `sourceCommit` is a 40-hex shape check, not loaded-byte attestation | **Unsolved here** |
| V192 libsignal proof | **Separate sibling.** Not wired in and not a consent substitute |

No further in-scope code defect was demonstrated. No RED/GREEN remediation cycle was added.

## Tests actually run (isolated worktree, Node **v22.19.0**)

```text
node --check utils/calliope-artifact-descriptor-gate.cjs                 # exit 0
node --check tests/security/v193-calliope-artifact-descriptor-gate.test.cjs  # exit 0
node --check utils/calliope-agent-envelope.cjs                           # exit 0
node --test tests/security/v191-calliope-agent-envelope.test.cjs \
            tests/security/v193-calliope-artifact-descriptor-gate.test.cjs
# tests 14  pass 14  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

No skipped or todo tests. No release-scope full suite and no `smart-build.sh test:all`. Exact-SHA GitHub Actions is the `workflow_dispatch` recorded in the RETURNED/STOPPED comment (a receipt-only PR does not match the path-filtered `pull_request` trigger).

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — one coupled policy helper. One primary read the gate and V191 verifier, ran the focused suite, and wrote this receipt. No provider specialist run ID.

## Explicit non-claims

- **NO LIVE ACTIVATION.** This is not a receiver, Signal service, file export, or owner grant issuer.
- Source outcome is **not** runtime/owner UAT.

## Engineer delta

This completion receipt is the only Engineer addition atop the audited CTO tip.
