# Single Engineer-I handoff — source-built two-service RC2 release candidate

## Source / lineage gate

Start only after a **fresh** GitHub lifecycle, primary Engineer-I RETURNED
receipt and exact full SHA check. The last verified primary returned PR #79 at
`engineer/devproxy-rc2-controlled-release-20261104@660fab4366f7b4c8f8a3c523187202347c1f41dd`:
`NO-GO_REPAIR_CANDIDATE_GATES_INCOMPLETE / NOT_DEPLOYED`. Preserve this
return, the 52 management-safety tests and source, transaction-safe
`apps/install` and `apps/create-route`, all earlier accepted work, and the
live secure RC1. If the primary is already STARTED on a newer assignment,
do not interrupt or duplicate it. There is one primary Engineer-I.

## Goal

Convert the hand-crafted private dry-run configuration into a reproducible,
source-pinned, deployable **two-service replacement candidate**, close the
missing secure signed-spool/secret mount parity, and prove the outstanding
Mac-host worker, nginx image, and functional continuity gates. The owner's
2026-11-04 production GO for **existing proxy + config API only** remains
available for one bounded cutover if every safety gate passes; it is not a
requirement to request another GO. Release must not be mislabeled based on
local fixtures or a green `docker compose config`.

## CTO implementation complete — REUSE, DO NOT REWRITE

- `utils/rc2-production-compose-candidate.cjs`: strict standalone
  `docker compose` candidate generator from digest-pinned custom images,
  private approved paths and non-root UID/GID. Exactly two services, no
  Docker socket, root API, ngrok service, bridge change, or sidecar.
- `scripts/rc2-render-private-compose-candidate.cjs`: fail-closed owner-private
  manifest to 0600 no-clobber Compose JSON renderer; no Docker/network.
- `utils/rc2-readonly-production-preflight.cjs`: extends current hardened
  postcutover preflight for **paired** RW private activation spool and RO
  activation secret, both outside proxy-exposed and normal API data sources.
  Four original API data dirs remain RW; source and owner .env remain RO.
- Three TDD test suites and `docs/DEVPROXY_RC2_PRIVATE_TWO_SERVICE_CANDIDATE.md`:
  local 55/55 tests PASS, not Mac source/runtime proof.

## One bounded engineering operation

1. Integrate and review the exact CTO commits on an isolated branch based on
   latest RETURNED PR #79, preserving all new Engineer source and receipts.
   Run `./smart-build.sh test:unit` and focused tests on the owner Mac.
2. Use the already confirmed private Mac UID `504:20` **only if** it still
   maps to the actual owner filesystem and can read owner 0600 admin session,
   private HMAC secret and `.env`, and write only the required data binds.
   Create an owner-private source-exact stage; render the standalone two-service
   candidate with CTO script. Never publish private resolved paths or secrets.
3. Verify **actual** `docker compose -f <PRIVATE_RENDERED_JSON> config --quiet`,
   full resolved source bindings, independently pinned images and nginx
   Brotli/mime/include set. Do NOT overlay old insecure Compose: it still
   has root, RW `/app`, and a Docker socket. Prove API nonroot startup and
   read-only source; all four route data binds RW; separate RW signed spool +
   read-only secret, private from proxy. Test actual host/API two-process
   protocol with proper Mac↔Docker UID permissions, and an installed,
   least-privileged fixed-command host worker ONLY after its pinned
   permissions/identity/safety have been independently source-reviewed.
4. Preserve owner data: backup and verify recovery for existing secure images,
   17 routes, admin session 0600, credentials and trusted origins. Confirm
   no change to ngrok, Mac bridge, unrelated services or protected master.
   Restore unsettled AI/scan feature scope through audited transactions or
   clearly return a remaining function-degraded NO-GO; do not claim 503 parity.
5. If all pre-cutover gates are GREEN, execute the **one** already-authorized
   controlled proxy/API cutover with an actual postcutover SHA/image/container
   readback, active 17 routes, management write+rollback, session, auth,
   trusted Origin and Origin's five runtime fields. A postcutover check cannot
   be marked PASS before runtime exists, but its feasibility must be established
   before cutover. Fail closed; no insecure image fallback or hidden sidecars.
6. Return ONE redacted STARTED->VERIFYING->RETURNED GitHub receipt at final
   full 40-hex SHA. Include source/digest pins, exact tests, private-stage
   approval evidence (without contents), before/after images/container IDs,
   route/session/state continuity, host worker + spool trust proof, outstanding
   functions and all five Origin runtime checks. If any blocker persists,
   identify precise code, what failed, and whether no production mutation
   occurred. No owner UAT until independent CTO review of code/runtime; no
   UI files are part of this candidate.

## Non-negotiable exclusions

No protected master merge, ngrok/public tunnel change, Mac bridge change,
credential rotation, additional app instance, privileged Docker socket
sidecar, spontaneous host worker installation, insecure image downgrade,
manual removal of replay fences, or owner state loss. No CLI Docker commands
from ChatGPT cloud; actual Mac operations belong to the authorized Engineer.
