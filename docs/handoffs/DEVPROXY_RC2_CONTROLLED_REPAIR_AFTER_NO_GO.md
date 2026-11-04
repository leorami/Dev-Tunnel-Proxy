# Engineer-I one-primary handoff — RC2 actual controlled repair, not endless preflight rerun

**Start from genuine RETURNED Engineer-I PR #79 at**
`7e1329cc6d0456758bb54dda7c2404cbfa50ee98`; preserve its two-stage
return and all previous CTO and Engineer source/evidence. Fresh-check lifecycle,
SHA and existing assignment before making any new branch or changing live state.
This CTO handoff is code-first and additive, and may be executed only once its
full branch SHA and all files are independently verified on GitHub.

## Goal

Fix source-proven environment bypasses and unsafe privileged legacy API routes;
then convert the observed Mac drift into one controlled, source-pinned production
REPAIR candidate under the owner's fresh GO. Production result must be either
real verified functionality with no state loss, or a concrete NO-GO with exact
failing gate and remaining implementation. No extra app or repeated synthetic
plan-only sprint just to reconfirm the already measured live drift.

## CTO complete source to integrate, not recreate

- `utils/rc2-inline-docker-policy.cjs` and
  `utils/rc2-management-safety-policy.cjs` — pure fail-closed security logic.
- `tests/security/rc2-management-safety-policy.test.cjs` — 52 RED-first regressions.
- `utils/calliopeHealing.js` and `utils/proxyConfigAPI.js` — shared policy
  integrated at actual privileged call site / authenticated management boundary.
- Architecture evidence `docs/architecture/DEVPROXY_RC2_UNSETTLED_MANAGEMENT_BYPASS.md`.

## One bounded implementation/verification gate

1. Read PR #79 latest evidence and source, preserve all returned work and the
   already deployed secure RC1. Test the CTO patch and canonical
   `./smart-build.sh test:unit` on the real Mac. Independent source tests are
   not evidence that a second runtime or daemon is operating.
2. Confirm the actual owner Mac's BEFORE state read-only (existing RC1 17
   routes, admin session, auth origins, sources, proxy/API/ngrok IDs). **Do not
   apply an after-state security manifest to the before-state and stop at the
   three previously known mismatches.** Record those as repair work items.
3. Prepare an owner-private source-exact, independently examined production
   candidate: `/app:ro`, `/.env:ro`, nonroot API with proven read/write
   permissions for exactly apps/overrides/artifacts/generated sites, existing
   session 0600 readable, trusted origins and auth unchanged, no container
   Docker socket, proxy management ports loopback and the original ngrok
   network intact. Validate nested OCI mountpoints and nginx mime.types,
   Brotli modules and loaded include closure. Authorize/install a host-only
   fixed action worker only after reviewed UID/ACL, pin and activation proof.
   Do not launch new application instances to inspect pixels; no UI in scope.
4. Prove confidential backup **and read-only recovery plan** for the current
   owner image, config, routes, sessions and existing secure proxy. Use actual
   dry-run Compose/OCI on authorized private staging only; do not touch owner
   data before an independently auditable green candidate.
5. Treat the newly explicit 503 on unsafe legacy AI and app-install endpoints
   as a functional gap, not success. Restore those through transaction-safe
   APIs with tests, or return exact degraded-scope NO-GO without silently
   eliminating owner functionality. Safe read-only endpoints must continue.
6. If ALL gates are independently GREEN, use only the fresh, existing owner
   GO for ONE controlled release of proxy and proxy-config-api; preserve
   ngrok, bridge, 17 routes, admin/session, all unrelated services and protected
   master; fail closed, never roll back to a less secure image. After change,
   run the AFTER-state exact preflight plus real route management, auth/session,
   Origins and five Origin runtime checks. Return a single STARTED->VERIFYING->
   RETURNED redacted GitHub receipt pinned to actual full SHA, including
   installed service identities, tests, backups and real deployment result.
7. Any UNKNOWN or failed security/data/feature gate before a live mutation is
   **NO-GO** with a specific code target. No owner UAT unless independently
   reviewed code plus actual runtime; if UI ever changes CTO must inspect the
   SHA-bound screenshots before owner UAT.

## Excluded

No protected master merge, public tunnel/ngrok change, Mac bridge change,
credential rotation, extra app instance, privileged sidecar Docker socket,
insecure image downgrade, automatic replay-fence reset or fake deployed claim.
GitHub source publication does not start Cursor or execute any Docker command.
