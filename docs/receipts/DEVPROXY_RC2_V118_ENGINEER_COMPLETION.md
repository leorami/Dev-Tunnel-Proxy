# DEVPROXY RC2 V118 — running-worker source/stage provenance — **RETURNED**

**Return label:** `STAGE_FILE_MISMATCH_PROCESS_CODE_LOADED_UNVERIFIED`  
**Owner action gate this sprint:** `NONE` (read-only source/tests/Mac inspection only)  
**Future owner gate prepared (NOT executed):** narrowly scoped durable **worker product-source** cutover  
**Live worker stop/restart/replace · LaunchAgent install · Docker/ngrok/HMAC/proxy mutation · master merge · V115 recovery reuse:** **NOT AUTHORIZED / NOT EXECUTED**  
**Tracking:** issue [#121](https://github.com/leorami/Dev-Tunnel-Proxy/issues/121) remains OPEN until source-vs-live cutover evidence; [#116](https://github.com/leorami/Dev-Tunnel-Proxy/issues/116) LaunchAgent lifecycle; [#109](https://github.com/leorami/Dev-Tunnel-Proxy/issues/109) observation only

## Lifecycle
`STARTED` (#6699562650) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v118-worker-source-stage-evidence-20261106@c99b91cfc06484fa68d5663a01db9b4098fea2d5` |
| Parent V117 RETURNED | `6cb77b039c0c40612a8d04a9e2655043e0cfe2a1` (#6677919876) |
| Import | ONLY 7 V118 paths from pinned CTO branch (based on V117 tip) |
| Reviewed durable module Git blob | `6a084d5f697e999219de5bd078032cbe8fde1536` |

## Source import (exact seven paths + receipts)
1. `tests/security/rc2-reviewed-worker-source-stage.test.cjs`
2. `utils/rc2-reviewed-worker-source-stage.cjs`
3. `tests/security/rc2-worker-launchagent-path-provenance.test.cjs`
4. `utils/rc2-worker-launchagent-path-provenance.cjs`
5. `smart-build.sh` (unit hook only)
6. `docs/architecture/DEVPROXY_RC2_V118_WORKER_STAGE_AND_PATH_TRUST.md`
7. `docs/handoffs/DEVPROXY_RC2_V118_WORKER_SOURCE_STAGE_READONLY.md`
8. `docs/receipts/DEVPROXY_RC2_V118_ENGINEER_COMPLETION.md` (this file)
9. `docs/receipts/DEVPROXY_RC2_V118_RUNTIME.json`

Imported helper Git blobs match CTO architecture pins (`55a7bc4a…`, `f984a2c4…`, `14821c6c…`, `e591f16e…`).

## Native verification
| Gate | Result |
| --- | --- |
| Node | **v22.19.0** |
| Focused `rc2-reviewed-worker-source-stage` + `rc2-worker-launchagent-path-provenance` | **22/22 PASS** |
| `node --check` both modules | **OK** |
| `./smart-build.sh test:unit` | **exit 0** (includes new unit hook) |
| Fixture isolation | test-owned only; no owner route/secret data |

## Read-only Mac diagnosis (redacted)
| Item | Result |
| --- | --- |
| `--serve` workers | **1** |
| Process ↔ pin ↔ cwd | pin-bound; **cwd == approvedRoot** (durable `…/stage/product`) |
| Pin / singleton lock | **0o600** / **0o600** |
| Spool | structural dirs present; **0 ticket/replay files** |
| Proxy / API / ngrok | unchanged `3506d7fe0b81` / `c2e669397470` / `178b23cbdb9d` |
| Apps header | **17** |
| `nginx -t` | **OK** |
| `/health.json` | **200** `no-store` (`status` only) |
| Login matrix | trusted local **401** invalid password; foreign **403** origin denied; login page **200** |
| Calliope Ask (unauthenticated) | **401** sign-in required (endpoint present) |
| LaunchAgents / launchctl label | **none** |

### Source vs stage vs loaded process (kept separate)
| Claim | Result |
| --- | --- |
| Helper on durable `approvedRoot` | `REVIEWED_STAGE_MODULE_MISMATCH` |
| **`STAGE_FILE_*`** | **`STAGE_FILE_MISMATCH`** |
| **`PROCESS_CODE_LOADED_*`** | **`PROCESS_CODE_LOADED_UNVERIFIED`** |
| `processIdentityAttested` / `liveLoadedCodeVerified` | **false** / **false** (helper hardcodes) |
| Engineer worktree pending module | **MATCH** reviewed `6a084…` |
| Durable approvedRoot pending module | **MISMATCH**; lacks V114 `CONFIG_SET_DIGEST_MISMATCH` marker |
| `--serve` import chain | requires `rc2-pending-host-worker` (on-disk stage still not proof of loaded bytes) |

A filesystem match would only prove inspected disk bytes. This run proved **on-disk durable stage drift**, and explicitly **did not** prove which JS bytes the running Node process has mapped.

### LaunchAgent path trust
`LAUNCHAGENT_PATH_TRUST_UNKNOWN` — no independently owner-approved external SHA256 for Node binary / worker entrypoint was available without circular self-hashing. Process node had **0** symlink hops. **Stop/unknown only** — no chmod, symlink, pin, log, process, or `~/Library/LaunchAgents` / launchctl mutation.

## Future owner gate (decision-ready; NOT executed)
Authorize **one** narrowly scoped durable worker **product-source** cutover that:
1. Cleanly stops the single current `--serve` without clearing crash quarantine ambiguously  
2. Preserves replay/lock quarantine  
3. Syncs fully versioned reviewed product `utils/rc2-pending-host-worker.cjs` (blob `6a084d5f697e999219de5bd078032cbe8fde1536`) plus the entire transitive dependency manifest  
4. Proves signed no-action `CONFIG_SET_DIGEST_MISMATCH` regression on the new process  
5. Keeps HMAC epoch/pin continuity (no rekey unless separately granted)  
6. Retains private rollback of prior durable product bytes  
7. Optionally adds a **separately scoped** per-user LaunchAgent install only after external reviewed path digests exist  

**Excluded:** reused V115 stale-lock recovery; Docker/ngrok/proxy recreate; master merge; owner-app heal; `KeepAlive:true`; auto lock-clear.

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
Evidence-only. Running worker and production IDs untouched. Issue #121 remains until an authorized source cutover proves live process identity. Owner UAT of proxy/dashboard/Ask remains independent and unblocked by this diagnosis.
