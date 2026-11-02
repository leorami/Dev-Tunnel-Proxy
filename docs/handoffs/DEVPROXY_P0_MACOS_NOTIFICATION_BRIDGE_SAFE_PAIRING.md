# DevProxy P0 — secure macOS Notifications Bridge without live OS actions

## Goal / contract gate

A malicious website or anonymous local process **cannot** send Messages.app texts, install/uninstall LaunchAgents or read bridge service state. Only a **verified owner-paired browser tab or operator holding a strong locally provisioned credential** can request bounded actions. Preserve legitimate owner notifications UI. This is source-and-isolated-test implementation only, not approval to change macOS services, tunnel, proxy or credentials.

## Exact repository / immutable execution

- Repository: `leorami/Dev-Tunnel-Proxy`.
- Parent `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`.
- **Execution SHA is solely the exact 40-character SHA in Cursor's instruction** on `cto/devproxy-p0-notification-bridge-auth-20261101`. Never chase moving branch tips.
- [Source issue #8](https://github.com/leorami/Dev-Tunnel-Proxy/issues/8), [proposed security canon](../architecture/DEVPROXY_P0_MACOS_BRIDGE_PAIRING_SECURITY_V1.md). DEVPROXY-002 finished Engineer RETURNED on issue #6, draft PR #7 `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d`, and is still NOT DEPLOYED. Do not edit/restart the DEVPROXY-002 work or any existing service. Shared MCP draft PRs #2/#3/#5 untouched.
- One existing primary Cursor Engineer-I only, no duplicates or speculative specialists. Source branch contains RED-first tests before implementation; CTO checked syntactic parse via JS and UI source invariants, but **did not execute native Node, macOS UI, Messages or service integration tests**.

## Direct CTO work already prepared (do not repeat)

1. Created `tests/security/notification-bridge-authorization.test.mjs` RED first. Pure denial tests for anonymous privileged commands, invalid bearer, exact `Host`, evil Origin/CORS, preflight isolation, unsupported methods, default origin and source secret storage.
2. Added `macos/notifications-bridge-auth.cjs` as pure default-deny policy. `macos/notifications-bridge.js` now applies it *before* any OS actions; CORS no longer wildcard, sends no caching, limits payload, accepts only loopback listener and strong bearer for privileged endpoints. First run generates owner-only token under `~/Library/Application Support/Dev Tunnel Proxy/notification-bridge.token` (not `.artifacts`), or uses secure `NOTIF_BRIDGE_TOKEN` env value.
3. Updated `status/status.html` to display **Pair Bridge** when not paired, prompt owner for a token via browser UI only upon explicit click, keep pairing in tab-scoped `sessionStorage`, send Authorization only to fixed bridge origin, and clear denied pairing. All direct bridge `fetch` calls replaced.
4. Hooked safe pure tests into `./smart-build.sh test:unit`; documented [security/pairing](../architecture/DEVPROXY_P0_MACOS_BRIDGE_PAIRING_SECURITY_V1.md) and README.
5. Maintained isolated branch based on master to avoid active security/perimeter branch overlap. No macOS operator service was touched.

## Engineer-I mini-sprint

**Gate A — source & environment truth.** Recheck issue #8, issue #6, PR #7 and latest master/branch SHA; inspect local dirty files and active Cursor assignment. If another primary assignment is genuinely underway, do not start a second one. Work in an isolated test worktree; no blanket stash/reset/clean. Protect currently installed LaunchAgents, live port 17888, Messages, ngrok, nginx, Docker, and owner secrets.

**Gate B — RED/GREEN and review.** Independently read every changed file, including the browser calls and exact headers. Under Node 22, run `node --test tests/security/notification-bridge-authorization.test.mjs` and canonical `./smart-build.sh test:unit` with exact exits. Verify no test starts the real bridge or sends real messages; use pure-policy assertions only. Add RED test before any fix and document failures. Check strict syntactic correctness, malformed secret handling, timing-safe compare, Host/Origin method checks, PNA and Chrome/Safari compatibility caveats. If source-only catches fail, repair without weakening assertions.

**Gate C — disposable wire proof, never live OS.** Test the bridge against a **test-owned service** on a free nonproduction loopback port and temporary disposable HOME, with injected/mocked `launchctl`, AppleScript and writes if exercising permitted endpoints. If safe deterministic mocks cannot be established, restrict to pure policy/negative gates and mark live action integration BLOCKED. Never send a real text or execute a LaunchAgent action. Demonstrate actual anonymous 401/403 before any handler, wrong Host and Origin 403, exact allowed origin+CORS preflight 204 without granting action authorization, wrong bearer 401, healthy read, nonloopback refusal, invalid content type/oversized body denied, and token file 0600 under a private folder; no token content or owner logs printed.

**Gate D — owner UI and pairing.** Verify 320px/desktop macOS status card correctly distinguishes "not running" vs "not yet paired"; UI has an explicit Pair action and no auto-prompt loop. Test a paired browser tab using fake fixture credential, confirm credential goes only to trusted bridge URL, not URL/log/localStorage, and tab-close clears it. Verify authorized local status/install/uninstall/test UX via mocked actions only. For remote ngrok origin, require exact configured trusted HTTPS `NOTIF_BRIDGE_ALLOWED_ORIGINS`; never auto-allow `*` or treat private browser-network status as real authorization. If browser is unavailable or secret would enter tool transcript, mark browser UAT BLOCKED, do not impersonate completion.

**Gate E — review/return.** Run safe canonical tests; `test:all` remains BLOCKED if it performs mutating live AI calls. Record exact tested product SHA and one committed `docs/receipts/DEVPROXY_P0_MACOS_BRIDGE_ENGINEER_COMPLETION.md`, with negative matrix, real command exits, proof of zero Messages/LaunchAgent side effects, cookie/session/pairing storage, remaining bugs, diff, trusted local owner UAT state, rollback and owner checkout protection. Genuine STARTED→IMPLEMENTING→VERIFYING→RETURNED in issue #8 with GitHub readback. STOP for CTO code-read of committed diff and owner-only merge/rollout authorization.

## Prohibited

No sending Messages.app traffic or disclosing phone numbers; no real LaunchAgent start/stop/install/uninstall; no accessing user's secret token or private .env; no silent setting of ngrok allowed origin; no host process restart, protected main merge, production tunnel, global permission grant, credential rotation, or cross-project source writes. Source-only safety checks are not a declaration that the live Mac is protected. Only one primary Engineer.
