# V192 — first actual libsignal encrypted exchange between two synthetic app peers

**CTO SOURCE-ONLY / NOT DEPLOYED / NO OWNER APP / NO NEW SERVICE.**
Verified parent: sole Dev Proxy primary V191 genuine Issue #231 STARTED #7105229260 → RETURNED/STOPPED #7105374315, exact Engineer source `1f58c57bc407add17d88e41037164604a9b7fee8`, Engineer PR #232. Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7` remains unchanged. V191's `utils/calliope-agent-envelope.cjs` is *Ed25519 metadata verification*, not Signal; leave it unmodified.

## Why this exists

Owner approved moving forward from optional Origin Signal guidance [PR #154](https://github.com/leorami/project-template/pull/154) to a genuine encrypted exchange. The first test must use the **official implementation of the Signal Protocol**, not AES with a Signal label or an unofficial Signal Messenger bot. A successful result establishes only a **synthetic proof** between two independent OS processes (named `trajectory` and `calliope`). Neither is an installed/registered actual application principal, and there is no deployed relay, browser connection, screenshot transfer, owner grant or live repair.

## Contract

- `tests/security/fixtures/v192-libsignal-peer.mjs`: standalone **test-only** process with its own ephemeral private identity key, session/ratchet state, one-time EC prekey, signed prekey and Kyber prekey. It receives only test RPC on stdin, and returns public prekey bundles, ciphertext, or minimal metadata verdicts on stdout. No repo filesystem, network API, model, owner data, ngrok, Nginx, API, worker, Docker or app state is imported. Process exit destroys all secret state.
- `tests/security/v192-libsignal-two-peers.test.mjs`: one Node test coordinator launches separate OS processes; it pins the expected recipient and sender public identity keys **before** any `processPreKeyBundle`. It forwards the recipient's public prekey bundle and ciphertext. Signal's PQXDH handshake protects the initial `PreKey` message and subsequent ratcheted `Whisper` reply. No plaintext is returned by a generic relay; test coordinator deliberately knows its *synthetic fixture message*, and a receiver explicitly returns only a bounded decision summary.
- Verification includes distinct child PIDs/keys, both directions, real `@signalapp/libsignal-client` type 3/2 messages, wrong public-key prekey bundle, wrong endpoint, corrupted ciphertext, duplicate replay and a well-encrypted but forbidden `artifact.export` intent. Sender/recipient/project are strict synthetic names, never arbitrary filesystem paths or self-authorized agent credentials. All outcomes have `ownerApprovalGranted:false`, `exportAuthorized:false`, `executionAuthorized:false`.
- `.github/workflows/devproxy-v192-libsignal-two-peers.yml` installs official `@signalapp/libsignal-client@0.106.0` in **ephemeral GitHub Actions runner temp**. No dependency in the Dev Proxy runtime or production package.json. No production builds, second canonical app runtime or operator installation. Environment and toolchain compatibility must be reported honestly.
- The signed metadata-only V191 verifier is distinct from these **Signal Protocol encrypted peer sessions**. E2EE confidentiality, endpoint authentication/identity pinning and explicit operation authorization are three different layers.

## Security and license disclosure

Official source: https://github.com/signalapp/libsignal (AGPL-3.0-only, and explicitly **unsupported for outside use**). The pinned test-only library is a technical feasibility proof, **not** legal permission to embed or distribute it with Dev Proxy, Trajectory, Calliope or any proprietary product. A reviewed AGPL/distribution/source-availability decision, platform support, independent cryptographic maintenance, upstream API stability and precise dependency provenance are mandatory before installing or deploying. The Node bridge in a transient CI runner is **not** validated for the canonical owner Mac or owner production runtime.

A real application receiver additionally requires owner-controlled identity/key enrollment, verification and device pairing, secure key storage, rotation/revocation, key-change UX, persisted and atomic session state, multi-process ratchet serialization, retry/idempotency/offline delivery, replay defense after restart, authenticated private relay or TLS, metadata/retention controls and source/runtime attestation. The test harness has none of those and may not be connected to a live port. Encryption is **never** permission to read private files, execute emergency operations, contact external parties, access GitHub or approve a heal.

## Origin policy linkage

Origin Signal Protocol remains **optional opt-in** and review-only (draft #154). Origin deployment standards PRs #151/#153 must be reconciled separately. This repo remains an unregistered Origin-like consumer at issue #226, so do **not** auto-register, automatically propagate changes or merge Origin policy from this Dev Proxy source-only assignment.

## Explicit Non-goals

No actual Trajectory process, live Calliope service, Signal Messenger account, webhook, API, listener, credentials, paid service, network transport, private original PNG, file export, PR merge, owner approval, live heal, Nginx reload, Compose, worker restart, or deployment. No claim of end-to-end security in the deployed product from test-only process encryption.

## Acceptance Criteria

1. Real official pinned libsignal native binding loads in an isolated CI runner; exact package/version/license reported. Failing dependency install, incompatible Node runtime or unsupported platform is **BLOCKED**, never silently replaced by homegrown cryptography.
2. Node suite proves the first native prekey ciphertext and subsequent ratchet reply between two independent processes with *different* private keys and pinned public identities; exact app names are symbolic synthetic fixtures only.
3. Negative tests fail closed for swapped identity, wrong recipient, invalid ciphertext, replay and prohibited file-export purpose with all execution/disclosure flags false. No skipped in-scope failures.
4. RED-first observed CI or local failure, then exact-tip GREEN tests; any new meaningful failure fixed at root cause without weakening checks.
5. One primary Engineer independently audits actual code, source and CI, verifies dependency/platform limits, reports SHA and one consolidated receipt. A source-only test is not an owner UAT.
6. Real Signal Protocol deployment stays behind a **new** explicit authorization and separately reviewed licensing/security/runtime milestone. V190 Nginx source release and V189 authenticated screenshot-byte transport are unchanged.
