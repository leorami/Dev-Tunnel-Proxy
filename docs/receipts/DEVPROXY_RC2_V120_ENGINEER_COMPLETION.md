# DEVPROXY RC2 V120 — owner-authorized one-worker durable source cutover — **RETURNED**

**Return label:** `WORKER_SOURCE_CUTOVER_DEPLOYED_AND_VERIFIED`  
**Owner action gate:** **GRANTED / EXECUTED** — issue [#121 #6713687575](https://github.com/leorami/Dev-Tunnel-Proxy/issues/121#issuecomment-6713687575) / PR [#79 #6713719403](https://github.com/leorami/Dev-Tunnel-Proxy/pull/79#issuecomment-6713719403). **Did not ask again.**  
**Specialists:** `NOT_SPAWNED`  
**Tracking:** issue [#121](https://github.com/leorami/Dev-Tunnel-Proxy/issues/121)

## Lifecycle
`STARTED` (#6714173254) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v120-owner-approved-worker-cutover-20261107@efb3f3b37d4fe6419bff127279ec38f56b8b8e2d` |
| Parent V119 RETURNED | `58e099881709b032f44e8b75b0e87413871b583d` (#6713118973) |
| Reviewed release commit | `20427efaf372d19f341d39c84e21139e9413a907` |
| Reviewed pending blob | `6a084d5f697e999219de5bd078032cbe8fde1536` |
| Changed-path count | **6** |

## Source delta (actual)
1. `tests/security/rc2-v120-signed-refusal-cutover-integration.test.cjs`
2. `docs/architecture/DEVPROXY_RC2_V120_OWNER_APPROVED_WORKER_SOURCE_CUTOVER.md`
3. `docs/handoffs/DEVPROXY_RC2_V120_OWNER_APPROVED_WORKER_SOURCE_CUTOVER.md`
4. `smart-build.sh` (narrow unit hook)
5. `docs/receipts/DEVPROXY_RC2_V120_ENGINEER_COMPLETION.md`
6. `docs/receipts/DEVPROXY_RC2_V120_RUNTIME.json`

## Native (NO_GO gate before live mutation)
| Gate | Result |
| --- | --- |
| Focused V120 + pending + terminal-refusal + closure + supervised (serial) | **39/39** |
| `./smart-build.sh test:unit` | **exit 0** (V120 hook executed) |

Parallel multi-file runs can race `/tmp` ancestor mtimes in the closure verifier; serial/canonical invocations are green.

## Live cutover (redacted)
### BEFORE
- Exactly **1** `--serve`; lock **0o600**; **0** spool tickets / replay  
- Durable closure **MISMATCH**; only **`utils/rc2-pending-host-worker.cjs`** differed (other 11 already matched)  
- Proxy/API/ngrok `3506d7fe0b81` / `c2e669397470` / `178b23cbdb9d`

### ACTION
1. Immutable 12-module stage from reviewed commit → `REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY`  
2. Private **0700** rollback of all 12 modules (`v120-rollback-1794092513272`) with SHA-256 manifest **before** stop  
3. **SIGTERM only** original PID; cooperative exit; lock cleared by worker; queue clean  
4. Atomic sync of **only** the mismatched pending module; post-sync durable closure **MATCH**; pending blob `6a084…`  
5. Start **one** detached durable-product `--serve` with same Node + existing pin/epoch (not LaunchAgent)  
6. Restored missing durable `build/sites-enabled/apps.generated.conf` using **byte-identical** live nginx mount source (pre-existing empty dir blocked `createCandidateManifest`; **not** a route content change)  
7. Signed no-action ticket with wrong digest ≠ actual candidate → verified **`CONFIG_SET_DIGEST_MISMATCH`**; prepared **0**; replay **0**; same sole worker + lock **0o600**; durable reply kept as audit  
8. **≥60s** stability

### AFTER
| Item | Result |
| --- | --- |
| Workers / lock / closure | **1** / **0o600** / `REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY` |
| Pending V114 blob | **match** |
| Signed refusal | **verified** `CONFIG_SET_DIGEST_MISMATCH` |
| Docker IDs | unchanged |
| Apps | **17** |
| health.json | **200** `ok` |
| Login | local **401** / foreign **403** |
| Ask (unauth) | **401** (endpoint present; no new login escalation) |

## Not performed
LaunchAgent/launchctl · `KeepAlive:true` · auto lock-clear · SIGKILL · HMAC rekey · Docker/ngrok/proxy restart · master merge · reused V115 lock deletion

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
Owner-authorized live product-source cutover deployed and verified. New process started **after** reviewed source install; disk MATCH alone was not treated as old-process load proof. Private rollback retained. Issue #121 should close on CTO acceptance. LaunchAgent (#116) still not authorized. Owner UAT independent.
