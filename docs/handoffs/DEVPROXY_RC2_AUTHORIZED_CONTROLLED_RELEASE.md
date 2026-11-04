# Dev Proxy RC2 -- controlled production release execution contract

## Current verified lineage / authority

Repository: leorami/Dev-Tunnel-Proxy.
Primary Engineer-I genuinely RETURNED PR #75 at
`773bcc345de50e4b43ecde5c38f4fa02685f0891`. It is a NONLIVE v12
composition with a fake host Docker adapter, not a deployable production worker.
Owner gave a fresh production approval in the 2026-11-04 project chat:
"production approved". This permits a controlled production release within
Dev Proxy, subject to the established fail-closed security and state-protection
requirements. The previous RC1 GO was consumed and is not being reused.

This CTO branch starts exactly at returned PR #75 and includes:
- v13 durable final signed receipt ordering / history-only recovery, plus
  crash-kill tests and architecture notes;
- a true read-only Docker Desktop release preflight of pinned proxy and API
  IDs, image digests, full mount Sources+Destinations+RW state, privilege,
  service user, running state, and loopback-only published ports;
- RED-first regression tests. The preflight output is redacted and always
  `EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY` or `READ_ONLY_PREFLIGHT_BLOCKED`.
  It never produces a deployment authorization token or mutates Docker.

## Single primary Engineer-I assignment (production path, not new mockups)

1. Start with a fresh actual primary lifecycle / PR head and branch SHA check;
   preserve any active assignment. Read all source + tests and the latest
   secure RC1 receipts before operating on the owner Mac. No specialists unless
   a genuinely independent scoped task would reduce risk.
2. Source-prepare a ONE-app release candidate. Replace fake execFile and
   NOT_RUNTIME_ATTESTED behavior with a separately reviewed and least-privileged
   host-only fixed-action implementation where necessary. Wire API route
   mutations to the authenticated private spool and v13 settlement. Do not
   deploy a synthetic v12/v13 in-process composition. `allowConfigEdit:false`
   until real production attestation closes its specific trust boundary.
3. Run the canonical smart build and focused suites. Supply a PRIVATE owner-Mac
   preflight manifest containing the full expected container IDs, image digests
   and exact bind mount Sources, Destinations, RW states; file must not enter
   GitHub or logs. Run the source-provided read-only preflight. Require a
   source-exact audited container image and immutable API code (RO /app),
   owner .env RO, API non-root, writable route data only at necessary nested
   mounts, no Docker socket in any container, no privileged sidecar, management
   ports loopback only. Verify host mediator ACL/UID and hard exclusion of
   unauthorized same-UID config writers; otherwise NO-GO.
4. Confirm effective loaded nginx source: all conf.d and sites-enabled globs,
   mime.types, image-loaded modules and mounts; exact SHA comparison with the
   approved candidate. Require source/config immutability and no unbound paths.
   Verify backup + recovery image/config/route/session state before mutation.
   Preserve 17 existing routes, trusted origins, admin credentials, 0600 session
   state and the existing secure RC1 fallback. Never downgrade to insecure
   pre-RC1 image.
5. If any safety/functionality gate is false or unknown: STOP with **NO-GO**,
   no live mutation. Report the precise blocker, next code change and SHA.
   If all are GREEN, exercise the fresh scoped owner approval to execute ONE
   bounded proxy + config API production cutover; do not touch ngrok, bridge,
   unrelated services or protected master. Prove real route operations,
   auth/session/Origin continuity, running source, and five Origin runtime
   invariants. Use passive verification first and only safe, reversible
   production smoke steps with snapshots.
6. Return a SINGLE consolidated GitHub STARTED -> VERIFYING -> RETURNED receipt
   with current branch/full SHA, source/image pins, read-only preflight output
   (redacted), successful or blocked release disposition, actual running IDs,
   test command exits, current 17-route continuity, backup/recovery evidence,
   and all five Origin fields. Do not label DEPLOYED unless the actual Mac
   operations and postcutover checks occurred.

## Mandatory CTO/owner gates

CTO independently code-reads the returned changes and runtime evidence before
accepting release. UI work is not in this source candidate; if any UI is
changed, Engineer returns actual SHA-bound screenshots and CTO personally
reviews the pixels before owner UAT. Never make the owner the first UI tester.

Explicit exclusions: protected merge, ngrok or bridge changes, credentials
rotation, public tunnel, extra app stack, privileged Docker socket container,
insecure image rollback, false GO from synthetic tests. The owner approval
is not permission to skip safety verification.
