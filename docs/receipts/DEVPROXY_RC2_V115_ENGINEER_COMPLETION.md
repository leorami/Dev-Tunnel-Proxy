# DEVPROXY RC2 V115 — owner-approved worker-only recovery — **RETURNED**

**Return label:** `WORKER_ONLY_RECOVERY_EXECUTED`  
**Owner action gate:** **GRANTED / EXECUTED** — narrowly scoped worker-only recovery  
**Authority:** issue [#112](https://github.com/leorami/Dev-Tunnel-Proxy/issues/112) comment 6676775635 · PR #79 comment 6676792335  
**Not authorized / not executed:** new HMAC epoch, Docker recreate, proxy/API/ngrok change, LaunchAgent/launchctl install, master merge, owner-app heal, V114 live product sync

## Lifecycle
`STARTED` (#6677104438) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v115-scoped-host-worker-recovery-20261106@14182f4d5f21c0bd96e0d03c781b8e18b2d563d3` |
| Parent V114 RETURNED | `7a4c320ab8e583a90211e1e87b976a08f36981c0` (#6676783928) |
| Import | ONLY 5 V115 paths (preflight util/test, smart-build hook, architecture, handoff) |

## Source vs LIVE provenance
| Layer | Result |
| --- | --- |
| Engineer tip source | V115 preflight + docs imported; native gates green |
| Live product bind / durable stage executable | **unchanged** preexisting durable product `scripts/rc2-supervised-mac-host-worker.cjs` |
| V114 refusal patch in live stage | **not synced** (source-only per V114/V115) |

## Native verification
| Gate | Result |
| --- | --- |
| Focused singleton + preflight | **27/27** |
| `node --check` preflight module | OK |
| `./smart-build.sh test:unit` | **exit 0** (full log `/private/tmp/v115-unit.out`) |

## BEFORE (read-only, redacted)
| Item | Result |
| --- | --- |
| Proxy / API / ngrok | `3506d7fe0b81` / `c2e669397470` / `178b23cbdb9d` running; `unless-stopped`; 0 ephemeral tmp binds |
| Pin | 0600; exact proxy ID/image/mounts match live; `authorizeFixedHostAction` true |
| Epoch | `OWNER_APPROVED_NEW_HMAC_EPOCH` (bytes not displayed); old settlements/heals invalid |
| Singleton | `WORKER_SINGLETON_CRASH_QUARANTINE` |
| `--serve` workers | **0**; stale PID file dead |
| New-epoch spool / lease replay | all **0** / empty |
| Preflight ×2 | both `WORKER_ONLY_PREFLIGHT_SATISFIED`; lock identity unchanged; still `operatorRecheckRequired:true` |

## Authorized mutation (once)
1. Immediate third preflight **SATISFIED**; lock identity identical to BEFORE; zero competing workers.
2. Private redacted original lock record preserved (`/private/tmp/v115-before-preflight.json`, `/private/tmp/v115-recovery-evidence.json`).
3. Unlinked **only** verified stale `host-worker-singleton.lock` once; parent directory fsync; no other files touched.
4. Started **ONE** detached durable-product `rc2-supervised-mac-host-worker.cjs --serve` with existing pin (same Mac UID). No launchctl/LaunchAgent.
5. Alive after 1.5s and **≥60s** after launcher exit; exclusive new **0600** singleton; second instance → `HOST_WORKER_ALREADY_ACTIVE`; spool/replay remained empty (no live signed action).

## AFTER (read-only, redacted)
| Item | Result |
| --- | --- |
| Proxy / API / ngrok | **same full IDs** still running |
| Worker | **1** `--serve`; PID alive; lock 0600 owner UID |
| Singleton inspection | `WORKER_SINGLETON_PID_PRESENT_UNVERIFIED` (expected: live PID, no durable launchd supervisor) |
| Apps listed in `apps.generated.conf` | **17** (unchanged header) |
| Health / login / Ask | **200** no-store (5 keys); **401/403/401**; login **200**; Ask **200** `local_documentation` |
| Owner files / Docker / ngrok / epoch | **unchanged**; no LaunchAgent |

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** (Docker + exclusive one worker) |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** (engineer tip) |
| `realAppVerified` | **PARTIAL** (proxy/UI healthy; offline app 503 / P2 #109 deferred) |

## Residual (separate approval)
No LaunchAgent / launchd supervisor is installed. Process survives shell disconnect via detached spawn, but OS-level reboot supervision still needs a **distinct** owner grant. Do not auto-loop recovery.

## RETURNED
**`WORKER_ONLY_RECOVERY_EXECUTED`.** Stale crash lock cleared once; one approved durable `--serve` running and exclusive; proxy stack unchanged. Owner UAT of apps remains independent.
