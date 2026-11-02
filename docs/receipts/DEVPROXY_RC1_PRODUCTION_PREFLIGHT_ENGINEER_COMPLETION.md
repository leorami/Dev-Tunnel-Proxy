# DEVPROXY-SEC-RC1 preflight engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_RC1_PRODUCTION_PREFLIGHT_OWNER_GATE.md` at the pinned SHA. This proves a disposable production package. It does not install it.

**Owner recommendation: NO-GO.**

Source is validated and a disposable package can start with the Brotli modules. The installed proxy was not switched. The public ingress plan and the route baseline were not validated, and the production Compose file still uses the live container names, the external `devproxy` network, and host ports 8080 and 443. Running it, or running `scripts/switch-to-production.sh`, would take over the installation. That was not done.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-rc1-production-packaging-20261101` |
| Tested CTO SHA | `d8b6d0590a0952389ed6d497e53066ac6c6bb739` |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Parent RC1 | `003f2358bf4e248d58c5963e160c2023f04aff23` on draft PR #15, still unmerged |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #18 |
| Coordination | issue #17 |
| Node for the unit gate | v22.19.0 |
| API image under test | `node:18-alpine`, process reported v18.20.8 |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

Draft PRs #2, #3, #5, #7, #11, #12, #13, #15, and #16 were not edited. No product source needed a further change after the pinned tree.

## What is validated, and what is not

| Layer | State |
| --- | --- |
| Source | Validated. Packaging contract 4/4 and the six security suites in `test:unit` passed. |
| Deployable package | Proven only as a disposable Compose build and a separately named runtime. Not installed. |
| Installed proxy | Unchanged. Rollback image is the image already running, recorded below. |
| Public ingress and route baseline | Unknown. Not inspected and not changed. |

## Gate results

| Gate | Result |
| --- | --- |
| A Protected state | PASS. No second Engineer was executing. Issue #14's latest record is CTO conditional source acceptance and a release hold. |
| B RED then green | PASS. |
| C Compose package | PASS for the disposable build. The production file itself was not started. |
| D Node 18 and switch config | PASS for request parity on `node:18-alpine`. The switch script was not executed. Its merged config was rendered with Compose. |
| E Owner decision | NO-GO. |
| F Return | This receipt. |

## RED then green

Historical commit `433249078077aa0de5bc92795a550e024f6d6a97` under Node 22.19.0: `node --test tests/security/production-packaging-gate.test.mjs` was 1 pass, 3 fail, exit 1. The production proxy service was still `image: nginx:1.25-alpine`.

Pinned tree, same command: 4 pass, 0 fail, exit 0. `./smart-build.sh test:unit` then passed collect-docs (23), embeddings (7), perimeter (10), admin session (9), Mac bridge (10), login return (3), RC1 integration (5), and production packaging (4). Exit 0. `ADMIN_PASSWORD` was process-only and was not printed. No worktree `.env` remained. `test:all` was not run. It still calls `localhost:3001`.

## Compose declaration

`docker compose -f docker-compose.production.yml config` was rendered with fixture environment values that were not printed. The safe extract was:

| Field | Value |
| --- | --- |
| `proxy.build` | context is this tree, dockerfile `Dockerfile` |
| `proxy.image` | unset |
| `proxy.container_name` | `dev-proxy` |
| proxy published ports | 8080 and 443, with no host IP |
| `proxy-config-api.image` | `node:18-alpine` |
| API published ports | `127.0.0.1:3001` and `127.0.0.1:3002` |
| network | external name `devproxy` |

Because those names and ports belong to the installation, this file was not passed to `up`.

The image was built with `docker compose -p rc1preflightpack -f docker-compose.production.yml build proxy`. Compose named it `rc1preflightpack-proxy:latest`. Image id `sha256:693d99872b2a263caf5a611165a1b7c62e11b055d49a0806934adeb14ae57cb7`. Both `ngx_http_brotli_filter_module.so` and `ngx_http_brotli_static_module.so` are in that image. `nginx -t` with `config/nginx.production.conf` and `config/default.production.conf` inside that image exited 0. A one-host alias supplied the upstream name for the syntax test. The live proxy image was not replaced.

## Disposable runtime

Containers `rc1preflight-nginx` and `rc1preflight-api18` used a private network, not `devproxy`. Nginx was the Compose-built image and published only `127.0.0.1:18083`. The API was `node:18-alpine` and published only `127.0.0.1:18084`. No Docker socket was mounted. The fixture password stayed in an env file and was not printed. Response bodies did not contain it (`leaks` 0). The session file mode was `600`. The containers and network were removed. Ports 18083 and 18084 are closed.

| Request | HTTP |
| --- | --- |
| `GET /health.json` with `Accept-Encoding: br` | 200, `Content-Encoding: br` |
| Correct loopback login | 200. Host-only `HttpOnly; SameSite=Strict` cookie, no `Domain`, no `Secure`, 64-hex token. |
| Short and Unicode wrong passwords | 401 `Invalid password` |
| Valid cookie plus `Origin: https://evil.invalid` | 403 |
| Same-origin cookie read of chat history | 200 |
| Anonymous `POST /devproxy/api/ai/ask` | 302 to `/admin/login` |
| `/.artifacts/admin-session.json` and `/admin/show-password` | 404 |
| `/rc1-app-fixture` | 200 |
| `/dashboard/` with the cookie | 200 |
| Logout, then `/status` with the old cookie | 200 with `Max-Age=0`, then 302 |
| Direct `GET /devproxy/api/ai/health` on the Node 18 process | 200 |

The running nginx container's image id matched the Compose build id above. Node inside the API container reported `v18.20.8`.

The production Compose command also installs a Docker CLI, mounts the host socket, and starts `notificationsAPI.js`. Those were not reproduced. Mounting the socket would have given the fixture the host Docker daemon. Request parity on the declared Node 18 image is PASS. Socket self-heal parity was not run.

## Switch script, not executed

`scripts/switch-to-production.sh` still contains `docker-compose down` and was not run. Its override document was extracted and passed to `docker compose config` beside `docker-compose.yml`.

| Render | Proxy build | Production nginx mount |
| --- | --- | --- |
| `docker-compose.yml` plus the script's override | `Dockerfile` | `nginx.production.conf` is present |
| `docker-compose.yml` alone | `Dockerfile` | `nginx.production.conf` is absent |

That is the bug the override line fixes. The script remains a live mode switch.

## Browser

Headless Chrome, not the owner's IDE tab, opened the disposable login page. Logged out, `redirect=https://malicious.invalid` at 1280px and `redirect=//malicious.invalid` at 390px both stayed on the login URL and computed `/status`. After a fixture login the hostile redirect landed on `http://127.0.0.1:18083/status`. Login status 200. Console exceptions 0. No request to port 17888 was intercepted, and the notifications card did not render in that headless session. Screenshot: `docs/receipts/preflight-browser/signed-in-status.png`. The apps panel shows an HTTP 404 because this fixture has no generated route inventory.

## Installed baseline and rollback

Read-only image ids, with no environment dump:

| Container | Image reference | Image id |
| --- | --- | --- |
| `dev-proxy` | `dev-tunnel-proxy-proxy` | `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| `dev-proxy-config-api` | `node:18-alpine` | `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` |
| `dev-ngrok` | `ngrok/ngrok:latest` | not expanded |

Those ids are the rollback targets only if they are kept. This sprint did not retag or save them anywhere else. Live listeners were still pid 3787 on 8080 and pid 3760 on `127.0.0.1:17888`. The LaunchAgent label count stayed 2.

## NO-GO

Do not merge, do not run `scripts/switch-to-production.sh`, and do not `docker compose up` the production file. Before a later GO, the owner needs a saved copy of the running image ids above, a route baseline taken from the installed proxy, and a public-ingress check plan. This assignment does not authorize any of that.

## Unperformed

No mode switch, no live compose up or down, no nginx reload, no ngrok change, no Docker socket mount, no Messages send, no `launchctl` change, no credential rotation, and no read of the owner `.env`, session file, `.certs/dev.key`, or bridge token.
