# DEVPROXY-003A engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_003A_OWNER_LOGIN_SESSION_FOUNDATION.md` at the pinned SHA. This is source-and-isolated-test evidence for CTO review. It is not a merge, a deploy, a credential rotation, or a statement that DEVPROXY-003 is finished.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-003a-session-foundation-20261101` |
| Tested CTO SHA | `e3175fd75047c3fa1c69296296b518f4fa9652ef` |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Parent source | DEVPROXY-002 `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d` |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #12 |
| Coordination | issue #9 |
| Node | v22.19.0 |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |
| Untouched drafts | PRs #2, #3, #5, #7, and #11 |

Status: **source ready, not deployed.** No product file needed a further change after the pinned tree. Live Docker listeners on 8080, 3001, and 3002, and node pid 3760 on `127.0.0.1:17888`, were not restarted. The LaunchAgent label count stayed 2. The owner `.env` was not opened.

## RED then green

The first commit on this branch, `48dedf9`, is the RED admin-session contract and does not yet contain `utils/admin-session-security.cjs`. Node 22.19.0 `node --test tests/security/admin-session-foundation.test.mjs` in that tree: 0 pass, 1 fail, exit 1, `MODULE_NOT_FOUND`.

The pinned tree, after the helper and API wiring commits, ran the same command: 8 pass, 0 fail, exit 0. `./smart-build.sh test:unit` then passed collect-docs, embeddings, the DEVPROXY-002 management-perimeter file, and the admin-session file, exit 0. `ADMIN_PASSWORD` for that unit run was process-only and was not printed. No worktree `.env` remained.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 test of `48dedf9` | 0 pass, 1 fail, missing helper | 1 |
| Node 22 `node --test tests/security/admin-session-foundation.test.mjs` at the pinned SHA | 8 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` | collect-docs, embeddings, management perimeter, admin session | 0 |
| `./smart-build.sh test:all` | BLOCKED. It still posts to the live Calliope API. | not run |

## Disposable HTTP matrix

Test-owned `utils/proxyConfigAPI.js` on `127.0.0.1:18031`. A preload forced the listen address to loopback for this process only. The product `listen(PORT)` call itself is unchanged and, run directly, does not name a host. `HOME` was temporary. The fixture password stayed in the process environment, was longer than 16 characters, and was not printed. Response bodies and the server log did not contain it (`leaks` 0, `logLeaksPassword` false). No response body contained a 64-hex token on the cache follow-up.

| Request | HTTP | Evidence |
| --- | --- | --- |
| Correct password, `Host: 127.0.0.1:18031` | 200 | `Cache-Control: no-store`. Cookie `HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`, no `Domain`, no `Secure`. Token length 64, lowercase hex. Body had `ok: true` and no token. |
| Short, 200-character, and Unicode wrong passwords | 401 | `Invalid password`. Process stayed up. |
| JSON number and object passwords | 401 | `Invalid password` |
| JSON null, missing, and empty passwords | 400 | `Password required` |
| Correct password, `Host: your-proxy.example.ngrok.app`, `X-Forwarded-Proto: http` | 200 | Cookie includes `Secure`. Forwarded proto did not remove it. |
| Correct password, loopback Host, `X-Forwarded-Proto: https` | 200 | Cookie has no `Secure`. Forwarded proto did not add it. |
| `GET /admin/check` with the loopback cookie | 200 | Session file mtime unchanged |
| Missing, partial, duplicate, tampered cookie | 401 | |
| `Authorization: Bearer` with the issued token | 200 | |
| Malformed Bearer plus a valid cookie | 401 | The bad header does not fall back to the cookie |
| `GET /devproxy/api/ai/health` | 200 | Anonymous health preserved |
| `POST /devproxy/api/ai/ask`, `GET` chat-history, `GET /api/config` | 401 | |
| `GET /admin/show-password`, `GET /.artifacts/admin-session.json`, `GET /routes.json` | 404 | |
| Protected read with `Host: evil.example`, `X-Forwarded-For: 127.0.0.1`, `X-Forwarded-Proto: https` | 401 | Those headers did not grant a session |
| `POST /admin/logout` for the public-host session | 200 | `Cache-Control: no-store`, `Max-Age=0`, `Secure`, empty token. Later check of that token is 401 |
| Same loopback token after an isolated restart | 200 | |
| That token after the file's expiry was moved into the past | 401 | |
| Malformed session file, mode 0644 | 401 | Following login rewrote a parseable file, mode `600` |
| Session path replaced by a symlink, then login | 200 | Symlink target bytes and mode `644` stayed unchanged. Replacement file was a regular file, mode `600` |

A connect to the machine's other IPv4 address on port 18031 returned `ECONNREFUSED`. After the matrix, a second process with no `ADMIN_PASSWORD` created a worktree `.env` of mode `600` (81 bytes). Its log did not contain `ADMIN_PASSWORD=`. That file and `admin-session.json` were deleted without being read. Ports 18031 and 18032 were closed.

`GET /admin/login` returned `Cache-Control: no-cache, no-store, must-revalidate`. The 401 login denial from `send()` did not set `Cache-Control`. The success login and logout responses did.

## Residual trust, left for DEVPROXY-003B

- `Secure` is decided from the request `Host`. Loopback names omit it. Every other host gets it. That is not a TLS attestation. `X-Forwarded-Proto` does not change the cookie, which is the intended non-trust of that header.
- Browser-origin CSRF, rate limits, revocation on password rotation, per-service identity, and notification-sidecar permissions were not part of this slice.
- A directly executed API process still binds whatever host Node chooses for `listen(port)` unless the operator constrains it. The disposable proof constrained the test process. The Docker listeners were not reconfigured.
- Failed login responses omit `Cache-Control`. They do not carry a session cookie.
- DEVPROXY-003 is not complete. Sensitive MCP actions were not enabled.

## Rollback

Leave the live API, nginx, ngrok, and the notification bridge alone. Revert this branch to `e3175fd75047c3fa1c69296296b518f4fa9652ef` if the receipt commit is rejected. No installed service is running this SHA.

## Unperformed

No merge, deploy, owner `.env` read, session-token print, sudo, Docker socket use, nginx reload, Messages send, `launchctl` change, public tunnel change, or edit to PRs #2, #3, #5, #7, or #11. `test:all` was not run.

## UAT

Source and disposable API check: PASS for ordinary denial of wrong-length and non-string passwords, scoped cookies, exact bearer and cookie parsing, private atomic session persistence, symlink non-follow, and the DEVPROXY-002 anonymous denials on this API. Browser UAT: **BLOCKED**. Typing the fixture password into the IDE browser would put a secret in the tool transcript. Stop for CTO review of the committed diff.
