# Dev Proxy — v6 source-first candidate binding and Mac host transport

## Exact base and authority

Read this handoff at the full 40-character SHA from the ONE dispatch line. Repo `leorami/Dev-Tunnel-Proxy`; isolated CTO source branch is rooted at actual newest accepted Engineer-I RETURNED PR #61 SHA `1f2dbb78e8c045c008ace441e414aed495cbcdc1` (`BLOCKED_HOST_TRANSPORT_CAPABILITY / NOT_DEPLOYED`). Do not repeat PR #59 disposable API functional tests or PR #61 read-only host-socket investigation. The existing v5 API remains uncommitted to production and `allowConfigEdit:false` remains essential.

## CTO-owned contracts and tests already complete

Read four `utils/rc1-*` source modules and four `tests/security/rc1-*` test suites plus `docs/DEVPROXY_P0_BIND_MOUNT_CONTENT_BOUND_IPC.md`. Run `node --test tests/security/rc1-route-candidate-manifest.test.cjs tests/security/rc1-content-bound-activation-request.test.cjs tests/security/rc1-activation-spool.test.cjs tests/security/rc1-fixed-activation-host-worker.test.cjs` and canonical `./smart-build.sh test:unit` where authorized. These 43 tests establish ONLY synthetic content binding, fixed signed transport and fail-closed host-worker sequence. They do not establish that Mac host and Linux API can safely access the same queue, or that a worker is installed.

## One primary Engineer-I remaining scope, source-only unless expressly authorized

**Goal:** confirm the actual EXISTING owner Mac data-bind layout and Docker Desktop filesystem transport suitability without privileged new services; integrate v6 modules into one coherent *nonlive* code candidate only after source review, preserving the prior v5 functionality and live state. Do not run another copy of the application.

1. FIRST verify newest Engineer-I lifecycle and any active assignment and full branch/SHA; preserve active work and its frozen scope. Exact CTO source readback; note this handoff is independent of PR #61 rather than a replacement for its returned evidence.
2. Code-read the four new CTO modules and source-mapped v5 API. Evaluate shared bind-mounted **file** queue against the actual Mac host/VM boundary *read-only first*. Existing owner `.artifacts` is PRIVATE state; do not create new paths, test messages or secrets there under this handoff. A private test-owned bind path may be used only under an already applicable, explicitly recorded runtime test authorization. Never read owner route bodies or session/env data to verify transport.
3. No new sidecar, Docker socket in any container, network listener, host background process, alternate app/stack, live nginx reload or production source/mount change. If a one-shot, non-application Mac/Docker utility can establish filesystem behavior within standing permissions, document exact test-owned isolation and use only canonical project tooling. Otherwise return `BLOCKED_TEST_BIND_AUTHORITY` or the observed filesystem blocker; do not reclassify it as full release failure when synthetic v6 contract is green.
4. Preserve fail-closed security-bound config editing: the v6 candidate digest binds all security-sensitive nginx config plus route bundle, but the live v5 API remains `allowConfigEdit:false`. Do not silently switch runtime from Unix socket to shared file spool or set any new environment flag; future wiring requires new code review, real host attestation and owner authorization to operate the privileged worker.
5. Test Origin five actual runtime fields separately; unknown != PASS. An actual owner-facing UI journey is NOT in scope and no owner UAT invitation or screenshot claim is warranted for source-only backend feasibility.
6. Return ONE consolidated GitHub receipt (STARTED -> VERIFYING -> RETURNED or precise BLOCKED) with full SHA, actual changed source, focused+canonical results, private bind feasibility evidence or exactly why not runnable, and a decision-ready minimum owner permission only if unavoidable. Integration owner is one primary Cursor Engineer; no specialists unless useful, actually spawned and independently verifiable.

## STOP and completion boundaries

No owner-only privilege expansion, live service change, new executable host worker, credentials/key, production compose change, changed owner `.artifacts`, public exposure, protected merge, or deployment. A safe bounded v6 source candidate may be delivered as `SOURCE_CONTENT_BINDING_VERIFIED / NOT_DEPLOYED`; host transport remains separately `MAC_SHARED_BIND_PENDING` until real test-owned two-sided validation. Original RC1 owner GO (Issue #10 comment `6595948888`) was consumed and cannot be reused.
