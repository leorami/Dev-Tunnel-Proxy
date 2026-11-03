# Dev Proxy P0 v7 host-operation crash fence

Status: CTO source/test candidate only. NOT_DEPLOYED. The actual owner Mac host
worker does not exist in this repository and no owner GO authorizes installing
or running one. This document records a future integration boundary, not an
attempt to bypass it.

## Source-proven problem

The v6 candidate (`rc1-activation-spool.cjs`) already reserves each *request*
ID durably. However two **different** valid IDs can execute concurrently,
and an unexpected stop after an nginx reload does not preserve a global
host-side *operation-in-progress* sentinel. A per-request replay reservation
is therefore not a cross-request serialization or crash recovery contract.

The next host worker must not interpret "request signed" or "reply persisted"
as "reload operations globally serialized". If the host worker disappears
between nginx reload and signed response, only a fail-closed durable marker
and operator-led reconciliation can prevent a second ambiguous reload.

## CTO-owned implementation

`utils/rc1-host-operation-quarantine.cjs` exports
`createHostOperationQuarantine({directory,timeoutMs})`. Its sole public method
`run(trustedFixedOperation)` is explicitly invoked by a trusted host worker,
not by the web API, a public queue message, a generic Docker command or UI.

- Before any callback: verify a private owner-owned, non-symlinked canonical
  directory (0700), atomically create `host-operation-inflight` with O_EXCL
  at 0600, fsync the file and enclosing directory.
- A concurrent request, a prior crash, an unknown marker or a symlink marker
  remains `HOST_OPERATION_QUARANTINED`. There is no reset, cleanup, stale PID
  stealing, auto retry or Docker invocation in this module.
- Require an AbortSignal-aware trusted callback and a bounded operation
  deadline. All uncertain outcomes, including timeout, exception, mismatched
  marker inode or incomplete verification, retain quarantine.
- Only an exact, verified callback result (approved identity, candidate
  digest and active route all verified) can clear the same marker inode, fsync
  the directory and return `VERIFIED_HOST_OPERATION`.
- The module is a **concurrency/durability guard**. It cannot independently
  prove that a callback actually ran nginx, that a file reached Docker Desktop,
  or that owner authority exists. A dishonest callback is a host trust failure.
- A crash/restart with a surviving marker requires *owner-authorized,
  out-of-band* reconstruction of candidate, running nginx worker state, route
  availability and any partially committed mutation BEFORE a separately
  reviewed manual recovery. This module intentionally has no recovery API.

## Relevant observed state

Primary Engineer-I returned PR #63:
`engineer/devproxy-p0-v6-bind-ipc-nonlive-20261103@012aac8b17ca057f6abbcb2c1d4a28b878000ae8`.
It added a nonlive composition and reported 43/43 focused tests, canonical
suite exit 0 and a single test-owned Mac Docker Desktop bind visibility probe.
It **did not** wire the API, install a host worker, access owner `.artifacts`,
solve owner ACL/UID or verify the five Origin canonical runtime fields.
No UI changed; do not claim a CTO pixel review or owner UAT.

## Integrity requirements for future host integration

1. Serialize across **all request IDs and all cooperating host worker
   processes**, not merely per-request replay reservations.
2. Never execute a privileged operation before successful marker durability.
3. After authenticated request check + independently computed candidate digest,
   guard *the entire* fixed nginx test/reload/identity/route verification
   sequence. A status from the untrusted queue may never satisfy this guard.
4. Write one signed result under the v6 protocol only from the trusted host
   callback; the v6 status taxonomy must not misrepresent an indeterminate
   reload as a known-safe validation failure. Confirm reply durability before
   clearing the marker; otherwise preserve quarantine.
5. Keep config editing disabled (`allowConfigEdit:false`). No API, proxy,
   ngrok or broker container may gain Docker engine socket access.
6. Any new host process, privilege, long-lived service, private owner data
   path, listener, Docker mutation or production cutover needs separate
   specific owner authorization and security review. Existing one-time RC1 GO
   (issue #10 comment 6595948888) was consumed.
7. Preserve exactly one canonical owner development application. No second
   app/preview/container stack for owner UAT. Source-only fixtures and
   read-only inspection are not owner-facing UAT.

## Verification and disposition

CTO TDD: initial test runner failed on missing module (RED). After
implementation and a corrected concurrent-test barrier, 16/16 native
Node 22.16.0 regression tests pass, 0 skipped. Tests use only test-owned
private temporary directories; no Docker, network, Mac owner services,
credentials or real route files were touched.

This is **NOT** host worker installation proof, a Mac IPC validation, a
production approval, a clean runtime release receipt or a UI acceptance.
