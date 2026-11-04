# DEVPROXY RC2 CTO preflight hardening integration — **NO-GO**

**Return label:** `NO-GO_READ_ONLY_PREFLIGHT_BLOCKED` / `NOT_DEPLOYED`  
**Not:** production recreate · mount remount · ngrok/bridge change · credential rotation · protected master merge

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Active RC2 assignment (preserved) | PR #79 `engineer/devproxy-rc2-controlled-release-20261104` |
| Engineer-I PR #76 (preserved) | `8859fca6af37f4b4796ff556e09d616975af5b8b` |
| CTO hardening source (reused, not recreated) | `cto/devproxy-rc2-readonly-preflight-parity-20261104@0dd5c35cf2684b95107d7841e610dd93d139d249` |
| Handoff | `docs/handoffs/DEVPROXY_RC2_CTO_PREFLIGHT_HARDENING.md` |
| v13 settlement blob | unchanged `453c821489e188c9a4d9b601b8b606cfeb7e0e6b` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | see commit SHA after push |

## STARTED
Rechecked lifecycle: master `62a4d7b…`; PR #76 preserved; PR #78 CTO hardening draft at `0dd5c35…`; existing owner-authorized RC2 assignment PR #79 continued (not replaced).

## IMPLEMENTING
### Reused CTO implementation (exact checkout)
- `utils/rc2-readonly-production-preflight.cjs` (mandatory RW four data mounts + dual inspect rounds)
- `tests/security/rc2-readonly-production-preflight.test.cjs` (17 tests)
- `docs/architecture/DEVPROXY_RC2_PREFLIGHT_PARITY_AND_TIME_SLICED_INSPECT.md`
- `docs/handoffs/DEVPROXY_RC2_CTO_PREFLIGHT_HARDENING.md`

### Production blockers addressed in source (not live-applied)
1. **API → v13 file settlement:** already on this assignment via `createCrossProcessSettlementActivation` when `DEVPROXY_ACTIVATION_SPOOL_DIR` + secret are provisioned (legacy Unix socket only if spool absent).
2. **Legacy `/ai/` Docker/self-heal:** `proxyConfigAPI.js` now returns explicit `503 BLOCKED_INLINE_DOCKER_UNAVAILABLE` for health/restart/ask/audit-and-heal/advanced-heal/self-check/snapshot-analyze when spool is set, deny flag is set, or production lacks `/var/run/docker.sock`. `calliopeHealing` refuses inline docker under the same policy.
3. **Mount parity contract:** hardened preflight **rejects pins** that mark required route-data mounts RO (`INVALID_RC2_PREFLIGHT`). Live still has `/app:rw`, root API, RO apps/sites — cannot pass inspect.

## VERIFYING
### Tests
| Suite | Result |
| --- | --- |
| Hardened RC2 preflight | **17/17** PASS |
| Cross-process settlement + Calliope gate | **4/4** PASS |
| v13 durable receipt + smoke | **18/18** PASS |
| Combined focused (39) | **39/39** PASS |
| `./smart-build.sh test:unit` | **exit 0** |

### Live Mac read-only preflight (no mutation)
Desired-secure pin ( `/app:ro`, four data mounts RW, `.env:ro` ) against live IDs →

| Result | Value |
| --- | --- |
| code | **`READ_ONLY_PREFLIGHT_BLOCKED`** |
| blockers | **`API_MOUNTS_MISMATCH`**, **`API_ROOT_USER`**, **`PROXY_PORTS_NOT_LOOPBACK`** |
| Origin five | all **UNKNOWN** |
| productionChangeAuthorized | **false** |

Pin attempting RO `/app/apps` (etc.) → construction **`INVALID_RC2_PREFLIGHT`** (CTO defect-1 correction proven).

### Preserved live state
| Check | Result |
| --- | --- |
| Proxy | `1932725ad746d70490ba62ace980a70c872a9b5ac6bfad76b5d5be955fa0bd28` |
| API | `51bbafd0cf14190d22cc29e994ad063ba09e16105ea818de2db5bf91318303e7` |
| Ngrok | `178b23cbdb9d…` untouched |
| Routes | **17** |
| Session | **0600** |
| health.json | **200** |
| docker.sock | absent |
| Host worker / spool installed live | **no** |

## Exact NO-GO
Hardened read-only preflight blocked on live proxy/API. Contract requires STOP before production mutation.

## RETURNED
**`NO-GO_READ_ONLY_PREFLIGHT_BLOCKED` / `NOT_DEPLOYED`.** CTO hardening integrated into existing RC2 assignment; production unchanged.

**Specialists:** none. **Production mutate:** none.
