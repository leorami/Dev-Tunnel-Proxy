# DEVPROXY RC2 V113 — host-worker diagnosis (nonlive) — **RETURNED**

**Return label:** `WORKER_SINGLETON_CRASH_QUARANTINE`  
**Owner action gate:** `NONE` for this sprint  
**Worker restart / lock clear:** **NOT AUTHORIZED / NOT EXECUTED**  
**Tracking:** issue [#112](https://github.com/leorami/Dev-Tunnel-Proxy/issues/112)

## Lifecycle
`STARTED` (#6676605504) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v113-worker-lock-evidence-20261106@ed2846cfb5656e90b92b59ba5b46f84a3bc235da` |
| Parent V112 RETURNED | `4525186a9b2c4aab138dc43448f0fa3c13a56efc` (#6674654385) |
| Import | ONLY 4 V113 paths (inspection util + 12 tests + architecture + handoff) |

## Source change
- `utils/rc2-host-worker-singleton-inspection.cjs` — read-only lock evidence; injected PID liveness; never deletes/restarts/probes Docker
- `tests/security/rc2-host-worker-singleton-inspection.test.cjs` (12 RED-first)
- `docs/architecture/DEVPROXY_RC2_V113_HOST_WORKER_LIFECYCLE_EVIDENCE.md`

## Native verification
| Gate | Result |
| --- | --- |
| Focused inspection suite | **12/12** |
| `./smart-build.sh test:unit` | **exit 0** (no V113 smart-build hook added; focused suite run explicitly) |

## Read-only Mac diagnosis (privacy-safe codes)
| Evidence | Code / fact |
| --- | --- |
| `inspectHostWorkerSingleton` | **`WORKER_SINGLETON_CRASH_QUARANTINE`** |
| Lock present | yes; mode **0600**; nlink **1**; not symlink; age ~**2.5h** |
| Lock protocol | `DEVPROXY_HOST_WORKER_V1`; keys exactly `{protocol,pid}` |
| Lock PID alive | **false** (dead) |
| `pgrep` supervised worker | **0** matches |
| Recorded worker.pid alive | **false** |
| LaunchAgent / launchctl hits | **none** (`durableSupervisorVerified=false`) |
| Worker serve log | present, **empty** (0 bytes) — no termination text |
| New-epoch spool counts | requests/responses/prepared/acks/replay all **0** |
| Lease files | only singleton lock (no inflight JSON) |
| Pin vs live proxy | ID + image **match**; proxy **running** |
| In-flight mutation risk | **low** (empty prepared/acks; no inflight lease file) — still **not** proof to auto-clear |

**Interpretation:** crash-durable exclusive lock remains after process death; PID match is **not** worker-identity proof when alive, and here PID is dead → quarantine, not “safe to ignore.” No durable macOS supervisor was installed, so the worker will not auto-return after exit/reboot.

## Read-only proxy/API/ngrok re-verify (unchanged from V112 intent)
| Check | Result |
| --- | --- |
| Proxy / API IDs | `3506d7fe0b81…` / `c2e669397470…` still running |
| Health | **200** minimized + no-store |
| Login | local **401** / foreign **403** / HTTPS **401** |
| Signed-in Ask | **200** |
| Routes configured | **17** |
| P2 #109 | deferred |

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** (Docker stack); worker process absent |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** (unchanged) |

## Proposed next decision (NOT executed)
**OWNER ACTION GATE: APPROVAL REQUIRED — scoped worker-only recovery**

Preservation plan if approved later:
1. Re-confirm `pgrep` empty + lock PID still dead + spool prepared/acks still 0.
2. Remove **only** the crash-quarantine singleton lock (0600 exclusive file); do **not** wipe spool/secret/pin.
3. Start one supervised `--serve` from durable product script + existing pin (same proxy ID/image).
4. Verify new exclusive lock, process stays up ≥60s, disposable (non-owner) settlement optional.
5. No HMAC rotation, no container recreate, no ngrok/domain/bridge/master change.

V113 does **not** grant or perform that recovery.

## RETURNED
**`WORKER_SINGLETON_CRASH_QUARANTINE`.** Inspector integrated and natively tested. Live proxy/UI remain usable for owner UAT without waiting on worker. Issue #112 remains open pending scoped recovery approval.
