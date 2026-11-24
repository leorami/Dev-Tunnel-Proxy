# V201 Engineer receipt — request-bound Signal status, Room path blocked

**CTO pin:** `cto/devproxy-v201-origin-governance-real-room-20261124@1fe4d5bf514cbba17a8e5a73359b4277a3e6156d`
**STARTED:** https://github.com/leorami/Dev-Tunnel-Proxy/issues/262#issuecomment-7147671017

## What landed

`utils/devproxy-v199-signal-endpoint.mjs` now puts the authenticated request nonce, owner-session hash, recipient Signal fingerprint, and thread id in both the `proxy.status` request and the encrypted result. The sender accepts a result only when that view matches the pending request. A stale request stays rejected after the clock moves back. The recipient checkpoints the ciphertext reply before acknowledgement, retries the same ciphertext without a second decrypt, and does not enqueue that reply twice.

Retired V200 diagnostic entrypoints stay retired. `CORE_PROTOCOL_LOCK.json` stays `PENDING_ORIGIN_REGISTRY` / `NOT_VERIFIED_FULL_ADOPTION`. No admin password is copied. Sealed stores are still created `0600` with `O_EXCL|O_NOFOLLOW`.

## Governance read-back

Published Origin `leorami/project-template@3e7a87624faf4be7503a2829e24d5bdf493762f3`. `CORE_COLLABORATION_PROTOCOL.md` blob `fda5e7311b8e0cc692827ad0918fb8fdec1f0250` matches the lock. `governance/consumers.json` on that commit does not list `leorami/Dev-Tunnel-Proxy`. Origin #29 comment #7147271428 is still the latest comment. No registry acknowledgement was found, so the lock was not edited to look registered.

## Commands

Frozen handoff, before and after the source edit, Node v25.9.0:

```bash
node --test tests/security/v201-origin-adoption.test.cjs tests/security/v201-retire-v200-diagnostic.test.cjs
```

4 pass, 0 fail, 0 skip, exit 0.

Mac Node v25.9.0, darwin arm64, `@signalapp/libsignal-client@0.108.7` `AGPL-3.0-only` (npm `latest` on 2026-11-24):

```bash
V192_LIBSIGNAL_PACKAGE_ROOT=/private/tmp/devproxy-v199-libsignal-01087/node_modules/@signalapp/libsignal-client \
V192_EXPECTED_LIBSIGNAL_VERSION=0.108.7 \
node --test tests/security/v201-request-binding.test.mjs tests/security/v199-signal-endpoint-restart.test.mjs
```

3 pass, 0 fail, 0 skip, exit 0.

Same package, related suites on Node v25.9.0: V191, V193, V196, V197, V198 mailbox/HTTP/ingress, V199 device proof and ACK filesystem, V200 sealed store, enrollment, peer pin, and RC2 overlay. 76 pass, 0 fail, 0 skip, exit 0.

Linux glibc, disposable `node:24-bookworm` container, Node v24.20.0 aarch64, official `@signalapp/libsignal-client@0.108.7` installed only in that container's temp prefix:

```bash
node --test tests/security/v201-request-binding.test.mjs tests/security/v199-signal-endpoint-restart.test.mjs
```

3 pass, 0 fail, 0 skip, exit 0. The container was removed. It is not the hosted Calliope process.

`/opt/homebrew/opt/node@24/bin/node` on this Mac is Node v25.9.0. A separate local Mac Node 24.18.1 binary was not used. GitHub Actions run `45512666520` on `macos-15` Node 24.18.1 passed 84 tests, 0 fail, 0 skip, including the request-binding and restart tests, for the parent of the authenticated Linux-lookup fix. The Linux workflow's unauthenticated GitHub release lookup returned HTTP 403 on run `45512666823`; that lookup now uses the same Actions token as the macOS workflow.

## Unperformed

- No signed-in Trajectory Room send or render. Issue #90 primary is STARTED at #7146958750 on dirty `eng/p0-owner-trust-reply-pixels-20261124`. That checkout was not edited. No Room file was injected.
- No supervised receiver was added to `devproxy-calliope-hosted-1` (`node:22-alpine`, `npm run host:calliope`). The Calliope checkout is dirty. Plan180 is READY / NOT STARTED and was not launched from here.
- Loaded Config API `/app/utils/proxyConfigAPI.js` SHA-256 remains `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3`. It was not replaced. Host worker pid 33224 was left on the durable stage product. No ratchet or enrollment state was overwritten.
- No original PNG bytes were captured. Private Room pixels are `BLOCKED_VISIBLE_PIXEL_TRANSPORT`. This receipt does not claim visual acceptance or owner UAT.
- Public synthetic capture, when a later change is actually public and contains no owner data, stays on `scripts/visuals/capture_public_login.py` and `scripts/visuals/verify_public_login_artifact.py` with the shared `MANIFEST.json` fields in `docs/architecture/DEVPROXY_ORIGIN_VISUAL_EVIDENCE.md`. No second screenshot format was added.
- No specialist was spawned. Protected `main` was not merged. No new public listener.

## Capture note

Do not treat a synthetic public-login PNG as the private Room journey. Owner-private pixels stay on an already authorized private channel. If that channel has no bytes, the visual gate remains HOLD.
