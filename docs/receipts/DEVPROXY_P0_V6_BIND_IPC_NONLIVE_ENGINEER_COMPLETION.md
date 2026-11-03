# DEVPROXY P0 v6 bind-IPC nonlive candidate — source verified

**Return label:** `SOURCE_CONTENT_BINDING_VERIFIED` / `NOT_DEPLOYED`  
**Host transport:** `MAC_SHARED_BIND_PENDING`  
**Not:** production wiring · host worker install · owner `.artifacts` writes · PR #59 disposable API retest · PR #61 socket re-investigation · owner UAT · protected merge

## Lifecycle
`STARTED → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO handoff | `origin/cto/devproxy-p0-v6-content-bound-file-spool-20261103@7c451f908e0704f1f90529fc18680e17b8247110` / PR #62 |
| Prior Engineer #61 | `1f2dbb78e8c045c008ace441e414aed495cbcdc1` (`BLOCKED_HOST_TRANSPORT_CAPABILITY`) — evidence preserved, not replaced |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Consumed GO | Issue #10 `6595948888` |
| This receipt tip | see authoritative SHA after push |

## STARTED
Verified PR #61 tip, CTO `7c451f9…`, live IDs unchanged. No active competing engineer assignment on this scope.

## VERIFYING
### Focused + canonical
| Suite | Result |
| --- | --- |
| Four v6 security suites | **43/43**, exit **0** (Node v22.19.0) |
| `./smart-build.sh test:unit` | exit **0** |

### Source review / nonlive candidate
CTO modules compose via `utils/rc1-v6-bind-ipc-nonlive.cjs` (exports only; **not** imported by `proxyConfigAPI.js`). v5 API remains `allowConfigEdit:false` with Unix-socket client; **no** runtime switch to file spool; **no** new env flags.

### Existing owner Mac data-bind (read-only)
Live API already has an RW `.artifacts` bind and no docker.sock. Owner `.artifacts` was **not** written or used as a spool under this handoff.

### Test-owned one-shot bind utility (torn down)
Private `/private/tmp/dpv6-bind-probe` only: host↔container file read/append, fsync visibility, hardlink publish — all observed. No sidecar, no docker.sock, no listener, no host background worker. This shows Docker Desktop **file** binds can carry IPC bytes (unlike Mac Unix sockets), but does **not** attest owner `.artifacts` ACL/UID, live spool placement, worker install, or API wiring → **`MAC_SHARED_BIND_PENDING`**.

### Origin five
All **unknown** (unknown ≠ PASS). No UI / no owner UAT.

## Decision-ready minimum (only if advancing transport)
Owner authorization for test-owned two-sided validation (private non-owner spool path or explicitly attested `.artifacts` ACL/UID plan) **plus** separate authority to install/run the fixed-action host worker — not granted here.

## RETURNED
**`SOURCE_CONTENT_BINDING_VERIFIED` / `NOT_DEPLOYED`** with **`MAC_SHARED_BIND_PENDING`**.

**Specialists:** none. **Production mutate:** none.
