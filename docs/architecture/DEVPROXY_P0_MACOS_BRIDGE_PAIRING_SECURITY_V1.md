# DevProxy P0 — macOS Notifications Bridge pairing and browser-origin policy

**CTO SOURCE ONLY / NOT DEPLOYED / NOT NATIVE TESTED / NOT AN ENGINEER ASSIGNMENT.** Parent [P0 issue #8](https://github.com/leorami/Dev-Tunnel-Proxy/issues/8). Developed independently while the one primary Engineer-I works active DEVPROXY-002 issue #6 and draft PR #7. Based solely on protected `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` to avoid overlap.

## Threat / before

The macOS bridge listens only at `127.0.0.1:17888`, but it used `Access-Control-Allow-Origin: *` and accepted unauthenticated `POST /test` (Messages.app texts), `POST /service/install`, and `POST /service/uninstall` (macOS LaunchAgent state). The browser UI called these with no proof of local owner authorization. Browser origin and loopback reachability are different trust boundaries. Do NOT demonstrate exploit against owner's actual Messages or LaunchAgents.

## Proposed, bounded change

- `macos/notifications-bridge-auth.cjs`: a **pure, testable** Host, exact Origin and bearer authorization guard with strict method/route allowlist. Only a minimal GET /health is unauthenticated; no sensitive status or OS action without a correct bearer. A successful preflight is **not** an authorization grant.
- `macos/notifications-bridge.js`: defense executes BEFORE any OS function; no wildcard CORS or reflected origins, explicit secure CORS headers for configured first-party origins, no-store responses, capped input size. Listens only on 127.0.0.1. A strong random 64-hex pairing token is created on first launch, in `~/Library/Application Support/Dev Tunnel Proxy/notification-bridge.token`, inside owner-private mode 0700 directory as owner-only mode 0600 file; never served over HTTP and not under `.artifacts`. Existing token persisted across relaunches. Operator may alternatively set a strong `NOTIF_BRIDGE_TOKEN` environment secret (>=32 chars).
- `status/status.html`: an explicit **Pair Bridge** action after a status request cannot authenticate. User looks up token **locally on the Mac** and enters it into the browser prompt. Tab-scoped `sessionStorage` only; never into `localStorage`, URLs, GitHub issues, telemetry or public HTML. Authenticated header added to status, install/uninstall and test-send. Failed pairing clears tab token. Browser uses fixed local bridge endpoint, no arbitrary URL.
- Local first-party origins recognized by default: `http://localhost`, `http://127.0.0.1`, those hosts at :8080, `https://localhost`, `https://127.0.0.1`, those hosts at :8443. External nginx/ngrok UI origins must be **opted in** using `NOTIF_BRIDGE_ALLOWED_ORIGINS=https://exact-host.example` on the bridge process; only exact HTTPS origins, never wildcard/suffix, and only if the owner understands the browser on the same Mac can reach that bridge. Do NOT automatically trust a request just because it came through a private Docker address or browser PNA.
- Safe unit suite `tests/security/notification-bridge-authorization.test.mjs` committed RED-first before the guard and indexed from canonical `./smart-build.sh test:unit`. No actual LaunchAgent/message is sent by the unit suite.

## Known limits / acceptance gates

This is an early fail-closed proposal, **not yet a completed security product**. A bearer stored in per-tab web storage assumes trusted first-party UI JavaScript; browser XSS/third-party scripts and compromised machine remain threats. The existing bridge still uses shell-wrapped LaunchAgent commands (fixed local paths) and AppleScript; DEVPROXY-003/004 must narrow authority and audit with one-use server-owned grants. Pairing does not create authenticated remote Cloud ChatGPT app access.

Before any release, one primary Engineer after DEVPROXY-002 returns must:
1. Review exact pinned source, preserve owner dirty files and live bridge/service; independent versioned branch.
2. Execute Node 22 security suite and canonical non-destructive unit suite, capture exit codes and RED/GREEN evidence.
3. Exercise disposable test-only bridge process with mocked `osascript`, LaunchAgent and fs side effects. Verify 401/no effects for anonymous, wrong bearer and methods; 403 for hostile Origin, bad Host, invalid private-network preflight, plus correct first-party UI flow after explicit local pairing; no calls to real Messages.app/launchctl.
4. Confirm `NOTIF_BRIDGE_ALLOWED_ORIGINS` exact HTTPS configuration, 0600 token creation and recovery behavior on Mac under disposable home dir, no secret in logs; signed-in status UI desktop/remote compatibility when authorized, and no prompt spam.
5. Verify no changes to working live nginx/ngrok/notification LaunchAgents, no admin password reads or real text sends. Inspect UI regressions for status panel; test no more than supported browsers.
6. Return one committed receipt containing exact tested SHA, commands/exits, UAT screenshots (no token displayed), guard negative matrix, blocked conditions, backout path. Stop for CTO code review and owner authorization before live rollout.

**Owner-facing impact:** The bridge will require one explicit browser-tab pairing; it intentionally stops anonymous status and notification operations. No existing process is restarted or reconfigured by committing this draft. If live exposure is confirmed, owner must approve emergency operational containment separately.
