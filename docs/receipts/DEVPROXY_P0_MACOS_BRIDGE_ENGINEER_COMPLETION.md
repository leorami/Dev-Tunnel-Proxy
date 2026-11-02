# DEVPROXY P0 engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_P0_MACOS_NOTIFICATION_BRIDGE_SAFE_PAIRING.md` at the pinned SHA. This is source-and-isolated-test evidence for CTO review. It is not a merge, a deploy, a host-bridge restart, or a statement that the live Mac is already protected.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-p0-notification-bridge-auth-20261101` |
| Tested CTO SHA | `159cf7e2ca4fd6e12b338977aed7d504c62d1535` |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #11 |
| Coordination | issue #8 |
| Node | v22.19.0 (`~/.nvm/versions/node/v22.19.0/bin/node`) |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |
| Untouched drafts | PRs #2, #3, #5, and #7 |

Status: **source ready, not deployed.** Live node pid 3760 still listens on `127.0.0.1:17888`. It was not restarted, probed with the product UI, or given a token. The `launchctl` label count for `com.leorami.devtunnelproxy.notifications` was 2 before the proof and 2 after. Those labels were not printed, loaded, or unloaded.

## What failed before the fixes

The two new source assertions were RED on Node 22.19.0 before the matching edits: 0 pass, 2 fail, exit 1.

1. `POST /test` reached `sendViaMessages` without requiring `Content-Type: application/json`.
2. The status card used one unpaired message for both a stopped bridge and a bridge that had not been paired.

An earlier full-file run accidentally used Homebrew Node 25 because it came first on `PATH`. That run is not the gate. It did show two CTO assertions still failing, and those assertions were not weakened:

- Unauthenticated `GET` of a privileged path returned 405 because the method check ran before the bearer check. The contract requires 401.
- The listen `console.log` line contained the substring `BRIDGE_TOKEN`, which the storage assertion forbids.

## Source diff after the CTO SHA

1. `macos/notifications-bridge-auth.cjs`: privileged routes check the bearer before the method. A wrong verb cannot skip authentication. `/health` is unchanged.
2. `macos/notifications-bridge.js`: `POST /test` returns 415 unless the content type is `application/json`, and that check is before `readBody` and `sendViaMessages`. An oversized body pauses the request and rejects with status 413 so the handler can finish the response. The listen log names the token location without putting `BRIDGE_TOKEN` on the `console.log` line.
3. `status/status.html`: `probeBridgeHealth` calls `GET /health` with no `Authorization`. A failed probe says the bridge is not running and the chip is not a pair button. A live bridge with no tab credential says it is not yet paired and shows `Pair Bridge`, which prompts only on click.
4. `tests/security/notification-bridge-authorization.test.mjs`: the two RED assertions above. Existing 401, Host, Origin, preflight, and storage assertions are unchanged.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 `node --test` of the two new assertions before the edits | 0 pass, 2 fail | 1 |
| Node 22 `node --test tests/security/notification-bridge-authorization.test.mjs` after the edits | 10 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` on the same tree (Node 22.19.0) | collect-docs passed, embeddings passed, bridge authorization passed | 0 |
| `./smart-build.sh test:all` | BLOCKED. It still POSTs to the live Calliope API. | not run |

The unit run set `ADMIN_PASSWORD` in the process environment so collect-docs would not write a worktree `.env`. That value was not printed. No `.env` remained in the worktree. The owner `.env` was not read.

## Disposable wire proof

Test-owned process only. `HOME` was a temporary directory, deleted afterward. Listen port was `17991`, not `17888`. Pairing used a 32-byte fixture in `NOTIF_BRIDGE_TOKEN`. The process log said `configured environment` and did not contain the fixture. A preload replaced `child_process.spawnSync` and `execSync` for `osascript` and `launchctl` before the bridge loaded. The mock log is the only record of those calls.

| Request | HTTP | Notes |
| --- | --- | --- |
| `POST /service/install` with no bearer | 401 | `BRIDGE_AUTH_REQUIRED`; no mock call |
| `POST /test` JSON with no bearer | 401 | no mock call |
| `GET /service/status` with no bearer | 401 | no mock call |
| `GET /service/status` with `Host: evil.example` and a correct bearer | 403 | raw HTTP, because `fetch` will not set `Host` |
| `POST /test` with `Origin: https://evil.example` and a correct bearer | 403 | `BRIDGE_ORIGIN_DENIED` |
| `OPTIONS /service/install` from `http://127.0.0.1:8080` | 204 | `Access-Control-Allow-Origin` was that exact origin; `Access-Control-Allow-Private-Network: true` |
| `POST /service/install` from that same origin with no bearer | 401 | preflight did not grant the action |
| Wrong bearer on `GET /service/status` | 401 | |
| `GET /health` | 200 | anonymous |
| `POST /test` with `Content-Type: text/plain` and a correct bearer | 415 | no `osascript` mock call |
| `POST /test` JSON larger than 64 KiB with a correct bearer | 413 | `Request too large` |
| `GET /service/status` with the fixture bearer | 200 | |
| `POST /service/install` with the fixture bearer | 200 | mock `launchctl unload`, `load`, and `list` only |
| `POST /service/uninstall` with the fixture bearer | 200 | mock `launchctl unload` only |
| `POST /test` JSON with the fixture bearer | 200 | mock `/usr/bin/osascript` once; recipient was `fixture-recipient` |

A TCP connect to the machine's non-loopback IPv4 address on port 17991 returned `ECONNREFUSED`. The process log reported `http://127.0.0.1:17991`. No response body contained the fixture (`secretInBody` 0).

A second process, with no `NOTIF_BRIDGE_TOKEN`, used another temporary `HOME` and port `17992`. The token file mode was `600`, the directory mode was `700`, and the file was 65 bytes. The log had no 32-or-more hex run, and the file contents were not read. A third process with a short `NOTIF_BRIDGE_TOKEN` exited 1 before listen. Its stderr named the 32-character minimum and did not repeat the short value. Both temporary homes were removed. Ports 17991 and 17992 were closed. Pid 3760 and the label count were unchanged.

## Pairing storage

The bridge credential key is `devproxy-notifications-pairing-tab` in `sessionStorage`. The prompt runs only when the Pair chip is clicked. `authorizedBridgeFetch` checks the endpoint origin against `NOTIF_BRIDGE_BASE` and clears that session key on 401 or 403. `NOTIF_BRIDGE_BASE` stays the fixed local URL on port 17888. Other `localStorage` keys in the page are theme, preferences, and notification-routing state, not the bridge bearer. Browser UAT is **BLOCKED**: loading `status.html` would call the live bridge, and typing even a fixture bearer into the IDE browser would put a secret in the tool transcript.

Remote ngrok origins are not in the default allow set. Extra origins come only from exact `https` values in `NOTIF_BRIDGE_ALLOWED_ORIGINS`. A private-network preflight header is not authorization.

## Remaining limits

- A bearer in `sessionStorage` is not an XSS boundary.
- `launchctl` is still a shell string, and Messages.app is still `/usr/bin/osascript`. The mock proved those calls can be intercepted in a test process. It did not change the live wrappers.
- This pairing does not authorize a remote ChatGPT session.
- The live bridge on port 17888 is still the process that was already running. Source checks do not protect that process until an owner-authorized rollout replaces it.
- DEVPROXY-003 and DEVPROXY-004 remain the places for session, CSRF, and Docker-socket work. Those branches were not edited.

## Rollback

Leave pid 3760 and the existing LaunchAgents alone. Revert `cto/devproxy-p0-notification-bridge-auth-20261101` to `159cf7e2ca4fd6e12b338977aed7d504c62d1535` if this diff is rejected. Do not restart the host bridge as part of that revert.

## Unperformed

No merge, deploy, ngrok origin change, credential rotation, live Messages send, real `launchctl` load or unload, owner token read, owner `.env` read, or edit to PRs #2, #3, #5, or #7. `test:all` was not run. Browser UAT was not run.

## UAT

Source and disposable-process check: PASS for anonymous denial before handlers, Host and Origin denial, preflight without an authorization grant, wrong bearer, anonymous health, non-loopback refusal, content-type and size denial, owner-only token file mode, and mocked authorized actions with zero live LaunchAgent or Messages side effects. Owner Mac UAT: not run, because this was not installed. Stop for CTO review of the committed diff.
