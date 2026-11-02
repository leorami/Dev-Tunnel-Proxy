# DEVPROXY-002 engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_002_PUBLIC_SECURITY_PERIMETER_HANDOFF.md`. This is source-and-isolated-test evidence for CTO review. It is not a merge, deploy, credential rotation, or a statement that the public tunnel is already secure.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-002-security-containment-20261101` |
| Tested CTO SHA | `78ddaa456d0d65fbd1c59b0d44405a4a6119f439` |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #7 |
| Coordination | issue #6 |
| Node | v22.19.0 for the unit gate; disposable API container `node:22-alpine` (v22.23.2) |
| Nginx | `nginx:1.25-alpine` disposable containers only |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Untouched drafts | PRs #2, #3, and #5 and branch `cto/first-real-local-mcp-proof-20261101` |

Status: **source ready, not deployed.** Live `dev-proxy`, `dev-ngrok`, and `dev-proxy-config-api` still report start time 2026-10-23. No container was restarted. No live port 8080, 3001, or 3002 was used as a test target.

## Source diff after the CTO SHA

1. Both nginx configs: the notifications comment now sits above `location = /devproxy/api/notifications` so the existing contract sees `auth_request` as the first directive. Behavior was already authenticated.
2. New RED contract, then both nginx configs: these management prefixes now start with `auth_request /admin/check` and `error_page 401 = @login_redirect`:
   - `location /devproxy/api/ai/`
   - `location /devproxy/api/config/`
   - `location ^~ /devproxy/api/apps/`
   - `location /devproxy/api/overrides/`
   - `location /devproxy/api/reports/`
   - `location /devproxy/api/resolve-conflict`
   - `location /devproxy/api/rename-route`
3. Exact `location = /devproxy/api/ai/health` stays anonymous. `/health.json` stays anonymous.

The live matrix is why the prefix change exists. Before it, anonymous `GET /devproxy/api/ai/chat-history` and `POST /devproxy/api/ai/ask` were proxied and denied only by the Node gate (HTTP 401). After it, nginx itself returns HTTP 302 to `/admin/login` before the API runs. Exact health stayed HTTP 200.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| `node --test tests/security/management-perimeter.test.mjs` on the CTO SHA | 6 pass, 2 fail. Both nginx files failed the notifications shape because a comment sat between `{` and `auth_request`. | 1 |
| Same command after the comment move | 8 pass, 0 fail | 0 |
| New prefix contract before the nginx edit | 0 pass, 2 fail | 1 |
| Same security file after the prefix edit | 10 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` (Node 22.19.0, after both edits) | collect-docs passed, embeddings passed, security file passed | 0 |
| `./smart-build.sh test:all` | BLOCKED. It still POSTs to the live Calliope API. | not run |
| `nginx -t` with `config/default.conf`, stub upstreams, fixture certificate | syntax ok | 0 |
| `nginx -t` with `config/default.production.conf` plus stub `limit_req_zone api_limit` | syntax ok | 0 |
| `nginx -t` with real `config/nginx.production.conf` on stock `nginx:1.25-alpine` | FAIL: `ngx_http_brotli_filter_module.so` is absent. The project Dockerfile builds that module. The live image was not rebuilt or swapped. | 1 |
| `docker compose config` for both Compose files, no `up` | `proxy-config-api` publishes `127.0.0.1:3001` and `127.0.0.1:3002`. Proxy still publishes 8080 and 443 with no host IP, which is the existing public listener and was not changed. | 0 |

The first bind-mount of the edited dev config into Docker showed a truncated file and a false `nginx -t` failure. A fresh copy of the same 564-line file tested clean. The passing `-t` used that copy.

## Isolated HTTP matrix

Disposable network `devproxy002test`. API container not published on the host. Nginx published only `127.0.0.1:18082`. Fixture admin secrets stayed in container env files and were deleted. No secret, session token, or live artifact was printed. `secretInBody` was 0. Fixture marker `FIXTURE_PRIVATE_SHOULD_404` never appeared in a response.

Anonymous Node API, `Accept: application/json`:

| Request | HTTP |
| --- | --- |
| `GET /devproxy/api/ai/health` | 200, keys only `activity`, `enabled`, `model`, `staticNgrokDomain`; model and domain were null |
| `POST` health, ask, reindex; `GET` thoughts, chat-history, auto-scan, promotions | 401 Unauthorized |
| `GET` and `POST /api/config/existing.conf`, `GET /api/config` | 401 |
| `GET /devproxy/api/not-a-real-route` | 401 |
| `GET` and `POST /admin/show-password` | 404 `Not found` |
| Alternate `PROXY_API_BASE_PATH=/custom/api` | same pattern: only exact `GET /custom/api/ai/health` is 200; legacy `/api/config` stays 401 |

Authenticated Node API, correct-length fixture password: login 200 with a session cookie. `GET` thoughts, chat-history, auto-scan, promotions, and `/admin/check` returned 200. `POST` auto-scan wrote only the container worktree fixture (`enabled: false`, `intervalSeconds: 30`). A false cookie returned 401. Those worktree artifacts were deleted.

Wrong password lengths (`short`, and 200 characters): HTTP 500, error `Input buffers must have the same byte length`, body did not contain the password, and the process stayed up so the following correct login returned 200. This is the known `crypto.timingSafeEqual` length defect. It does not block this gateway acceptance. Left for DEVPROXY-003. Not patched here.

Nginx from a private Docker IP, with `Host: evil.example` and `X-Forwarded-For: 127.0.0.1`, after the prefix fix:

| Request | HTTP |
| --- | --- |
| `GET /health.json` | 200 fixture `{"status":"ok","probe":"devproxy-002-fixture"}` |
| `GET /devproxy/api/ai/health` | 200 |
| `GET` and `POST /admin/show-password` | 404 |
| `GET /.artifacts/admin-session.json` | 404, fixture private marker absent |
| `GET` chat-history, thoughts, routes, routes.json, status.json, dashboard; `POST` ask and reindex | 302 `/admin/login?redirect=...` |
| `GET /nginx_status` | 403 |
| Authenticated exact health fallback, healing log, routes, status.json, dashboard, thoughts | 200 |
| `GET /nginx_status` from inside the nginx container to `127.0.0.1` | 200 |
| Same paths from the host to `127.0.0.1:18082` | health.json 200, health API 200, show-password 404, artifact 404, nginx_status 403, routes.json 302, chat-history 302 |

Browser login/status/dashboard: **BLOCKED**. The isolated service was reachable, and the HTTP matrix already covered those routes. The IDE browser was not driven because typing the fixture password or session cookie would place a secret in the tool transcript.

## Remaining defects

- DEVPROXY-003: unequal login password lengths return 500 from `timingSafeEqual` instead of a normal denial. Session, CSRF, and rate limits were not redesigned.
- DEVPROXY-004: Docker socket and container-network access to the API were not isolated. Host bind of 3001/3002 is loopback only in Compose; that was parsed, not applied to the running stack.
- Stock `nginx -t` of `nginx.production.conf` cannot load the custom brotli modules. The production server file itself tests clean when the rate-limit zone is stubbed.
- Public `/health.json` still returns the fixture health document. Data minimization was not part of this change.
- `.certs/dev.key` was not read, replaced, or history-rewritten.

## Unperformed

No merge, deploy, proxy/ngrok restart, credential rotation, public tunnel install, live `.artifacts` read, or edit to Tiger Slam, Wizardmaker, or Origin. `test:all` was not run.

## UAT

Source and isolated-service check: PASS for anonymous denial of management reads and writes, preservation of `/health.json` and exact AI health, authenticated fixture reads, and loopback-only nginx status. Public-tunnel UAT: not run, because this was not deployed. Stop for CTO review of the committed diff.
