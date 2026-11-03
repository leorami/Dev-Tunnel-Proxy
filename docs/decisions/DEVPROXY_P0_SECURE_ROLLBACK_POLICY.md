# DEVPROXY P0 — do not mistake fast legacy rollback for secure recovery

## Actual evidence
- Original accepted product: `d89c962fb31a962a518f331bae458e63708e7e86`.
- P0 live drift inspection: `leorami/Dev-Tunnel-Proxy` Issue #10 comments `6589501959`, `6589507781`, `6589509829`; original secure RC1 cutover Issue #19 `6582064438`.
- Latest genuine primary origin-staging RETURNED: Issue #10 `6595453717`, PR #44 actual full SHA `61708591b8a190587a990f607bfac4f505e692eb`. Private 0700/0600 origins staging created, exact service-scoped Compose `config --quiet` GREEN, synthetic suite 43/43. **Live IDs unchanged; runtime still drifted**.
- One PR #44 issue comment `6595454609` appears to have a mismatched tip SHA; GitHub PR #44 head and branch endpoint resolve to `61708591b8a190587a990f607bfac4f505e692eb`; use that canonical ref.
- Previously tested ~3-second availability rollback restores image class `pre-RC1 bfc92bd8…`, which corresponds to the observed confidentiality regression. That is **NOT A SECURITY-SAFE FALLBACK**; do not silently classify it as secure just because the health check passes.

## CTO-owned source, RED first
- `utils/rc1-secure-rollback-contract.cjs`: pure metadata-only checker. It never runs Docker/network/files, reads credentials, or authorizes release. Only a full-sha256 image/route/config/mount/origin fingerprint match to a previously independently verified secure RC1 baseline, with all confidentiality gates, can return `RC1_SECURITY_MATCH_PLAN_ONLY`. Even then `securitySafe:false`, `productionChangeAuthorized:false`, and `performedActions:false` because code cannot attest live reality.
- `tests/security/rc1-secure-rollback-contract.test.cjs`: 13 test groups including pre-RC1 fallback denial, untrusted baseline, public API bind, password disclosure, artifact access, Origin continuity, **owner admin credential/session continuity**, malformed evidence, redaction and immutable result. A staged **synthetic** ADMIN_PASSWORD is not the owner's existing credential and MUST NOT accidentally replace production login state.
- Original RED: `node --test` exited 1 with module absent. Additional credential/session RED intentionally failed (before the requirements were added), then GREEN. GREEN: exact GitHub source/test blob SHA1 verified against Node 22.16.0 local bytes and native `node --test` **13/13 passed**. Canonical unit hook added on isolated CTO branch, not verified on owner Mac.
- No live/owner files accessed, zero Docker operations, zero new primary assignment, no approved product merge or deployment.

## Release policy (for owner/CTO later, NOT an Engineer-I staging handoff)
The owner has explicitly authorized **private origins staging only**, not production release. Pending separate fresh owner GO, the proposed operator plan must either:
1. Attest a truly confidential fallback (same approved source/image/config/routes/Origin/security boundary, independent private state, quick reversible cutover); or
2. Choose owner-authorized fail-closed ingress isolation / limited outage if secure rollback unavailable; or
3. Explicitly document that the pre-RC1 `bfc92bd8…` image is a last-resort **availability-only fallback that restores the P0 leak risks**, not a default recovery mechanism.

The 120-second rollback drill measures **availability**. It is not evidence of confidential or uncompromised operations. Do not auto-rollback to the vulnerable image on a simple health failure. A private owner GO must identify the security versus availability tradeoff, never silently expand prior authority. No production changes, firewall/LaunchAgent modifications, secret rotation, direct admin probes, or old insecure switcher are authorized by this CTO branch.
