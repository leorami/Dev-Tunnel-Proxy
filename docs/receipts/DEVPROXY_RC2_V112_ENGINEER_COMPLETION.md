# DEVPROXY RC2 V112 — post-recovery durable Compose source guard — **RETURNED**

**Return label:** `SOURCE_GUARD_INTEGRATED_LIVE_REOBSERVED`  
**Owner action gate:** `NONE`  
**Live mutation:** **none** (no restart/recreate/rekey/retunnel)

## Lifecycle
`STARTED` (#6674624816) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v112-durable-compose-runtime-handoff-20261106@5b6a3ae508b31bb2c405646d7166e77af46fdf1a` |
| Parent V110 RETURNED | `97b51c75963b3cc53b5115103bff19b19147d5fe` (#6674506604) |
| Import | ONLY 4 paths: compose-candidate guard + 4 new RED tests + V111 architecture + this handoff |

## Source change
`utils/rc2-production-compose-candidate.cjs` now rejects **all 14** host bind path inputs under Mac ephemeral roots (`/tmp`, `/private/tmp`, `/var/tmp`, `/private/var/tmp`, `/var/folders`, `/private/var/folders`, `/dev/shm`, `/run/user`), case-insensitive. Container-internal `tmpfs:/tmp` remains allowed. No service/image/port/security field changes beyond host-path validation.

## Native verification
| Gate | Result |
| --- | --- |
| `rc2-production-compose-candidate.test.cjs` | **23/23** |
| `./smart-build.sh test:unit` | **exit 0** |
| Optional disposable spool provision (test dirs) | OK; **live** spool/lease untouched |

## Read-only live re-observation (vs V110 receipt)
| Item | Observed |
| --- | --- |
| Proxy | `3506d7fe0b81…` **running**; `unless-stopped`; ephemeral host binds **0** |
| API | `c2e669397470…` **running**; `504:20`; RO; no docker.sock; `unless-stopped`; ephemeral host binds **0** |
| Ngrok | `178b23cb…` **running**; same static-domain config |
| Routes | **17** apps in generated conf |
| Trusted origins | **3** (loopbacks + HTTPS); no wildcard |
| Pin vs live proxy | container ID + image **match**; `authorizeFixedHostAction=true` |
| Epoch artifacts | secret len 32; pin 0600; EPOCH.json present |
| Supervised worker | **NOT RUNNING** (differs from V110) |
| Singleton lock | **still present** (stale vs dead process) — **not** auto-cleared (V112 forbids mutation) |

### Auth / health / Ask (read-only)
| Check | Result |
| --- | --- |
| Public health | **200**; five minimized fields; `no-store` / `no-cache` |
| Local neg-password | **401** |
| Foreign Origin | **403** |
| Approved HTTPS neg-password | **401** |
| Signed-in Ask | **200** `local_documentation` |

### Sample app upstreams (not a start gate)
| App | Status |
| --- | --- |
| encast, tigerslam, kyzmet-os | 200 |
| airluum | 308 |
| calliope | 401 |
| iwish, lyra, wayfind, wizardmaker, trajectory | 503 |
P2 #109 remains **deferred**.

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** (one proxy/API/ngrok set; worker process absent) |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** (V112 on engineer tip; live product bind still V110 code — intentional no live FS sync) |
| `realAppVerified` | **PARTIAL** |

## New fact requiring separate owner decision (not executed)
Supervised Mac host worker process is **down** while exclusive singleton lock remains. V112 **must not** restart it. If owner wants worker restored: authorize a **scoped worker-only restart** (clear stale lock only if process confirmed dead; re-`--serve` from durable product pin) — distinct from this source-guard sprint.

## Minimal owner UAT
1. Open local proxy UI (`http://127.0.0.1:8080/`) and confirm dashboard loads.
2. Confirm remote HTTPS site login with wrong password → 401 (not 403).
3. Sign in; Ask a docs question → grounded local answer.
4. Spot-check apps you care about; 503 on offline apps is expected until those apps are started (#109 deferred).
5. Decide whether to authorize worker-only restart (see above).

## RETURNED
**`SOURCE_GUARD_INTEGRATED_LIVE_REOBSERVED`.** Compose ephemeral-bind regression closed in source. V110 production stack re-observed without redeploy. Worker absence reported fail-closed. CTO reviews before UAT/integration.
