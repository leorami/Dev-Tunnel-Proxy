# DEVPROXY P0 — CTO v5 content-bound route activation (source-only handoff)

## Verified engineer lifecycle (not release acceptance)

Repository: `leorami/Dev-Tunnel-Proxy` (PUBLIC; never place Mac owner secrets or private paths in GitHub).

- PR #55: Engineer-I **RETURNED** at `engineer/devproxy-p0-ro-code-rw-route-parity-20261103@beb845e84a9a82a5dea5b5329a97497422011f5e`; CTO reviewed. Release **BLOCKED / NOT DEPLOYED** due route install/promote HTTP 422 after persistent writes.
- **New PR #56**: Engineer-I **STARTED -> BLOCKED -> RETURNED** at `engineer/devproxy-p0-cto-v4-integration-20261103@17b5053d6dd3803da57711730ed3f015835fad99`, two additive source-free receipt/evidence files, confirmed inability to obtain CTO's 104-test ZIP on GitHub or owner Mac. Correct classification: `CTO_V4_INTEGRATION_BLOCKED_SOURCE_UNAVAILABLE / NOT_DEPLOYED`. This is a transport defect, **not** an active Engineer assignment or untested code to repair.
- Parent approved product: `d89c962fb31a962a518f331bae458e63708e7e86`; `utils/proxyConfigAPI.js` exact approved Git blob `2eb02328ab892add8a07648890c0047daafa3fc2` (queried via authenticated GitHub connector). Protected master `62a4d7babae986ade1feb0fd6dbe7dd32532523a` unchanged.
- One-time owner production restoration authorization Issue #10 comment `6595948888` **CONSUMED**. Never use it for any further live action.

## CTO CODE ALREADY DONE — USE IT, DON'T REIMPLEMENT

The attached ZIP is the complete in-container CTO source. This package is **NOT committed to GitHub** and is **NOT automatically available to Cursor**. Do not fake a GitHub SHA or claim the primary has started. Only dispatch when the package bytes are actually accessible in an isolated authorized CTO branch. It must then be integrated with source-exact tests and **no production mutation**.

Five RED-first work/check cycles, native Node v22.16.0, all code/test JS syntax checks PASS. Cumulative synthetic/fixture test suite `node --test tests/*.test.cjs` **125/125 PASS, 0 FAIL**; final TAP `cycle5-full.tap`.

1. **Host crash quarantine:** owner-private 0600 fsynced `nginx-operation-inflight` marker is written *before* external commands. Verified reload clears it; any crash, uncertain reload or hung callback leaves it; new requests fail closed across broker restarts until explicit operator recovery. Tests in `host-crash-quarantine-v5.test.cjs`.
2. **Cryptographic intent binding:** route transaction hashes the generated bundle SHA-256 and sends it in HMAC-v1 signed request; broker requires exact signed SHA-256, verifies candidate bytes **before nginx test and after reload**, supplies digest to active-route verifier, and signs response against the same digest. Missing/wrong digest cannot trigger host Docker. Tests in `content-bound-reload-v5.test.cjs`.
3. **Host file verification:** `host-bundle-digest-verifier.cjs` reads only the fixed, pre-approved `build/sites-enabled/apps.generated.conf` under an attested host root, using `O_NOFOLLOW` and regular-file/inode/size checks, rejects symlink parents, hardlinks, changed content and aborted operations; no route contents logged. Tests in `host-bundle-digest-v5.test.cjs`.
4. **Route-data crash quarantine:** 0600 durable `.artifacts/route-mutation-inflight` marker written before app/override/config/bundle mutation. Known validation rejection rolls back data and clears marker. Indeterminate reload/worker state retains marker and prevents subsequent mutations, even after restart. No silently successful HTTP 200 for partial state. Tests in `route-durable-quarantine-v5.test.cjs`.
5. **Host composition end-to-end:** `fixed-owner-activation-host.cjs` composes HMAC Unix socket, approved exact 64-character Docker container/image identity, bounded real `execFile` adapter, fixed owner bundle digest verification and owner-provided active-route proof. Four integrated tests use real synthetic files, socket, HMAC and scoped Docker argv **with fake execFile only**, prove success and fail-closed quarantine; no real Docker executed.

## Next single-primary assignment — ONLY after source is present on a pinned CTO branch

**Goal:** Consume the CTO-authored v5 modules and source-exact approved API codemod. Verify meaningful end-to-end real application behavior, not rebuild architecture from scratch.

**Contract gate:** Recheck newest actual Engineer-I lifecycle, parent PR #54/#55/#56 and full SHA; check authorized Git branch/complete SHA and exact module Git blob hashes against this ZIP SHA256SUMS; if missing or mismatched, RETURN `BLOCKED_SOURCE_UNAVAILABLE` with no reimplementation. Keep one primary, no unnecessary specialists; no production, no protected merge, no owner .env or session reads/writes, no ngrok/bridge or host socket mount in web API. Private Unix socket mediates **only** nginx validate/reload with HMAC, exact container/image attestation, and durable fail-close markers.

**Engineer steps remaining:**

1. Validate the approved product `utils/proxyConfigAPI.js` actual Git blob and all source transformation anchors. Run `tools/approved-api-route-activation-codemod.cjs` on an isolated disposable copy only; compile its **full resulting 134KB+ application** with `node --check`. Compare the original vs transformed diff: only intentionally gated mutation endpoints change. Preserve admin sessions, trusted-origin CSRF, access checks, 17 real route configs and stable owner state.
2. Wire `createFixedOwnerActivationHost` on a **host-only** trusted Mac process using a truly private host path and secret-provisioning channel, exact approved proxy image and full live container ID **only in a disposable test**, Mac Docker Desktop exact `execFile` resolution and bounded cancellation; never pass arbitrary Docker argv or mount `/var/run/docker.sock` into the API.
3. Wire `createProductionRouteMutationService` into the protected API for install, promote, config GET/POST, regenerate and verified cleanup/rename handling. The existing source codemod currently **fails closed** on destructive cleanup and rename; restore those behaviors only with explicit transactional parity tests. Do not mistake “regenerate HTTP 200” for an activated nginx worker.
4. Run canonical `./smart-build.sh test:unit` and focused 125 tests on the owner Mac **without touching live services**. In a private disposable Docker project, prove RO code+dotenv, RW-only intentionally authorized route/data, absent Docker socket, app+override+config mutations, bundle+two diagnostic sidecars, signed bundle digest, nginx `-t`, verified reload and actual active route, correct HTTP outcomes and rollback on failed stages. Include auth/origin/session regression checks.
5. Return one consolidated source-exact STARTED → VERIFYING → RETURNED receipt with exact branch/full SHA, changed source/test paths, macOS Node/Docker versions, test commands and unredacted private values **not** published. Label `DISPOSABLE_ROUTE_ACTIVATION_VERIFIED / NOT_DEPLOYED` only if genuinely passing; otherwise precise `BLOCKED / NOT_DEPLOYED`. Stop for CTO committed-diff review and separate owner GO before any second live service change.

## Explicitly not proven by CTO synthetic tests

Real Mac Docker Desktop connectivity, permissions of private owner paths, actual nginx worker effective-route reload, transaction atomicity under hostile writers not honoring locks, API CSRF/auth route parity in the final transformed full source, and durable cross-system rollback after a host crash. All remain verification gates. No production authorization or release readiness is implied by passing tests.
