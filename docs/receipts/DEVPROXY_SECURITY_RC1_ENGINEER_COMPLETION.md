# DEVPROXY-SEC-RC1 engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_SECURITY_RC1_INTEGRATED_OWNER_GATE.md` at the pinned SHA. This is one integrated source candidate plus disposable proof. It is not a merge, a deploy, or a statement that the running proxy is already protected.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-security-rc1-integrated-20261101` |
| Tested CTO SHA | `47d96efd88c796759dd8d8e68e6b47e980a3fd6e` |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #15 |
| Coordination | issue #14 |
| Node | v22.19.0 |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

Parents, compared by git blob and left unmerged:

| Protection | Source SHA | Blob check |
| --- | --- | --- |
| DEVPROXY-002 perimeter | `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d` | `config/default.conf`, `config/default.production.conf`, and the perimeter test match |
| DEVPROXY-003A sessions | `341de493674b2ad8f5b60a4da4ebb102cd1a6553` | session helper, API, and session test matched before the origin repair below |
| P0 Mac bridge | `92e0d2105f9b0afddc7abcaaf3f6fe37bfd3ec39` | bridge, status page, bridge test, and pairing note match |
| 003B login return | `25c6dbd2b801ce8b8a48ae9ba87592e1b7d6eb7d` | login policy, login page, redirect test, and architecture note match |

Draft PRs #2, #3, #5, #7, #11, #12, and #13 were not edited.

## Gate results

| Gate | Result |
| --- | --- |
| 0 Status and privacy | PASS. No second Engineer was executing. Owner `.env`, live session file, bridge token, chat history, and private key were not opened. |
| 1 RED then native green | PASS. See commands. One in-scope origin defect was red, then fixed. |
| 2 Disposable nginx and API | PASS on the project brotli image. Details below. |
| 3 Login browser and Mac mock | PASS for the disposable login journey and the mocked bridge. The product status page's bridge calls toward port 17888 were failed inside the test browser. |
| 4 `test:all` and release | `test:all` BLOCKED. It curls `localhost:3001`, which is the live API. Release syntax was the disposable `nginx -t`, not a live rollout. |
| 5 Return | This receipt. Stop for CTO review. |

## RED then green

Historical integration commit `6765f20d87b84b6d893bf78800c6130855c2fae4` under Node 22.19.0: `node --test tests/security/security-release-integration.test.mjs` was 1 pass, 4 fail, exit 1. The Mac and login modules were not in that tree yet.

Pinned tree before the origin repair, same Node, the five security files together: 36 pass, 0 fail, exit 0. `./smart-build.sh test:unit` exit 0.

A disposable request then showed a real gap: a valid session cookie plus `Origin: https://evil.invalid` still read chat history. New assertions were run first and failed (the helper export was missing, and a later case failed when nginx's `$host` has no port). After the repair:

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 five security files | 37 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` | collect-docs, embeddings, perimeter, sessions, bridge, login return, integration | 0 |
| `./smart-build.sh test:all` | BLOCKED | not run |

The repair is `adminRequestOriginAllowed`. An absent Origin still works, so nginx `auth_request` and non-browser clients keep functioning. A presented Origin must share the request hostname. When the Host header includes a port, that port must match. A hostile Origin on login, logout, `/admin/check`, or a protected route is HTTP 403 and does not use the cookie. This is not a TLS check. `Secure` still follows the Host name, and `X-Forwarded-Proto` still does not add or remove it.

## Disposable nginx and API

Image `devproxy-rc1-nginx:disposable` was built from the repo `Dockerfile` at this tree. It contains `ngx_http_brotli_filter_module.so` and `ngx_http_brotli_static_module.so`. It was not swapped onto the live proxy.

| Check | Exit |
| --- | --- |
| `nginx -t` with `config/nginx.production.conf` and `config/default.production.conf` on that image | 0. The first attempt failed only because `dev-proxy-config-api` did not resolve; `--add-host` made the name resolvable for the syntax test. Brotli had already loaded before that DNS error. |
| `nginx -t` with `config/default.conf` on the same image | 0 |

The running pair was container `rc1-api` (`node:22-alpine`, no Docker socket, process-only password) and `rc1-nginx` published only at `127.0.0.1:18080`. A fixture app location returned its own body. Fixture certificate files were generated for the test and were not the repo `.certs` key. No password or private marker appeared in response bodies (`leaks` 0). The API log did not contain the password. The session file inside the API container was mode `600`.

| Request | HTTP |
| --- | --- |
| Correct loopback login | 200. Cookie `HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`, no `Domain`, no `Secure`, 64-hex token. |
| Correct login, public Host, `X-Forwarded-Proto: http` | 200. Cookie includes `Secure`. |
| Short, Unicode, and 180-character wrong passwords | 401 `Invalid password` |
| Same-origin and absent-Origin login after the repair | 200 |
| Hostile Origin login, and hostile Origin with a valid cookie | 403 |
| Same-origin cookie read of chat history | 200 |
| `/status`, `/reports`, `/.artifacts/reports/health-latest.json`, `/routes.json` with the cookie | 200 |
| `/dashboard` | 301 to `/dashboard/`, then 200 |
| `POST /devproxy/api/settings/auto-scan` `{enabled:false, intervalSeconds:30}` | 200. The file in the test worktree recorded those values. |
| `/health.json` and `GET /devproxy/api/ai/health` | 200 fixture/minimal JSON |
| `/.artifacts/admin-session.json`, `/admin/show-password` | 404. Private marker not returned. |
| Anonymous ask, chat history, promotions, reindex, notifications | 302 `/admin/login?redirect=...` |
| Anonymous `/api/config` through nginx | 404 |
| Anonymous `/api/config` on the API itself | 302 to the login page |
| `/rc1-app-fixture` | 200 `fixture-app` |
| `/status` with `Host: evil.example` and forwarded loopback headers | 302 login |
| Bad cookie | 302 login |
| `/nginx_status` from the published host port | 403 |
| `/nginx_status` from inside the nginx container to `127.0.0.1` | 200 |
| Logout | 200, `Max-Age=0`. Later `/status` with the old cookie is 302. |

`Host` selected the cookie `Secure` flag. That is not proof the connection was TLS. The disposable browser used plain HTTP on loopback.

## Browser and Mac

Headless Chrome, separate from the owner's IDE tab, opened the disposable login page.

| Journey | Observation |
| --- | --- |
| Logged out, `redirect=https://malicious.invalid`, 1280px | Stayed on the login URL. Computed destination `/status`. Policy script loaded. |
| Logged out, `redirect=//malicious.invalid`, 390px | Stayed on the login URL. Computed destination `/status`. |
| Logged out, `redirect=/reports` | Computed destination `/reports`. |
| Logged in, hostile redirect | Final URL `http://127.0.0.1:18080/status`. Login response 200. |
| Logged in, `redirect=/dashboard`, 390px | Final path `/dashboard/`. |
| Console exceptions | 0 |
| Status card | "Notifications bridge is not running" and a non-prompting Not running chip. |

Two browser requests toward port 17888 were failed in the test browser before they could use the live bridge. Live node pid 3760 was still the listener afterward. Screenshots with no credential visible: `docs/receipts/rc1-browser/signed-in-status-desktop.png` and `docs/receipts/rc1-browser/signed-in-narrow.png`.

Mocked bridge on `127.0.0.1:18091` with a temporary home: anonymous install 401, hostile Origin 403, hostile Host 403, allowed-origin preflight 204, following unauthenticated POST 401, paired status/install/uninstall/test 200. Mock log recorded `launchctl` and `/usr/bin/osascript` only for the authorized fixture calls. LaunchAgent label count stayed 2. The fixture token was not in the log.

## Rollback

The disposable containers and network were removed. Port 18080 is closed. Do not restart the live proxy, API, ngrok, or the bridge as part of accepting or rejecting this branch. If the diff is rejected, revert `cto/devproxy-security-rc1-integrated-20261101` to `47d96efd88c796759dd8d8e68e6b47e980a3fd6e`. Nothing installed is running this SHA.

## Unperformed

No merge, deploy, live nginx reload, ngrok change, Docker socket mount, Messages send, real `launchctl` load or unload, credential rotation, or public `/mcp` exposure. `test:all` was not run. Owner Mac pairing of the real bridge was not performed.

## UAT

Disposable nginx, API, headless Chrome, and mocked Mac checks: PASS for the matrix above. Installed-proxy UAT: not run. The owner still has to authorize any rollout. Stop for CTO review of the committed diff.
