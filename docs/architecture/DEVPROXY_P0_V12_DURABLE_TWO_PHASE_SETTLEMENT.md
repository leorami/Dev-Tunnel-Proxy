# Dev Proxy P0 - v12 nonlive durable two-phase host/API settlement

## Concrete defect and smallest corrective contract

Engineer-I returned v11 at PR #73, `f07d5e2e139adebf5af9fd3075430b2502db690d`, with read-only Mac mount observations and 339/339 Mac fixture tests. Production remains NOT_DEPLOYED. Earlier v7/v8 source clears the host-operation crash fence **before** the API's final three-file candidate postcheck and journal settlement. Two different signed host operations can be serialized within v7, but the gap between fence release and outer API success is real; a second cooperating host operation can start in that interval. A hostile uncooperative filesystem writer can also mutate configuration, which cannot be fixed by adding more HMACs alone.

The CTO v12 implementation **does not** silently replace v7 or v8. It supplies the missing host/API split-phase settlement primitive and an isolated in-process v5 route transaction adapter. The host issues a **prepared** (not success) receipt while a durable global marker remains. The API independently rehashes the approved fixed three-file candidate and signs an ACK bound to the prepared challenge. The host independently rechecks the candidate, trusted fixed-action callback and active route **again** before releasing its marker and signing a distinct final receipt. The API requires a valid final signature and postcheck before returning success. No ACK, crash, replay, malformed signature, insecure marker, changed content or uncertain host callback => durable quarantine or explicit indeterminate status; no automatic recovery/reset.

Source:
- `utils/rc1-two-phase-host-settlement.cjs`: real durable host-only marker, persistent replay reservation, HMAC prepared/ACK/final protocol, pinned 0600 markers, fsync, nonauthorizing booleans.
- `utils/rc1-v12-nonlive-settlement-activation.cjs`: working production-shaped `activation.activate({expectedBundleSha256})` tested against existing `createProductionRouteMutationService` and real test-owned files. Uses *in-process simulated callbacks*, never Mac Docker or an installed host worker.
- `tests/security/rc1-two-phase-host-settlement.test.cjs`: 17 RED-first tests, covering missing-module RED, concurrency across instances, replay, tampering before/after signed ACK, crash persistence, invalid MAC, symlink/no-clobber, 0700/0600, positive final signature.
- `tests/security/rc1-v12-nonlive-settlement-route-integration.test.cjs`: 5 true source-level synthetic v5 transaction tests preserving 17 fixture app routes, successful settlement, 503 on indeterminate, mutation before/after ACK rejection, config-edit still blocked.

## Strict limits / no claimed release readiness

1. The in-process callback **does not prove nginx tested/reloaded**, a real Mac host-process exists, owner authorization, or any real runtime loaded-file/mount attestation. Positive fixture evidence always `NOT_RUNTIME_ATTESTED` and both owner authorization and deployed fields remain false.
2. New primitive is **not wired** into the live API, existing file spool, real Mac Docker, or a long-lived service; doing so needs a separately verified and authorized operational transport. The standalone marker controls only cooperating callers that use it.
3. This protocol reduces *cooperating* post-fence / outer-settle overlap, but **does not close the malicious external writer race** between the final filesystem check and marker release, nor after the release. Real solution also requires a locked immutable content snapshot or OS-enforced writer confinement throughout the operation and actual nginx loaded-file provenance. Never describe `HOST_SETTLEMENT_CLOSED` as producer/owner GO.
4. v11 exact private mount Source allowlist is not yet approved on owner Mac; `mime.types`, image-supplied modules and rootfs provenance remain unverified. Existing `/app` live API RW, host worker absent, v6 spool unwired and Original issue #10 production GO consumed. Origin's five runtime fields remain UNKNOWN.
5. No Docker, root privilege, network socket, sidecar, new process or owner-data files touched by the CTO here. No UI touched or CTO pixel approval claimed. Any future UI path must return source-bound actual screenshots for CTO personal inspection before owner UAT.

## Test truth

CTO native Node v22.16.0, temp-owned test data only. The RED phase is preserved at `receipts/cycle1_RED.tap`; the GREEN passes for v12 and combined legacy suite are preserved in the conversation archive. This is more consequential than a plan-only handoff: the *implementation* and *tests* are source-first on the isolated CTO branch.
