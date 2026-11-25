# V198 Engineer completion — private Signal ciphertext mailbox behind Config API (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v198-private-signal-delivery-20261123@3d26307355b7e038412c26356b26764a7f3df2aa:docs/handoffs/DEVPROXY_V198_OWNER_AUTHENTICATED_RELAY.md`  
**STARTED:** Issue #253 comment [#7121717988](https://github.com/leorami/Dev-Tunnel-Proxy/issues/253#issuecomment-7121717988)  
**Scope:** SOURCE ONLY. No live activation, owner Mac source swap, Docker/Config API/nginx/ngrok restart, listener, new port, Signal account, Keychain, credential write, private export, Trajectory/Calliope live write, protected-main merge, or `./smart-build.sh` / `manage.sh up`.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V197 Engineer return | `5c3c43a42eb225ce8ad4bdaceb3cd35d12dd3113` (#249 STARTED #7121083423 → RETURNED/STOPPED #7121108865; CTO accepted #7121134853) |
| CTO V198 pin | `3d26307355b7e038412c26356b26764a7f3df2aa` (draft PR #252), based directly on that V197 return |
| Competing V198 primary | none; issue #253 had no prior STARTED |
| Loaded owner apps | **not re-inspected.** V195 receipt stands. V198 source is **not** installed |

## Implementation

Default-disabled `/devproxy/api/signal/private` data plane in existing `utils/proxyConfigAPI.js`:

- Namespace is intercepted **before** the anonymous OPTIONS `Access-Control-Allow-Origin: *` handler. Private OPTIONS returns 401 without CORS method leak.
- Existing `classifyManagementRequest` + `requireAuth` + Origin/CSRF run before any body read. Admin cookie is not a Signal device identity.
- With no trusted enrollment source (production default, and authenticated browser without injected machine identity) the route returns **503 `SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED`**.
- Isolated tests may inject a branded mailbox plus host-owned peer callbacks. Only then POST `/deliver`, GET `/inbox`, POST `/ack` admit, enqueue, list, and ack opaque Signal ciphertext (types 2/3).
- Bounded JSON reader rejects oversized bodies. Extra client fields (`ownerApproved`, path, purpose, plaintext) never create authority.
- Success and deny payloads keep all approval/export/execution/heal/live/production flags **false**. Deliver HTTP responses do not echo ciphertext.

`utils/calliope-private-signal-mailbox.cjs` is a dedicated helper, not the V196 nonce ledger:

- Requires a **preexisting** owner-private 0700 directory; never mkdir. Rejects `.artifacts`, symlinks, non-absolute paths, and world-readable modes.
- Writes `{messageId}.msg` with `O_EXCL` + 0600 + file/dir fsync. Duplicate messageId or payload SHA-256 cannot create a second delivery.
- List returns ciphertext only to the bound recipient. Expired records are omitted, not silently deleted.
- Ack fsyncs `{messageId}.ack` first; only then the `.msg` may be unlinked. Restart without ack still lists; duplicate ack fails closed.

## Tests actually run

Isolated worktree at the CTO pin plus Engineer delta. Disposable `os.tmpdir()` mailbox roots only. Local Node **v25.9.0**:

```text
node --check utils/calliope-private-signal-admission.cjs
node --check utils/calliope-private-signal-mailbox.cjs
node --test tests/security/v191-calliope-agent-envelope.test.cjs \
            tests/security/v193-calliope-artifact-descriptor-gate.test.cjs \
            tests/security/v196-durable-replay-ledger.test.cjs \
            tests/security/v197-signed-owner-grant-admission.test.cjs \
            tests/security/v198-private-signal-ingress.test.cjs \
            tests/security/v198-private-signal-mailbox.test.cjs \
            tests/security/v198-private-signal-mailbox-http.test.cjs
# tests 56  pass 56  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

`./smart-build.sh` was not invoked. Original GitHub Actions on this Engineer SHA are recorded on the RETURNED comment after push.

## Specialists

`NOT_SPAWNED` — no separate provider session ID for an isolated mailbox-only worktree. Primary implemented mailbox helper, HTTP integration, and tests. No libsignal npm/AGPL contact.

## Honest production blockers (not in-scope defects)

- No trusted server-held peer registry or owner session-grant issuer is installed
- Test peer header/callbacks are **not** a real device enrollment
- Official libsignal latest-tested **v0.108.6** remains Linux Node24 CI qualification only; not owner macOS / Node18/22 runtime
- AGPL-3.0-only and unsupported third-party use are not waived
- V195 **PILOT NO-GO** remains
- No nginx `^~` location was added; this is not a live network route

## Explicit non-claims

- **NO LIVE ACTIVATION / NO OWNER UAT.**
- No UI change, so no original screenshot bytes apply.
- Protected `main`, owner Mac source, Trajectory, hosted Calliope, Docker/NGINX/ngrok/Config API/worker, Keychain, and listeners were not changed.
