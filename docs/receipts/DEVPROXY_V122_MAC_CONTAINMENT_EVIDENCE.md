# DEVPROXY V122 — Mac containment evidence (redacted)

## Outcome
`BRIDGE_CONTAINED_VERIFIED`

## Identity gates
| Gate | Code |
|------|------|
| Preflight #1 | `BRIDGE_CONTAINMENT_READY_MATCHED_JOB` |
| Preflight #2 (sameIdentity) | `BRIDGE_CONTAINMENT_READY_MATCHED_JOB` |
| After (≥20s absent) | `BRIDGE_CONTAINED_VERIFIED` |

## Supervisor
- Label: `com.leorami.devtunnelproxy.notifications.bridge`
- Domain: `gui/<ownerUid>`
- BEFORE: running, KeepAlive/RunAtLoad true, mapped to unique bridge listener
- AFTER: not loaded; `print-disabled` shows label **disabled** (reversible; restore requires new owner grant)

## Listener
- BEFORE: single `127.0.0.1:17888`
- AFTER: zero listeners for ≥22s; TCP connect refused

## Protected services (unchanged)
- Notifications Engine job `com.leorami.devtunnelproxy.notifications`: still running, same process start identity
- RC2 supervised host worker `--serve` with durable pin: still running; singleton lock mode `0600`
- Docker: `dev-proxy`, `dev-proxy-config-api`, `dev-ngrok` up; proxy health probes non-500

## Expected owner-visible limitation
Outgoing macOS notification delivery that depended on `POST` to the local bridge is **unavailable** until a future independently authorized secured bridge redeploy. Engine job itself was not stopped.

## Private detailed logs
Retained under `/private/tmp/v122-logs/` (not committed). No pairing tokens or credential bytes read.
