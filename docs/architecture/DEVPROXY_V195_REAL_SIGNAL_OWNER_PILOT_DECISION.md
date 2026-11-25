# V195 — first **real** owner-to-Calliope Signal pilot: evidence and decision contract

**CTO DESIGN + NEXT READ-ONLY OWNER-MAC PREFLIGHT. NOT DEPLOYED. NOT A NEW SIGNAL DEMO.**

## Product outcome

The owner wants Trajectory and Calliope to converse over the actual Signal Protocol where appropriate, with Dev Proxy as a required Trajectory installation and as a trustworthy local bridge. The first useful milestone must involve **the owner's installed, authenticated Trajectory Room** reaching **the owner's actual Calliope recipient**, receiving a current, attributable, permission-checked description of one explicitly selected artifact, and preserving the Room's non-executable conversation/evidence semantics. No source execution, repair or private original-byte export follows from a conversation.

The next work is **not another isolated two-process fixture**. V191–V194 already established a cryptographic source proof. Before a live message, we need to learn what is actually installed and legally supportable, identify enrollment and grant authority, and establish that the app can recover safely from crashes and retries.

### Verified source anchors and non-claims (2026-11-23)

- Dev Proxy: sole primary V194 [Issue #240](https://github.com/leorami/Dev-Tunnel-Proxy/issues/240) STARTED #7112239352 → RETURNED/STOPPED #7112315310; [Engineer PR #241](https://github.com/leorami/Dev-Tunnel-Proxy/pull/241) exact `engineer/devproxy-v194-signal-signed-describe-integration-20261123@6b223c2b3b9ec635d00d54180ded949ecc9d57f2`. CTO independently reviewed the actual receipt-only diff and original exact-SHA Node24 Actions #45253907802 log: **21/21 PASS, 0 FAIL, 0 SKIP**. **The code is test-only; no live app has adopted it.**
- Protected Dev Proxy `main@590bcf2a980b434f533ddacac43a24a777a933e7` remains unchanged; main does **not** prove the owner Mac's installed build identity.
- `utils/proxyConfigAPI.js` at the reviewed source contains a Node `http.createServer(handle)` running when invoked directly, historically default port 3001; `docker-compose.yml` maps the config and notifications API ports to loopback. Dev Proxy's Nginx already fronts management routes and uses `auth_request` for protected paths. **Actual loaded Nginx, Docker and host runtime must be read/attested independently; source templates are not the live config.**
- `utils/managementAuthPolicy.cjs` treats only exact `GET /devproxy/api/ai/health` as anonymous in the management namespace. `utils/rc2-owner-heal-proposal-ticket.cjs` provides *in-memory session-bound repair tickets* but explicitly says tickets do not prove owner consent or authorize host execution. Do NOT repurpose those repair tickets as messaging enrollment or file-disclosure grants.
- `utils/reports-list-catalog.cjs` already offers a bounded read-only report index with concurrency/admission limits. It is **not** a trustworthy current SHA-256 manifest or a grant to disclose its entries; any first artifact must be separately selected, hash/rights/source-attested, owner-authorized and manifest-bound.
- Trajectory live work exists on non-main branches (latest observed Engineer #374 `eng/p0-native-status-one-host-probe-after372-20261122@1d3cd69b6530bf265ac006154cb8361357e376e9`). Historical `packages/contracts/src/project-room-message.ts@6abf222b96763268282ce940e0bd4859ce9cca1f` enforces `executable:false`; historical `docs/architecture/AUTHORITY_MODEL_V1.md@3079e49a8df947553c3b24eca38c8d16dcdc6cec` requires task Mode ∩ exact Dispatch plus separate OwnerCapabilityGrant. **These are code history only, not attestation of the current installed Trajectory Room**.
- Origin optional Signal Protocol guidance [draft PR #154](https://github.com/leorami/project-template/pull/154) remains unmerged, not a mandate to all projects or runtime authority.

## Architecture decisions proposed, NOT YET AUTHORIZED

### 1. Choose the first real channel narrowly

A **single-device owner-initiated private `artifact.describe` conversation** between the authenticated canonical Trajectory Room and real Calliope backend. No general-purpose event bus, group messaging, remote device enrollment, arbitrary paths, screenshots, execution, auto-heal, new public HTTP route or ngrok port. Permit one explicit, short-lived enrollment and one trusted read-only reply, and nothing else.

First pilot should remain local/private, unless owner separately approves authenticated remote exposure. Even a private loopback path needs endpoint authentication, tamper resistance, replay controls and owner consent. Existing auth checks and CSRF must remain; Signal does not replace HTTP/OS access controls.

### 2. Decide where crypto actually runs — based on ORIGINAL owner-host evidence

**Preferred for evaluation (not chosen or installed):** isolated Node24 Signal companion with private, OS-restricted local transport, separate from the existing Node22 Config API and Trajectory's canonical UI process. Candidate host-native macOS implementation may leverage Keychain-backed device secrets; candidate container-side implementation needs a reviewed private key store and a separately authenticated bridge across the host/container boundary. **Do not claim a Unix socket works across an existing Docker boundary unless actual mounts, ownership and topology prove it.**

The companion would hold sender/recipient per-device identity and ratchet state; Dev Proxy serves as a bounded authenticated ciphertext *relay* and source of authorized, observed artifact descriptors, without routine plaintext visibility. If Calliope itself needs plaintext to answer, it must be one verified recipient endpoint after decryption. Never store private Signal keys in `.artifacts`, GitHub, logs, Room text, environment or a publicly mounted directory.

### 3. Bind ALL identities before the first message

An owner-controlled, authenticated enrollment ceremony must pair: Trajectory product/room → Calliope product/project → device identity fingerprint → Signal identity key → separate Ed25519 metadata-signing identity key (if retained) → current owner/session identity. An attacker cannot change one key in a valid Signal session and retain sender authority under another key. Device mismatch, revoked session, missing verified enrollment, changed key, unexpected project or wrong recipient **fail CLOSED**. A `Signal-encrypted` label is not proof a human approved an artifact.

Owner-visible approval should be concise, in the existing conversation context. No secrets, QR payloads or recovery codes in GitHub coordination; use trusted app/OS interfaces only. Enrollment/grants are distinct from executable task Dispatch.

### 4. Persist and reconcile state or BLOCK activation

A process-local replay map and in-memory test ratchet cannot survive restarts or two workers. A real endpoint needs a reviewed durable state store with **per-conversation single-writer session updates**, crash-safe persistence of session/ratchet evolution, prekey lifecycle, encrypted-at-rest key custody, durable atomic nonce/idempotency, offline/duplicate delivery handling, bounded ciphertext retention, recovery/rotation, revocation and deterministic reconciliation after power loss. Failure to establish crash-safe persistence is a **NO-GO**, not an acceptable temporary deployment risk.

Never log plaintext, owner grants, private keys, private filenames, raw screenshots, session secrets or encoded encrypted credentials. Redacted audit records may include source SHA, message type, timing, policy decision and stable opaque reference, and must be bounded and deletable.

### 5. Reuse app semantics, not fake permissions

Trajectory Room may render the eventual short read-only descriptor response with exact source provenance and time, **`executable:false`**. A separate owner session and exact task/recipient/project/digest grant must be issued through an authenticated, owner-authoritative service **outside the encrypted request body**. V193's `trustedGrants` is an injected *policy input*, not a legitimate grant issuer. Do not mark `ownerApprovalGranted:true` on a mere manifest match.

The first artifact must come from an already authorized, exact project source and bounded safe metadata manifest; its `sourceCommit` must match the *actual loaded product*, not simply any 40-hex string. No arbitrary client path, URL, file read or PNG binary in V1. A missing manifest, absent owner-grant issuer or uncertain source match means a clear, non-executable **blocked/unavailable** Room response.

### 6. Licensing/support and platform compatibility are actual gates

Official [libsignal README](https://github.com/signalapp/libsignal) explicitly describes outside-of-Signal use as **unsupported**; the official `node/package.json@v0.106.0` declares `AGPL-3.0-only`. The official library exposes macOS native addon builds, but the existing tests ran on Linux Node24.18.1; a compatible original macOS runtime/CPU architecture has **not** been proven. `@signalapp/types@0.3.0` declared Node >=24.18.1 in the engineering CI; historical Config API uses Node22. **Never silently upgrade the canonical API or embed this dependency in a proprietary application.**

A qualified legal/commercial review must address AGPL distribution/network-service/source obligations for the actual architecture. Technical decision must address third-party API breakage, upstream patches, deployment platform and maintenance. The viable paths are: (A) adopt official libsignal with a fully reviewed AGPL-compliant distribution/operation and unsupported-API maintenance posture; (B) secure separately verifiable permission/support or a suitable licensed maintained implementation; (C) keep existing authenticated TLS/local transport and classify actual Signal rollout **BLOCKED** until these gates are resolved. **Option C is not a Signal Protocol implementation and must never be marketed as one.** No license or legal conclusion is implied by this document.

## First legitimate owner-Mac preflight — READ ONLY

One primary Cursor Engineer already operating on the owner's authentic machine should establish **without mutations**:

1. **Actual loaded runtimes:** one current canonical Trajectory owner UI/backend and actual Dev Proxy Config API/Calliope identity, original source/worktree/branch/full SHA, loaded binary/build IDs, Node/container versions, OS architecture. Clearly distinguish installed and running identities from remote branches or historical receipts. Observe only process identity/status, not secret-bearing arguments, raw environment, command history or private logs.
2. **Existing private transport:** whether Dev Proxy/Trajectory already have an authenticated loopback/Unix socket/host↔container channel that could carry opaque ciphertext without a new public listener. Identify actual ingress auth/CSRF, loopback ownership, network/mount privilege and whether Docker boundary invalidates a proposed shared socket. Read-only `nginx -T` or process config inspection only when existing host permissions allow, **redact** secrets/private path details; no reload/restart.
3. **Trusted owner authority seam:** actual owner-approved, source-grounded Trajectory Room message and permission/Dispatch boundary; real Dev Proxy owner session and separate approved-grant issuance. List precisely missing capability for `artifact.describe`, without creating grants or initiating a permission prompt.
4. **Candidate data/source:** identify one concrete already-existing read-only artifact/catalog source that could yield a bounded metadata descriptor after an explicit grant, and how a trustworthy current hash/loaded-source check would be performed. **Do not open, hash or transmit private file bytes during the preflight**.
5. **Crypto runtime feasibility:** check installed toolchain availability/version and nonsecret platform identifiers; do not npm/brew install, run libsignal native code on the owner host, generate keys, query Keychain secrets, or create a sidecar. Mac Node24 availability or build compatibility is **UNKNOWN until directly attested**.
6. **Persistence feasibility:** identify candidates for an encrypted secure state store/owner Keychain access and crash-safe single-writer ratchet state. If absent, say BLOCKED. Do not create key material, new data stores, access tokens or owner account connections.
7. **Current security and visual gates:** V190 Nginx route-auth fix source-only/undeployed and V189 authenticated original screenshot transfer unresolved; any future new owner UI requires original screenshot pixels/inline CTO review before acceptance. No UI changes in read-only preflight.

One table of `VERIFIED_ON_OWNER_HOST` / `SOURCE_ONLY` / `UNKNOWN` / `BLOCKED` per gate, exact nonsecret evidence and **one** concrete recommended real integration boundary. No leaked tokens, secrets, owner file paths, private source tree listings, personal records or screenshot bytes in public GitHub.

## Single owner decision AFTER preflight, not before

We should return an **actionable** recommended pilot implementation (not a massive platform): platform/runtime, trusted pairing UX, owner-authenticated grant source, exact allowlisted artifact, secure session state, private transport, legal/support route and one staged rollback. Ask the owner only for genuinely needed decisions: license/support strategy, if required, and explicit permission to install/activate components, to create keys, or to expose a new private service. The existing instruction to do CTO work is **not** that release/credential authorization.

If the real first pilot remains technically or legally BLOCKED, report it plainly and keep current authenticated transport working. Do not produce a fifth synthetic demo merely because no live deployment is yet allowed.

## Acceptance and STOP

**Preflight done:** fresh genuine lifecycle, exact actual owner Mac/runtime/source evidence, truthful legal/compatibility/identity/persistence findings, chosen smallest real owner capability, one bounded decision-ready next plan with explicit missing owner approvals. No new code or live service required for the read-only preflight.

**STOP:** No installs, key creation/import/export, credentials, network listener, tunnel, API/worker/NGINX/Docker mutations, git merges, owner files, Signal Messenger registration, contact with Signal or Brian Acton, user-facing claims of active E2EE, new screenshot/file export, or attempts to bypass previously required UAT and release authorization.
