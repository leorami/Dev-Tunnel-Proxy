# DEVPROXY V121 — P0 notification-bridge live read-only authorization proof — **RETURNED**

**Return label:** `BRIDGE_POTENTIAL_UNAUTHENTICATED_CONTROL`  
**Owner action gate this sprint:** `NONE` (read-only inspection / four status GETs only)  
**Live bridge stop/restart/install · Messages · launchctl · worker/Docker mutation · master merge:** **NOT AUTHORIZED / NOT EXECUTED**  
**Specialists:** `NOT_SPAWNED`  
**Tracking:** issue [#8](https://github.com/leorami/Dev-Tunnel-Proxy/issues/8) remains OPEN (P0 exposure observed)

## Lifecycle
`STARTED` (#6715181825) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-v121-notification-bridge-live-policy-probe-20261107@414bc6002c3a5289e6ef8b0ab5080c13976be2c8` |
| Parent V120 RETURNED | `7da2026a9b1bfd1cd2dacecc335bfaecb6788f62` (#6714253018) |
| Changed-path count | **7** (4 imports + unit hook + 2 receipts) |
| Reviewed bridge / auth blobs | `6bf5a1a973d6806e9ddbd05c932ef9cedee424c6` / `b7bf100ab54d97b21057f1b630906483a188c103` |

## Source delta (actual)
1. `utils/notification-bridge-readonly-policy-probe.cjs` (blob `50c383e807b53ea45cb5cf3c039c99f9c895e9bf`)
2. `tests/security/notification-bridge-readonly-policy-probe.test.cjs` (blob `de7538c521302fccf4bbdab85cb84801670abd86`)
3. `docs/architecture/DEVPROXY_V121_NOTIFICATION_BRIDGE_LIVE_AUTH_EVIDENCE.md`
4. `docs/handoffs/DEVPROXY_V121_NOTIFICATION_BRIDGE_LIVE_READONLY_PROBE.md`
5. `smart-build.sh` (narrow unit hook)
6. `docs/receipts/DEVPROXY_V121_ENGINEER_COMPLETION.md`
7. `docs/receipts/DEVPROXY_V121_RUNTIME.json`

## Native
| Gate | Result |
| --- | --- |
| Focused probe suite | **5/5** |
| `node --check` | **OK** |
| `./smart-build.sh test:unit` | **exit 0** |

## Read-only Mac evidence (redacted)
| Item | Result |
| --- | --- |
| Listener | **1** on `127.0.0.1:17888` |
| Process start | **2026-11-05 ~18:33** (≈2d uptime) |
| On-disk bridge/auth vs reviewed blobs | **MATCH** |
| `liveProcessSourceVerified` | **false** (disk ≠ loaded-process proof; process file ≠ engineer-tree inode) |
| GET `/health` | **200** |
| GET `/service/status` (no auth) | **200** |
| GET `/service/status` + hostile Origin | **200** |
| GET `/health` + forged Host | **200** |
| Bodies retained / Authorization used / non-GET | **no / no / no** |

Classifier: **`BRIDGE_POTENTIAL_UNAUTHENTICATED_CONTROL`**.

## Future owner gate (decision-ready; NOT executed)
Authorize **one** separately scoped notification-bridge decision for either:
1. **Containment** — stop/disable the current long-lived `127.0.0.1:17888` listener and verify no replacement autodstarts; or  
2. **Corrected-source deployment** — replace the running process with a build proven to enforce unpaired-local **401**, hostile-Origin **403**, forged-Host **403**, then re-run this read-only probe.

**Excluded from any reuse of V120:** worker/HMAC cutover, LaunchAgent install for the host worker, Docker/ngrok/proxy changes, pairing-token disclosure, Messages sends.

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
P0 live exposure evidence captured; bridge left running (no self-stop). V120 worker release untouched. Issue #8 stays open until a separately authorized containment/deploy decision. Owner Dev Proxy UAT remains independent.
