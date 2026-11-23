# V195 Engineer preflight — owner-Mac Signal pilot readiness (READ ONLY)

**Handoff:** `origin/cto/devproxy-v195-real-owner-signal-readiness-20261123@bacbf1b8f669271564a70a636625d9fd2fa8e995:docs/handoffs/DEVPROXY_V195_OWNER_HOST_SIGNAL_READONLY_PREFLIGHT.md`  
**STARTED:** Issue #243 comment [#7113057490](https://github.com/leorami/Dev-Tunnel-Proxy/issues/243#issuecomment-7113057490)  
**Observed:** 2026-11-23T20:26:32Z  
**Scope:** Read-only process, Docker inspect, loopback HTTP status codes, and `git rev-parse` / `git grep` on already-mounted checkouts. No install, Keychain item query, env read, file hash, listener, or runtime change. `smart-dev-build.sh`, `manage.sh`, and `ensure-devproxy-attachment` were not run.

No unpublished local V195 receipt existed to republish. This is the first Engineer return.

## Lifecycle

| Ref | Status |
|---|---|
| Protected Dev Proxy `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (not the loaded tree) |
| V194 Engineer return | `6b223c2b3b9ec635d00d54180ded949ecc9d57f2` (CTO accepted #7112362032). Ancestor of this CTO tip |
| Loaded Dev Proxy checkout HEAD | `150d0e792bfca886a1509d07618aa2c5eedd5500` branch `master`, dirty working tree. **Not** a clean loaded-byte attestation |
| Loaded Trajectory checkout HEAD | `d46fe48e0e4162d1825abde1da8e95e0c0bdd354` branch `eng/p0-owner-task-approval-20261123`, dirty working tree. Not the non-main SHA cited in the V195 architecture note |

Host: macOS 27.3, arm64. Host nvm has a Node v24.18.1 install from earlier test work. That is not the running product runtime.

## Gate table

| Gate | Status | Evidence |
|---|---|---|
| Loaded Dev Proxy process | **VERIFIED_ON_OWNER_HOST** | Containers `dev-proxy` (nginx image, no Node) and `dev-proxy-config-api` running. API Node **v18.20.8**. Loopback `127.0.0.1:8080` and `127.0.0.1:3001` both returned HTTP 200 for `GET /devproxy/api/ai/health`. Mounted nginx config has 24 `auth_request` uses and no Signal route token. Checkout is dirty, so HEAD is not the loaded bytes |
| Loaded Trajectory | **VERIFIED_ON_OWNER_HOST** | `human-trajectory-ops-app` healthy, Node **v22.23.3**, loopback `127.0.0.1:4701` HTTP 200 on `/health` and `/healthz`. SHA above. Dirty tree |
| Loaded Calliope | **VERIFIED_ON_OWNER_HOST** (separate hosted container) | `devproxy-calliope-hosted-1` healthy, image `node:22-alpine`, Node **v22.23.2**, no published host port. Checkout HEAD `fd01c026e94d16616b08f0aed97b7da84822e73e` branch `engineer/calliope-plan069-photos-cross-persona-one-dev-20261105`, dirty. This is not proof it is the Room's enrolled recipient |
| V194 code in loaded apps | **VERIFIED_ON_OWNER_HOST** as absent | Descriptor gate and libsignal package are absent from the loaded Dev Proxy HEAD and from the three running app trees that were probed |
| Private transport | **NO_TRUSTED_PRIVATE_TRANSPORT** | Docker network `devproxy` currently attaches the proxy, config API, Trajectory app, and hosted Calliope (also other apps). That is adjacency, not an authenticated ciphertext channel. No `ngrok` process. Dev Proxy and Trajectory publishes are loopback; some unrelated containers publish on all interfaces. Desktop relay source on the loaded Trajectory SHA is an observe/not-send seam (`canSend` present), not a Signal path |
| Owner authority | **SOURCE_ONLY** on the loaded SHA, **BLOCKED** for this pilot | Loaded Trajectory tree contains `owner-capability-grant.ts`, `project-room-message.ts` (`executable` / `literal(false)`), `local-mac-owner-session.ts` (`deviceOwnerAuthentication`), and `desktop-relay-http.ts`. `artifact.describe` is not in the loaded grant contract. No grant was issued. macOS owner-presence is not a Calliope export approval |
| First artifact | **BLOCKED** | No private file, directory listing, or hash was taken. `utils/reports-list-catalog.cjs` is not in the loaded Dev Proxy HEAD. No already-registered nonsecret descriptor was selected |
| Crypto runtime | **VERIFIED_ON_OWNER_HOST** for versions; **BLOCKED** for libsignal | Running Nodes are 18.20.8 (API), 22.23.3 (Trajectory), 22.23.2 (hosted Calliope). libsignal is absent. Host nvm lists v24.18.1, which was not executed inside those containers. Official libsignal 0.106.0 remains AGPL-3.0-only and unsupported outside Signal (**SOURCE_ONLY** license text from the V194 pin, not a counsel opinion) |
| Key custody / durable ratchet | **BLOCKED** | Security framework and `/usr/bin/security` exist. No Keychain items were queried, no keys were created, and no durable single-writer session store was found. In-memory V191/V192 state does not survive restart |
| One canonical app | **VERIFIED_ON_OWNER_HOST** that extra stacks already exist | A future crypto worker, port, or store would be a **new owner-scoped authorization**. This preflight started none |
| UI / UAT | **Not claimed** | No UI change and no screenshot |

## Recommendation

**BLOCKED.** Do not install libsignal, open a listener, or send a Room message.

The one missing authority before any live pilot is an explicit owner decision that does two things together: accept a qualified review of AGPL-3.0-only / unsupported-outside-Signal for the real architecture, and authorize a **new** narrow enrollment plus `artifact.describe` capability. The loaded grant contract does not have that capability. macOS owner-presence, a repair ticket, and a synthetic V193 grant are not substitutes.

If that decision is later yes, the smallest pilot still has to be designed against the **loaded** identities above, not protected `main` or the V194 test branch: one Trajectory Room, ciphertext-only across the existing private Docker network, decryption only inside one enrolled Calliope process, inert metadata, `executable:false`, a crash-safe ratchet store that does not exist yet, and no file bytes. That design is not authorized by this preflight.

## Unperformed

No package install, Keychain query, env or secret-file read, private-file hash, nginx reload, Docker network change, ngrok change, new listener, synthetic PQXDH run, or protected-main merge.

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL`. One primary performed the read-only host pass. Earlier CTO comments on #243 are source notes, not this host receipt.
