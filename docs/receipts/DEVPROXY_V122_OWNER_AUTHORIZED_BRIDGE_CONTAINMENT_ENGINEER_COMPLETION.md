# DEVPROXY V122 — Engineer completion (OWNER-AUTHORIZED bridge-only containment)

## Outcome
**`BRIDGE_CONTAINED_VERIFIED`**

## Lifecycle
- STARTED: PR #79 comment #6718690748
- Parent tip: `engineer/devproxy-rc2-controlled-release-20261104@4af0bbfea96fed5678facb7373c1a00de664bdc2` (V121)
- Handoff: `cto/devproxy-v122-authorized-bridge-only-containment-20261107@ccebbfbce9845cf63704ddf784cca9e5289a7a66`
- Owner grant: issue #8 comment #6715302804 (one-time bridge-only; not asked again)
- Specialist status: **NOT_SPAWNED**

## Source integrated (exact CTO blobs)
| Path | Git blob SHA1 |
|------|----------------|
| `utils/notification-bridge-containment-policy.cjs` | `cd20524d3849665b2efa56861d3984c4b2866615` |
| `tests/security/notification-bridge-containment-policy.test.cjs` | `19494ed4e5035850ee676294a88f77f81f49a011` |
| `docs/architecture/DEVPROXY_V122_OWNER_AUTHORIZED_BRIDGE_CONTAINMENT.md` | (CTO import) |
| `docs/handoffs/DEVPROXY_V122_OWNER_AUTHORIZED_BRIDGE_CONTAINMENT.md` | (CTO import) |
| `smart-build.sh` | ONE narrow unit hook for containment policy test |

## Native tests (owner Mac, Node 22.19.0)
- `node --check utils/notification-bridge-containment-policy.cjs` → OK
- focused `notification-bridge-containment-policy.test.cjs` → **8/8 PASS**
- `./smart-build.sh test:unit` → **exit 0** (containment hook green)

## Live containment (redacted)
### BEFORE
- Exactly **one** loopback listener `127.0.0.1:17888` (no wildcard/extra)
- Process identity: Node + `.../macos/notifications-bridge.js`, owner UID match
- Supervisor: **MATCHED_BRIDGE_JOB** `gui/<uid>/com.leorami.devtunnelproxy.notifications.bridge` (pid maps 1:1)
- Policy keys only: `RunAtLoad=true`, `KeepAlive=true` → auto-restart risk → reversible disable required
- Distinct Notifications Engine job/process preserved identity recorded
- Distinct RC2 supervised Mac host worker + `0600` singleton lock recorded
- Preflight #1: `BRIDGE_CONTAINMENT_READY_MATCHED_JOB` / `BOOTOUT_EXACT_BRIDGE_JOB_THEN_RECHECK`
- Preflight #2 (reobserve + earlier snapshot): same READY code (identity stable)

### ACTION (authorized only)
1. Private rollback record of original enabled/KeepAlive/RunAtLoad (0700/0600 private log; not published)
2. `launchctl disable` **only** exact bridge label in per-user `gui/<uid>` domain
3. `launchctl bootout` **only** that exact bridge job
4. Port clear immediately; original bridge PID exited; **no SIGTERM needed**; **no SIGKILL**

### AFTER
- `0` listeners on 17888 for **≥22s** continuous monitor; job remains **disabled**; no auto-respawn
- `evaluateBridgeContainmentAfter` → **`BRIDGE_CONTAINED_VERIFIED`**
- Connection to `127.0.0.1:17888` **refused** (health + `/service/status` GET only; no privileged POST/secret)
- Notifications Engine process/job **unchanged** (still running)
- RC2 Mac host worker **unchanged**; singleton lock still `0600`
- `dev-proxy`, `dev-proxy-config-api`, `dev-ngrok` containers unchanged; HTTPS/local proxy health still responding
- Outgoing notification delivery via bridge deliberately **unavailable** (expected authorized impact)

## Unauthorized actions NOT PERFORMED
- SIGKILL / pkill / killall
- Global launchctl reset/remove; plist deletion
- Notifications Engine stop/restart
- RC2 worker stop / LaunchAgent install / V120 grant reuse
- Bridge source deploy / `/service/install|uninstall` / Messages `/test`
- Pairing token / HMAC change
- Docker / ngrok / proxy / API / app / route mutation
- Master merge; PR #127 incorporation; new secured bridge redeploy

## Private artifacts (local only)
- `/private/tmp/v122-logs/` — before/action/after evidence + `bridge-job-rollback-private.json` (0600)
