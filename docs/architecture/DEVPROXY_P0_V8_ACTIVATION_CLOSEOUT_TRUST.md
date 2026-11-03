# Dev Proxy P0 v8 — Source-exact API-to-host signed spool and closeout safety

**Status:** CTO-authored, RED-first, nonlive candidate; NOT deployed, no owner GO, no new application instance.

## Ground truth

- Original approved product is `d89c962fb31a962a518f331bae458e63708e7e86`, RC1 image `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1`.
- Latest genuinely completed primary at this work boundary: Engineer-I PR #65 `adba833bb35ac6981b34b8b7f4754ad304d9616f`: v7 guarded host worker with 17/17 + v6 43/43 + integration 9/9 reported, NOT deployed. Initial receipt commit `35664aa...` is not branch HEAD. No live API spool wiring, existing app `/app` still RW, 17 real routes and prior consumed owner GO remain unchanged.
- Existing v5 route transaction calls `activation.activate({expectedBundleSha256})` AFTER writing the route and regenerating the bundle. v6 source-only spool requires `expectedCandidateSha256` covering three files: generated routes, `config/default.production.conf` and `config/nginx.production.conf`. v7 source-only guarded host worker may publish a signed reply.

## CTO code, not a speculative instruction

1. `utils/rc1-v8-spool-activation-adapter.cjs` provides the ACTUAL v5 `.activate()` interface backed by the v6 digest-bound file spool. It compares transaction bundle SHA against the v6 candidate manifest BEFORE signing, submits one request, verifies a signed reply through the trusted v6 client, re-hashes the three inputs before reporting a valid result, and uses a single monotonic deadline across ALL file/queue operations. Once `submit()` begins, any exception/timeout/abort is `HOST_OPERATION_INDETERMINATE`: request publication may already have occurred. Never retry/delete automatically. All outcomes remain `productionChangeAuthorized:false`, `liveAttested:false`.
2. `utils/rc1-v7-guarded-host-worker-nonlive.cjs` fixes two actual source-reviewed unsafe closeout cases in returned PR #65: (a) a `NGINX_VALIDATION_FAILED` status was returned even if the crash fence had been replaced or deletion failed; (b) an nginx candidate could mutate during active-route verification and the fence was cleared before the original outer spool's post-verification check. Both now fail closed. A remaining theoretical gap is candidate mutation after the fence clears but before outer spool post-check: real actor isolation and a single integrity-preserving transaction across signing are still required before live GO. This source patch does NOT claim to solve that across-process race or install a host worker.
3. RED-first test suites in `tests/security/rc1-v8-*` cover the changed-file and replaced-marker counterexamples, real v5 file transaction → real v6 HMAC spool → fake host callback → signed result path, validation rollback of route/bundle/sidecars, retained v5 journal after response uncertainty, forged reply denial, global deadlines, abort, and strict config-edit denial. Previous v6 tests are preserved unchanged.

## Prohibited shortcuts

Do not wire into the actual API before the owner has authorized host-worker, private spool placement and runtime changes. Do not mount Docker socket on API or sidecar; do not use a host process without a genuine trusted host identity/privilege gate; do not enable `DEVPROXY_ALLOW_CONFIG_EDIT`; do not change original `.env`, sessions, `config/default.production.conf`, 17 route bodies, ngrok, bridge or existing Docker containers; do not claim single canonical running app UAT from synthetic fixtures; do not merge protected master or reuse Issue #10 GO `6595948888`.

## Evidence and next remaining integration

CTO local Node22.16 tests: v6 security 43/43, v8 security/integration 27/27, **70/70** PASS together, 0 skipped/failed. Independent initial RED produced module not found, later additional RED found three actual v7 guard defects and indefinite submit/read operation. Full canonical `./smart-build.sh test:unit` on owner Mac is NOT run by CTO; owner Mac Docker and native source-to-runtime parity are NOT proven by this branch. All human/UI visual gates remain separate; no UI paths touched.

Next primary integrates these CTO modules into the existing source-only nonlive composition, runs v7 17 + v6 43 + Engineer v7 9 + v8 27 plus canonical unit tests, and returns one full-SHA classified receipt. The exact future owner authority request should cover one fixed privileged Mac worker and private API-to-host file spool, but **no production worker install** follows from source acceptance. Any real owner app UAT must use ONE existing canonical runtime and CTO personally observed source-verified pixels for UI changes.
