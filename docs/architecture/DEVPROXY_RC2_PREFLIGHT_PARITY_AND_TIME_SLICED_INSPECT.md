# Dev Proxy RC2: do not mistake a clean Docker inspect for functional parity

## Pinned source and authority

- Owner provided a fresh, scoped production GO in this chat (2026-11-04). This is NOT evidence that a release was executed.
- Latest verified Engineer-I return before this independent CTO work: PR #76, full SHA `8859fca6af37f4b4796ff556e09d616975af5b8b` (`NONLIVE`, not deployed).
- Prior CTO read-only preflight was in PR #77, `ba36740c5be2430c0ffa40884087ff54cd52fd10`, module Git blob `6768209c6aa3b06244de1858d50ca9d52c89219a`.

## Reproduced defect 1: accidentally disabling the application

The previous preflight accepted `readOnly:true` for any of these four *mandatory data* mounts, as long as the operator supplied a matching pin:

- `/app/apps`
- `/app/overrides`
- `/app/build/sites-enabled`
- `/app/.artifacts`

That is not a safe RC2 candidate: the approved API writes routes, overrides, regenerated nginx bundle and private sessions/diagnostics to those paths. A read-only mount would break real management functionality and could have been reported as a reviewed release candidate.

Correction: **the pin itself is rejected** unless all four are explicitly writable. The parent `/app` source and nested `/app/.env` remain read-only; unexpected writable mounts continue to be rejected. This is an internal source contract; it never changes owner state.

## Reproduced defect 2: incoherent time-sliced Docker evidence

The previous preflight gathered seven independent `docker inspect` fields per container and returned `EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY` from only one pass. The container or mounts can drift after one read or between fields; a good first pass is not enough. Two complete sequential rounds are now required; any unavailable, drifting or mismatched property blocks. This is *still not an atomic snapshot or runtime attestation*. It requires a real operator to corroborate live inode/mount, source SHA and actual owner Mac state.

## Test evidence (only local fixture)

- Baseline original PR #77 preflight: 13/13 tests passed.
- Four new RED-first regressions: 4/4 failed before fixes, as intended (read-only route data, one-round evidence, mount drift, running-state drift).
- Fixed code + original suite: 17/17 tests passed on container Node 22.16.0. No Mac Docker was called; no API or nginx service changed.

## Additional code-read release blockers not hidden by this fix

From pinned product source `utils/proxyConfigAPI.js` at the Engineer-I return:

1. `getRouteMutationService()` still selects the older **Unix-socket** reload client from `DEVPROXY_RELOAD_SOCKET`; it is not yet the authenticated v12/v13 private-file settlement in the real API. The test-owned v12/v13 composition is not a substitute for this live wiring.
2. The `/ai/` handlers still include direct Docker subprocesses (`restart`, `ps`, `run`, `exec`) and direct, nontransactional override/nginx configuration repair paths. Removing container Docker access without addressing these paths could silently disable features or leave unsafe side effects. Review each endpoint's functional contract; either safely mediate it or explicitly mark it unavailable before an owner production UAT. Do not silently redefine functionality.
3. The previous `rc1-api-only-postcheck.cjs` expected an explicitly writable `/app/config` target, but current secure route management sets `allowConfigEdit:false`. Whether `/app/config` is writable must be decided based on the **actual revised product code** and OS-level writer confinement; do not auto-open it simply to satisfy earlier tests.
4. Mac private bind Source identities, host-worker ACL/UID, image `mime.types`/Brotli module provenance, backup/recovery and all five Origin runtime gates remain unverified. No deployment may pass on this source-only evidence.

## What Engineer-I must do next

Source-first review and integrate this correction into the **existing active RC2 release assignment** without creating another app stack or redoing completed work. Perform one genuine read-only Mac preflight with private expected full IDs, image digests and mount Sources not logged or committed. Resolve the **real API-v13-spool** and **legacy `/ai/` mutation** gaps before live cutover. Run the canonical smart script, check source/image parity, the 17 routes and session continuity, and return an evidence-backed GO/NO-GO. Do not touch ngrok/bridge, protected master or credentials. If any material security or functional gate fails, do not mutate the running proxy/API.

No UI source changed in this CTO work; the required independent CTO pixel review applies to future UI changes before owner UAT.
