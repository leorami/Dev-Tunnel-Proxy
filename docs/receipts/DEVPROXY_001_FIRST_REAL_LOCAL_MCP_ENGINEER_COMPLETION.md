# DEVPROXY-001 engineer completion receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_001_FIRST_REAL_LOCAL_MCP_READONLY.md`. This is the evidence record for CTO review. It is not a merge approval, deploy approval, remote ChatGPT connection, or production UAT.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/first-real-local-mcp-proof-20261101` |
| Tested product SHA | `83da0ccdf55ca0073edc32c721a271e8f003cba7` |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Latest shared draft PR #2 | `cto/unified-gpt-local-app-mcp-bridge-v1-20261101@3240420ce0ec70328f2d64e9e19e1b6ff186d59e` (left draft, not merged) |
| Security draft PR #3 | `cto/shared-mcp-policy-untrusted-inputs-20261101@28e0c15dc46eebac162704fc66c83a7d7c47f18f` (left draft, not merged) |
| Review draft | PR #5, same CTO branch |
| Coordination | issue #4 |
| Node | v22.19.0 at `/Users/leorami/.nvm/versions/node/v22.19.0/bin/node` |
| Worktree | `/private/tmp/devproxy-001` detached at the tested SHA, then this receipt commit. Owner checkout stayed on `master`. |

No product or test file changed. The only commit after the tested SHA is this receipt. `git diff --exit-code` showed `packages/dev-proxy-mcp/app-policy.mjs` and `tests/unit/dev-proxy-mcp-app-policy.test.mjs` byte-identical to PR #3. `docs/qa/UNIFIED_GPT_LOCAL_APP_MCP_RELEASE_QA.md` and `docs/adoption/GENERIC_PROJECT_MCP_ADOPTION_INSTRUCTION.md` are unchanged versus PR #2. `gateway.mjs` does not import or call `authorizeAppCommand`.

## Gate table

| Gate | Status | Command / evidence | Exit |
| --- | --- | --- | --- |
| 0 Runtime and public-package contents | PASS | `node --version` → v22.19.0. Package source has no embedded application records, tokens, or private snapshots. | 0 |
| 1 Deterministic unit | PASS | `node --test tests/unit/dev-proxy-mcp.test.mjs tests/unit/dev-proxy-mcp-app-policy.test.mjs` → 30 pass, 0 fail. Then `./smart-build.sh test:unit` → collect-docs 23 pass, embeddings 7 pass, same MCP 30 pass. Not Wizardmaker's 16/16. | 0, then 0 |
| 2 Canonical `test:all` | BLOCKED | `./smart-build.sh test:all` also runs `test/test-incremental-thoughts.sh`, which POSTs `http://localhost:3001/api/ai/audit-and-heal`, and Calliope tests that POST `/devproxy/api/ai/ask` on the live config API. Not executed. Safe subset is gate 1. | not run |
| 3 Actual fixed local app | PASS | Independent client below. Health is the real HTTP status of a test-owned process, not a synthetic online flag. | 0 |
| 4 Two-app isolation | PASS | Alpha stayed HTTP 200 while beta was set to HTTP 503. `gamma` returned `UNKNOWN_APP`. No third app was registered. | 0 |
| 5 Protocol / version | PASS | Discover and tool results used `resultType: complete` and server name `dev-tunnel-proxy-app-mcp`. Encoded `Mcp-Name` accepted. Method/header mismatch HTTP 400 code `-32020`. `initialize` HTTP 404 code `-32601`. | 0 |
| 6 Input isolation | PASS | Executed negatives rejected client port, path command `../../secrets`, and `sh` before any app handler. Unit tests also reject extra fields, oversized text, overlarge body, and hostile policy objects. No host shell, Docker, or SQL process was started. | 0 |
| 7 Browser / network boundary | PASS | Forged `Host` HTTP 403. Forged `Origin` HTTP 403 `LOCAL_ORIGIN_DENIED`. Listener `127.0.0.1` only; connect to a non-loopback IPv4 on that port returned `ECONNREFUSED`. Invalid bearer HTTP 401 `AUTH_REQUIRED`. Missing Content-Type HTTP 415. `/admin` on the gateway port HTTP 404. Expired and revoked machine bearer are NOT_AVAILABLE: the gateway secret is static, with no TTL and no revocation list. | 0 |
| 8 One-use local approval | PASS | Unit tests only: wrong args, replay, simultaneous double submit, and timeout `APP_OUTCOME_UNKNOWN_DO_NOT_RETRY` with one action. This does not authorize a production write. | 0 |
| 9 True user authority | BLOCKED | `BLOCKED_SENSITIVE_ACTIONS`. No per-app OAuth principal, audience, or scope was supplied or configured. Local bearer was not treated as a user. | not run |
| 10 Data consistency | BLOCKED | `WRITES_NOT_AVAILABLE`. No app database, expected-version transaction, or durable audit was exercised. | not run |
| 11 Remote ChatGPT | BLOCKED | `BLOCKED_REMOTE_MCP_CONNECTION`. Owner environment names include Calliope OpenAI settings and ngrok, not a configured Secure MCP Tunnel. No cloud client was contacted. | not run |
| 12 Shutdown / rollback | PASS | Proof PIDs 81491, 81492, and 81493 exited and ports 53160–53162 were closed. Live `dev-proxy`, `dev-ngrok`, and `dev-proxy-config-api` still report start time 2026-10-23. No nginx route was added. | 0 |

## Independent local proof

Client: handcrafted Node 22.19.0, PID 81491, source `packages/dev-proxy-mcp/gateway.mjs`. This proves the local wire only. It does not prove a remote ChatGPT connection.

Test-owned apps, both bound to `127.0.0.1`:

| App | PID | Port | Source marker | Observed health |
| --- | --- | --- | --- | --- |
| alpha | 81492 | 53160 | `devproxy-001-test-app-alpha` | `online: true`, `httpStatus: 200` before and after beta changed |
| beta | 81493 | 53161 | `devproxy-001-test-app-beta` | `online: true`, `httpStatus: 200`, then `online: false`, `httpStatus: 503` |

Gateway listen line: `TCP 127.0.0.1:53162` (PID 81491). Correlation ids and results:

| Call | Id | HTTP | Observed result |
| --- | --- | --- | --- |
| `server/discover` | `corr-discover` | 200 | `resultType: complete`, server `dev-tunnel-proxy-app-mcp` |
| `tools/list` | `corr-tools` | 200 | `resultType: complete`, same server metadata |
| `tools/call app.list` | `corr-app-list` | 200 | apps `alpha`, `beta`; command `health.check` risk `read` |
| `app.command health.check` alpha | `corr-alpha-health` | 200 | port 53160, HTTP 200 |
| `app.command health.check` beta | `corr-beta-health` | 200 | port 53161, HTTP 200 |
| `app.status` beta after 503 | `corr-beta-503` | 200 | `online: false`, `httpStatus: 503`, port 53161 |
| `app.status` alpha during beta 503 | `corr-alpha-still` | 200 | `online: true`, `httpStatus: 200`, port 53160 |
| `app.status` gamma | `corr-gamma` | 200 | `isError: true`, `UNKNOWN_APP` |
| forged Host `evil.example` | `corr-host` | 403 | denied before a tool result |
| forged Origin | `corr-origin` | 403 | `LOCAL_ORIGIN_DENIED` |
| args `{port: <beta port>}` | `corr-port-override` | 200 | `COMMAND_ARGUMENTS_DENIED` |
| command `../../secrets` | `corr-path` | 200 | `COMMAND_NOT_REGISTERED` |
| command `sh` | `corr-shell` | 200 | `COMMAND_NOT_REGISTERED` |
| invalid bearer | `corr-bad-bearer` | 401 | `AUTH_REQUIRED` |
| missing Content-Type | — | 415 | denied |
| `initialize` | `corr-initialize` | 404 | JSON-RPC `-32601` Method not found |
| `Mcp-Method` mismatch on `tools/call` | `corr-mismatch` | 400 | `-32020` HeaderMismatch |
| base64 `Mcp-Name` for `app.status` | `corr-encoded` | 200 | alpha still HTTP 200 |
| POST `/admin` on gateway port | — | 404 | not the proxy admin route |

The bearer value is not recorded. No product app (Wizardmaker, Tiger Slam, Encast, Airluum, Calliope) was called.

## Protected proxy non-regression

`git diff --stat 62a4d7babae986ade1feb0fd6dbe7dd32532523a..83da0ccdf55ca0073edc32c721a271e8f003cba7 -- apps overrides` was empty. Live `nginx -T` contains no `location /mcp`. Existing locations still include `/admin/*`, `/devproxy/api/*`, `/trajectory/mcp`, and the Tiger Slam OAuth resource paths. Those routes were not edited. Container start times stayed 2026-10-23.

`./smart-build.sh test:unit` in the empty worktree made the existing auth helper write a gitignored `.env` containing only `ADMIN_PASSWORD`. That file was deleted. The owner checkout `.env` remained dated Dec 27 2025 and was not read for values. The running proxy did not load the generated file.

## Authority and unperformed work

- Local bearer is machine authentication only.
- `app-policy.mjs` remains unwired from `gateway.mjs`.
- `BLOCKED_SENSITIVE_ACTIONS` and `WRITES_NOT_AVAILABLE`.
- `BLOCKED_REMOTE_MCP_CONNECTION`.
- Not performed: merge, deploy, spend, credential setup, nginx/ngrok restart, new public `/mcp`, package publish, owner browser session use, or writes to any app.

Owner checkout still has untracked `.cursor/` only. Draft PRs #2 and #3 were not updated. No second primary agent was started.

## UAT verdict

Local owner-equivalent check: PASS for one non-sensitive read of a real test-owned loopback HTTP process, with the second test-owned process reporting its actual HTTP 503 and no cross-app discovery. Remote Cloud ChatGPT UAT: not run. Production app UAT: not run. Stop here for CTO review of the committed diff.
