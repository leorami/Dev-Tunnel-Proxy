# Dev Proxy RC2 — CTO production-preflight hardening handoff

Owner fresh GO is scoped to controlled existing `proxy` + `proxy-config-api` only; fail closed if gates fail. This document records code to integrate into the **one current** Engineer-I release assignment, not a new agent run. Preserve Engineer-I returned PR #76 `8859fca6af37f4b4796ff556e09d616975af5b8b` and existing CTO PR #77 and its handoff.

## Code already written (do not reimplement)

- `utils/rc2-readonly-production-preflight.cjs`: strict four writable data mounts + two independent 14-field inspect passes. Always source evidence for review, never GO.
- `tests/security/rc2-readonly-production-preflight.test.cjs`: four RED-first regressions and 13 preserved tests; 17/17 locally green.
- `docs/architecture/DEVPROXY_RC2_PREFLIGHT_PARITY_AND_TIME_SLICED_INSPECT.md`: source-proven release gaps and boundaries.

## Next narrowly scoped Engineer work

Confirm latest real lifecycle, branch and SHA before integration. From preserved PR #76, import this tested preflight and its tests into the current **source-exact production candidate**; do not create fake Docker/test-only runtime as a production substitute. Run focused Node tests and `./smart-build.sh test:unit` on the Mac, report actual command exits. Check actual API code uses authenticated v13 file spool rather than legacy Unix socket and explicitly handle the unmediated `/ai/` Docker/self-heal operations. Maintain exact expected source RO, `.env` RO, four required data mounts RW, no unapproved writable code, non-root API UID, no docker.sock, trusted origin/session/route continuity. Require all five Origin fields from real runtime. Keep owner private Sources and credentials out of logs and GitHub.

Stop without live mutation on any unresolved blocker; if all gates pass, execute only the owner-approved bounded `proxy` and `proxy-config-api` release and provide one SHA-pinned source-backed return with real image/container IDs and redacted evidence. Do not alter ngrok, bridge, unrelated services, protected master, or restart insecure images. No UI owner UAT without CTO source/visual approval if UI changes.
