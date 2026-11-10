# DEVPROXY RC2 V116 — source-only LaunchAgent candidate — **RETURNED**

**Return label:** `LAUNCHAGENT_SOURCE_CANDIDATE_READY`  
**Owner action gate:** `NONE` for this sprint  
**LaunchAgent install / worker stop-cutover / restart:** **NOT AUTHORIZED / NOT EXECUTED**  
**Tracking:** issue [#116](https://github.com/leorami/Dev-Tunnel-Proxy/issues/116) (supervision remains OPEN)

## Lifecycle
`STARTED` (#6677593733) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v116-mac-worker-launchagent-candidate-20261106@2297d4241f52699bdcb4d94abeadf24b24717937` |
| Parent V115 RETURNED | `d2e06f40087ab4769af77daf0523b0d0e137534b` (#6677176553) |
| Import | ONLY 5 V116 paths |

## Code review (entrypoint vs candidate)
| Item | Result |
| --- | --- |
| `scripts/rc2-supervised-mac-host-worker.cjs` argv | exactly `--serve <absolutePrivatePin>` (or `--scan-once`) |
| Shutdown | SIGINT/SIGTERM → AbortController; no auto-clean of stale singleton/replay |
| Candidate `ProgramArguments` | `[node, <product>/scripts/rc2-supervised-mac-host-worker.cjs, --serve, <pin>]` |
| `RunAtLoad` / `KeepAlive` | **true** / **false** — login-once start; **no** after-crash relaunch |
| Forbidden | KeepAlive true, shell, Docker sock, UID overrides, timed relaunch, auto-unlink |

## Native verification
| Gate | Result |
| --- | --- |
| Focused LaunchAgent candidate | **10/10** |
| `node --check` candidate module | OK |
| Disposable `plutil -lint` | **OK** (test-owned fixture; destroyed after; no install; XML/paths not published) |
| `./smart-build.sh test:unit` | **exit 0** |

## Source-only readiness report
| Claim | Evidence |
| --- | --- |
| Candidate generates valid plist | `plutil -lint` OK on disposable fixture |
| Safe login-once behavior | `RunAtLoad:true` + `KeepAlive:false` |
| Residual: Docker not ready at login | Worker may fail at login and **will not** auto-retry |
| Residual: no automatic crash recovery | Intentional — preserves crash quarantine / replay evidence |
| Still required before any install | Private 0700 log root; pin/log not under product tree; ownership; atomic write; label absence; clean cutover from running V115 worker; rollback; login/logout/crash/missing-Docker Mac tests |
| Flags | `installed:false`, `macTested:false`, `ownerApprovedInstall:false`, `productionChangeAuthorized:false`, `requiresNewOwnerGrant:true` |

## Read-only live reobserve (V115 worker untouched)
| Item | Result |
| --- | --- |
| `--serve` count / PID | **1** / alive |
| Lock | **0600** exclusive |
| Pin / image / epoch | exact match; `OWNER_APPROVED_NEW_HMAC_EPOCH` |
| Proxy / API / ngrok | same IDs `3506d7fe…` / `c2e66939…` / `178b23cb…` |
| Apps listed | **17** |
| Health / login / Ask | **200** no-store; **401/403/401**; Ask **200** |
| Spool / replay | empty |
| `~/Library/LaunchAgents` match | **none** for target label |
| `launchctl` label `org.devproxy.rc2.mac-host-worker` | **absent** |
| Mutations this sprint | **none** (no bootstrap/kickstart/bootout; no LaunchAgents write; worker not stopped) |

## Decision-ready future authorization scope (NOT requested now)
**OWNER ACTION GATE (future, distinct):** authorize one per-user LaunchAgent **install + cutover** only after: verify running V115 worker/pin/epoch; prepare private 0700 logs; confirm label absent; atomically place `org.devproxy.rc2.mac-host-worker.plist`; cleanly stop the detached V115 process without erasing crash quarantine if stop is ambiguous; bootstrap once; prove exclusivity and no second worker; prove KeepAlive remains false (no restart storm); document residual login-vs-Docker timing. Explicitly **excludes** KeepAlive:true, auto-lock-clear, HMAC rekey, Docker/ngrok/master, owner-app heal, and V114/V116 durable product sync unless separately granted.

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
**`LAUNCHAGENT_SOURCE_CANDIDATE_READY`.** Source candidate natively verified; V115 live worker and OS LaunchAgents unchanged. Owner UAT remains available. Issue #116 install/cutover still needs a **new** owner grant.
