# V199 Engineer completion — live device proof and Node 24 status exchange

**Status:** RETURNED / STOPPED. Source implemented. Canonical owner apps were not modified.

**CTO pin:** `origin/cto/devproxy-v199-real-macos-signal-pilot-20261123@30edf9e2a030e84e9608b6181f16e26d8207a101`

**Execution-time package:** npm `dist-tags.latest` and GitHub `signalapp/libsignal` release `v0.108.7` agree. License `AGPL-3.0-only`. Integrity `sha512-MMpZQi0shs7xEdMOgFjyJDDJZKxilE5S27RdRbT0QCxstbgScLj3l4k4bTFB+u3JKwLH/MI949DV7MyWP2TiYQ==`. Qualified on this Mac with Node 24.18.1 arm64 before any use. Not installed into the Node 18 Config API, Node 22 Trajectory, or Node 22 Calliope service.

## What the source does

- Live mailbox enrollment verifies an Ed25519 request signature against a public registry. `x-devproxy-signal-peer` is rejected on that path. Revocation of the Calliope device fails the next delivery. A replayed device nonce is rejected. The relay still does not decrypt.
- A Node 24 endpoint seals libsignal identity, prekeys, and sessions, exchanges `proxy.status`, and completes a second exchange after both endpoints are reconstructed from the sealed stores. The reply is `executable:false` and names only `devproxy.api.ai.health`.

## Tests on this Mac

- Node 24.18.1, official `@signalapp/libsignal-client@0.108.7`: the prior 67-test native suite plus the two new tests, **69/69 PASS, 0 FAIL, 0 SKIP**.
- Node 22.19.0: mailbox HTTP suite plus the live device-proof test, **8/8 PASS**. The native endpoint test is Node 24 only.

## Deployment

Not deployed. The canonical Config API is the running RC2 stage, Node 18.20.8, and its `proxyConfigAPI.js` SHA-256 is `4ebd2194bb03be78e9f02ab0abdd313d9666869c296190bf5bdd37cd07243650`. That file has no `signal/private` route. Replacing it with this tree would discard the loaded owner build. Hosted Calliope remains `node:22-alpine` and cannot load this darwin Node 24 addon. Trajectory's live checkout was left untouched at local `eng/p0-owner-task-approval-20261123@58c20f83605afc2ecaecfaa3ee163ed7a10d2404`.

**Single blocker:** `BLOCKED_CANONICAL_LOADED_API_MISMATCH`.

No Room screenshot was captured because the Room UI was not changed. No specialist provider was launched (`NOT_SPAWNED`).
