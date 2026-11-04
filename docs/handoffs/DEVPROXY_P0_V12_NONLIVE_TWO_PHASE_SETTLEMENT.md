# Dev Proxy v12 - one primary Engineer-I handoff (nonlive)

Base: actually RETURNED Engineer-I PR #73 at `f07d5e2e139adebf5af9fd3075430b2502db690d`. Review current primary lifecycle and complete SHA before work; preserve any active assignment.

CTO already implemented the following code. Reuse it; do not rewrite:
- `utils/rc1-two-phase-host-settlement.cjs`
- `utils/rc1-v12-nonlive-settlement-activation.cjs`
- `tests/security/rc1-two-phase-host-settlement.test.cjs` (17 tests)
- `tests/security/rc1-v12-nonlive-settlement-route-integration.test.cjs` (5 tests)

Goal: a single, test-owned, **nonlive** integration of the signed host-prepared, API-ACK and final-receipt protocol with the existing authenticated private spool. Retain the earlier v11 identity and mount checks. Prove crash quarantine, replay rejection, changed content before/after ACK, no false positive completion, and preservation of all 17 synthetic routes. Use only injected fake host callbacks and fixture state.

Run focused suites and canonical `./smart-build.sh test:unit`; report actual Mac results, SHA, changed files and the five Origin runtime fields. Unknown is not PASS. Return one consolidated receipt with label `NONLIVE_TWO_PHASE_SETTLEMENT_COMPOSED / NOT_DEPLOYED` only if true; otherwise report the precise blocker.

No alternate application, real host execution, new service, owner data, credentials, protected merge, production change or owner UAT is part of this scope. This protocol does not establish OS-level writer confinement, a real trusted host worker or runtime attestation. For full limitations read `docs/architecture/DEVPROXY_P0_V12_DURABLE_TWO_PHASE_SETTLEMENT.md`. No UI files are in scope.