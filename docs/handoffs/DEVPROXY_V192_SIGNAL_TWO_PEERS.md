# V192 — exact single-primary source-only Signal Protocol proof handoff

**PREPARED / NOT STARTED / NO LIVE APP / NO PRODUCTION RELEASE.** Only the real primary Cursor Engineer-I may mark STARTED after launching. GitHub issue/PR/CTO tests are not actual provider execution.

## Reconciled ancestors and scope

- Repository `leorami/Dev-Tunnel-Proxy`. V191 sole primary Engineer-I genuine issue #231 [STARTED #7105229260](https://github.com/leorami/Dev-Tunnel-Proxy/issues/231#issuecomment-7105229260) → [RETURNED/STOPPED #7105374315](https://github.com/leorami/Dev-Tunnel-Proxy/issues/231#issuecomment-7105374315), returned `engineer/devproxy-v191-calliope-agent-envelope-20261123@1f58c57bc407add17d88e41037164604a9b7fee8`, draft PR #232. CTO independently reviewed actual three-file diff and final exact-source six passing Node22 tests in Actions #45203709716. V191 source is **not** Signal Protocol.
- V192 isolated CTO source branch `cto/devproxy-v192-libsignal-two-peers-source-20261123` descends **exactly** from returned Engineer V191. Final CTO SHA is supplied in the launch instruction and must be rechecked. Draft CTO PR #233, base = V191 Engineer tip, not protected main.
- Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7` unchanged. Running Mac's Config API and proxy may reflect a later installed source unrelated to protected main; do not touch or claim to update it.
- Owner directed genuine Signal Protocol wherever appropriate and an **optional Origin** policy; Origin [draft #154](https://github.com/leorami/project-template/pull/154) remains review-only, not a fleet requirement or live release.
- Only these files are owned by this Engineer scope: `tests/security/v192-libsignal-two-peers.test.mjs`, `tests/security/fixtures/v192-libsignal-peer.mjs`, `.github/workflows/devproxy-v192-libsignal-two-peers.yml`, `docs/architecture/DEVPROXY_V192_LIBSIGNAL_OFFLINE_PROOF.md`, this handoff, and one new V192 completion receipt. No other files, no package.json/lock changes.

## Goal

Prove, independently inspect and return *one real* `@signalapp/libsignal-client` (official library) **offline, synthetically authorized** PQXDH prekey request plus Double Ratchet reply between **two different Node OS processes**, whose identities are distinct and pinned by an out-of-band **synthetic test harness**. All code is **test-only**. Unlike V191 signature-only messages, this actually encrypts and decrypts using native libsignal. It **does not** demonstrate real Trajectory↔Calliope live delivery, identity enrollment, durable sessions, private screenshot transport or permission to heal.

## CTO-first code/test already implemented

1. `tests/security/v192-libsignal-two-peers.test.mjs`: three bounded tests — distinct peer PIDs/keys and typed `PreKey` then `Whisper` encrypted reply; impersonating prekey bundle and wrong receiver rejected; tampered ciphertext, duplicate replay and forbidden encrypted `artifact.export` rejected with all authorization flags false.
2. `tests/security/fixtures/v192-libsignal-peer.mjs`: separate test-process private identity, signed EC and Kyber prekey material, pinned identity store, ratchet state, typed encrypted metadata only. No daemon, browser, real app, network, live inbox, file access or real approvals.
3. CI workflow `devproxy-v192-libsignal-two-peers.yml` installs official package pinned to `0.106.0` under runner temp (not monorepo dependency) and runs Node **24.18.1** because upstream `@signalapp/types@0.3.0` specifies Node >=24.18.1. That **does not** establish support for Dev Proxy's existing Node22 runtime. No production dependency inclusion is allowed without a separate supported runtime/AGPL decision.
4. `docs/architecture/DEVPROXY_V192_LIBSIGNAL_OFFLINE_PROOF.md` distinguishes real libsignal synthetic E2EE from a product rollout, records key lifecycle and licensing barriers.

**Observed RED→GREEN:** initial PR #233 Actions #45212576398 failed when peer fixture was intentionally missing after test-only commit; npm package installed, Node syntax failed `MODULE_NOT_FOUND`. After implementing the peer source, Actions #45212848329 succeeded with **3/3 actual native two-process tests PASS, 0 FAIL, 0 SKIP**. This passing first run used Node22 with upstream `@signalapp/types` EBADENGINE warning; CTO updated **test-only CI** to Node24.18.1 to satisfy upstream declared requirements. Verify final exact-tip CI instead of treating earlier GREEN as final.

## One primary Engineer mini-sprint

1. Before starting, refresh direct authentic project-wide Engineer lifecycle, remote branch/SHA, protected main, V191 returned source/PR #232. Stop without issuing STARTED if another primary is already active. Otherwise launch one genuine primary Cursor session in an isolated source-only checkout from the exact CTO pin and record STARTED in the V192 issue.
2. Independently code-read the real official libsignal APIs and the test/fixture. Ensure two separate OS processes actually hold different identity private keys and ratchet state, and both directions use libsignal's real PQXDH prekey and ratchet messaging, **not custom crypto/mock E2EE**.
3. Evaluate trust boundaries: deliberate test-harness identity pinning is NOT production enrollment; public prekey bundle and ciphertext cross IPC, plaintext remains visible only to the synthetic sender/recipient and deliberately known test harness, and ratchet memory dies at exit. Test-only `artifact.describe` acceptance returns no file/host authority.
4. Independently run exact Node24 syntax/focused tests with package installed only in a disposable external test location; ensure all in-scope failures resolve. Inspect final GitHub Actions original job logs and exact checkout/ref SHA; if Actions checks a synthetic PR merge commit, label it correctly and separately trigger **exact Engineer SHA** workflow_dispatch when available. Record correct actual results with zero skips/hidden errors.
5. If genuine code or test defects exist, add a minimum RED case and repair at root; no unnecessary larger fake messaging server, no secret-bearing fixture, no second canonical app instance or unrelated hardening. Any meaningful issue involving an unreviewed third-party runtime dependency or AGPL source distribution is an explicit **integration blocker**, not authority to embed it in Dev Proxy.
6. Delegation assessment: coupled test-only crypto/identity source likely `NOT_SPAWNED_NOT_BENEFICIAL`. A genuinely independent read-only license/security specialist is optional only with observed provider-native session ID and exact permitted task; no child agent contacts owner and one primary integrates.
7. One new Engineer draft PR against the CTO V192 tip, exact 40-character SHA, consolidated receipt, genuine RETURNED/STOPPED. Required receipt: tested library version and Node version, RED and GREEN observed evidence, real cross-process architecture, exact files, all tests and uncertainty, explicit **NO LIVE ACTIVATION/NO SIGNAL SERVICE**. CTO independently reviews actual returned diff and logs before any next dispatch.

## Hard STOP / follow-on not authorized here

No protected main merge, production deploy, Nginx reload, Docker Compose, API/worker/proxy/ngrok restart, Signal Messenger registration, paid service, real key enrollment, external files/screenshots, owner credentials, GitHub cross-repo mutation, automated repair, private artifact disclosure or changes to the owner's normal running app. Licensing review (AGPL-3.0-only / upstream unsupported outside Signal), durable OS key storage, session persistence, device revocation, offline relay, replay/idempotency, authenticated grants, real Trajectory/Calliope integrations and owner UAT belong to a **new separately authorized, source-grounded assignment**.

## Definition of Done

One source-only, official-libsignal native offline proof, two genuinely distinct test processes, verified GREEN exact final source SHA and fail-closed negative tests, reviewed licensing/runtime caveat, one consolidated Engineer receipt. No live product capability claimed and no owner UAT invited on this test-only assignment.
