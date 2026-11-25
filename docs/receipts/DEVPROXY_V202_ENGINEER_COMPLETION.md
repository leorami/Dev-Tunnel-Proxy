# V202 Engineer receipt — durable two-way adapter, Room path still blocked

**CTO pin:** `cto/devproxy-v202-bidirectional-private-relay-20261124@3670c31adfb1795fa7d9f7de13798d193c7a5e35`
**STARTED:** https://github.com/leorami/Dev-Tunnel-Proxy/issues/265#issuecomment-7148430425

## What landed

The private mailbox now returns a matching durable receipt on an exact retry after enqueue (role, recipient, message ID, ciphertext digest) without a second `.msg` file. A mismatched duplicate stays denied. HTTP 409 is not treated as success.

`utils/devproxy-v202-private-relay-adapter.cjs` is the least-privilege reply adapter: a 0600 32-byte host credential, not `ADMIN_PASSWORD`, derives the owner-session hash and thread binding with `origin:'host'`. Client bindings without that host origin are rejected. The Calliope endpoint enqueues opaque ciphertext through the enrolled two-way mailbox and can retry the same ciphertext after a lost response without a second decrypt.

`readProxyStatus` now fails closed when the host clock has moved past the result freshness window, not only when `observedAtMs−sentAtMs` is large.

Historical one-way failure was reproduced on isolated `7c2f3292db30cdac4ef9c4640495e57d3a746e9c`: Calliope→Trajectory deliver was HTTP 403. Current source is GREEN for that signed HTTP contract.

`CORE_PROTOCOL_LOCK.json` stays `PENDING_ORIGIN_REGISTRY` / `NOT_VERIFIED_FULL_ADOPTION`. No admin password is copied into the receiver. Sealed files stay `0600` / `O_EXCL|O_NOFOLLOW`.

## Governance read-back

Published Origin `leorami/project-template@3e7a87624faf4be7503a2829e24d5bdf493762f3`. `governance/consumers.json` on that commit does not list `leorami/Dev-Tunnel-Proxy`. Origin #29 comment #7147271428 is still the registration request. No registry acknowledgement was found, so the lock was not edited to look registered.

## Commands

Isolated RED checkout `/private/tmp/devproxy-v202-red-7c2f329` at `7c2f3292db30cdac4ef9c4640495e57d3a746e9c`, Node v25.9.0:

```bash
node --test tests/security/v199-live-device-proof.test.cjs
```

1 pass, 1 fail (V202 reverse deliver 403), 0 skip.

Engineer worktree `/private/tmp/devproxy-v202-20261124`, Node v25.9.0:

```bash
node --test tests/security/v191-calliope-agent-envelope.test.cjs tests/security/v193-calliope-artifact-descriptor-gate.test.cjs tests/security/v196-durable-replay-ledger.test.cjs tests/security/v197-signed-owner-grant-admission.test.cjs tests/security/v198-private-signal-ingress.test.cjs tests/security/v198-private-signal-mailbox.test.cjs tests/security/v198-private-signal-mailbox-http.test.cjs tests/security/v199-mailbox-ack-filesystem.test.cjs tests/security/v199-live-device-proof.test.cjs tests/security/v200-atomic-sealed-store.test.cjs tests/security/v200-enrollment-replay.test.cjs tests/security/v200-peer-pin.test.cjs tests/security/v202-private-relay-adapter.test.cjs tests/security/v201-origin-adoption.test.cjs tests/security/v201-retire-v200-diagnostic.test.cjs tests/security/v200-rc2-overlay-preservation.test.cjs
```

84 pass, 0 fail, 0 skip, exit 0.

Mac Node v25.9.0, darwin arm64, `@signalapp/libsignal-client@0.108.7` `AGPL-3.0-only` at `/private/tmp/devproxy-v199-libsignal-01087`:

```bash
V192_LIBSIGNAL_PACKAGE_ROOT=/private/tmp/devproxy-v199-libsignal-01087/node_modules/@signalapp/libsignal-client \
V192_EXPECTED_LIBSIGNAL_VERSION=0.108.7 \
node --test tests/security/v191-calliope-agent-envelope.test.cjs tests/security/v192-libsignal-two-peers.test.mjs tests/security/v193-calliope-artifact-descriptor-gate.test.cjs tests/security/v194-signal-signed-descriptor.test.mjs tests/security/v196-durable-replay-ledger.test.cjs tests/security/v197-signed-owner-grant-admission.test.cjs tests/security/v198-private-signal-ingress.test.cjs tests/security/v198-private-signal-mailbox.test.cjs tests/security/v198-private-signal-mailbox-http.test.cjs tests/security/v199-mailbox-ack-filesystem.test.cjs tests/security/v199-live-device-proof.test.cjs tests/security/v199-signal-endpoint-restart.test.mjs tests/security/v201-request-binding.test.mjs tests/security/v200-atomic-sealed-store.test.cjs tests/security/v200-enrollment-replay.test.cjs tests/security/v200-peer-pin.test.cjs tests/security/v202-private-relay-adapter.test.cjs
```

89 pass, 0 fail, 0 skip, exit 0.

GitHub Actions on the returned SHA must be read independently; this receipt does not invent those run IDs.

## Unperformed

- No signed-in Trajectory Room send or render. Issue #90 RETURNED/STOPPED #7148146903 at `eng/p0-owner-trust-reply-pixels-20261124@2ab81a97eda3f64b1e439e20b4c4c275812361d9` with nonzero `complete`. Coordination #7148212918 is not a dispatch. That checkout was not edited. No Room file was injected.
- No supervised receiver was added to hosted Calliope `npm run host:calliope` / `src/calliope/hosted-server.mjs`. Logan remote engineer `fcdbce25c8dd175ad51e393af95c0adc47603d48` still needs owning-CTO reconciliation. Coordination #233/7148213468 is not a dispatch. Logan was not edited.
- Loaded RC2 Config API was not replaced. No local activation, overlay apply, or rollback. Host worker and enrollment/ratchet state were left alone.
- No original PNG bytes were captured. Private Room pixels are `BLOCKED_VISIBLE_PIXEL_TRANSPORT`. This receipt does not claim visual acceptance or owner UAT.
- No specialist was spawned. Protected `main` was not merged. No new public listener.

## Capture note

Do not treat a synthetic public-login PNG as the private Room journey. Owner-private pixels stay on an already authorized private channel. If that channel has no bytes, the visual gate remains HOLD.
