# DEVPROXY RC2 V114 — terminal signed refusal nonfatal — **RETURNED**

**Return label:** `TERMINAL_SIGNED_REFUSAL_NONFATAL_SOURCE`  
**Owner action gate:** `NONE` for this sprint  
**Live worker restart / lock clear / launchd:** **NOT AUTHORIZED / NOT EXECUTED**  
**Tracking:** crash-lock recovery remains issue [#112](https://github.com/leorami/Dev-Tunnel-Proxy/issues/112)

## Lifecycle
`STARTED` (#6676752873) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v114-terminal-rejection-does-not-crash-worker-20261106@b6ec0e38ec7619ed8904c49c79423cc025512b53` |
| Parent V113 RETURNED | `2979a3a2eed64eb79ec3272e9dfcc9c7181206f1` (#6676629929) |
| Import | ONLY 5 V114 paths |

## Source change
`utils/rc2-pending-host-worker.cjs`: accept durable signed `CONFIG_SET_DIGEST_MISMATCH` as terminal **no-action** outcome when response exists and **no** replay reservation; other errors stay crash-quarantine.  
Tests: `rc2-pending-terminal-refusal.test.cjs` (6) + existing pending suite (12).  
`smart-build.sh`: hook both suites into `test:unit`.  
Architecture note documents RED/GREEN authority.

## Native verification
| Gate | Result |
| --- | --- |
| Focused pending + refusal | **18/18** |
| `node --check` pending module | OK |
| `./smart-build.sh test:unit` | **exit 0** (full log retained privately; includes V114 hook) |

## Disposable owner-data-free proof (not live spool)
| Check | Result |
| --- | --- |
| Stale digest via real HMAC settlement | `CONFIG_SET_DIGEST_MISMATCH` |
| Signed reply verified | **true** |
| Fixed host action on mismatch | **0** calls |
| Replay reservation / prepared on mismatch | **absent** |
| Pending supervisor continues; distinct valid request | **RELOAD_AND_VERIFICATION_REPORTED** (action count 1) |
| Indeterminate / missing reply / mismatch+replay | still **HOST_WORKER_INDETERMINATE** quarantine |
| Live new-epoch spool | **untouched** (counts remain 0) |

## Read-only live re-observation
| Item | Result |
| --- | --- |
| Proxy / API / ngrok | same IDs running (`3506d7fe…` / `c2e66939…` / `178b23cb…`) |
| Singleton inspection | still **`WORKER_SINGLETON_CRASH_QUARANTINE`** |
| Worker process | **not running**; lock still present |
| Health / login / Ask | **200** no-store; **401/403/401**; Ask **200** |
| V114 code in live product bind | **not claimed installed** (source tip only; no live FS sync/restart) |

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** (Docker); worker absent |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** (engineer tip) |
| `realAppVerified` | **PARTIAL** |

## Decision gate (unchanged; not executed)
**OWNER ACTION GATE: APPROVAL REQUIRED — scoped worker-only recovery** (issue #112). V114 does not clear the lock, start `--serve`, or install launchd. This source fix is **not** asserted as the cause of the current empty-spool worker death.

## RETURNED
**`TERMINAL_SIGNED_REFUSAL_NONFATAL_SOURCE`.** Deterministic signed digest refusal no longer crashes the pending supervisor in source/tests; crash quarantine preserved. Zero Mac live mutations. Proxy/UI remains UAT-ready.
