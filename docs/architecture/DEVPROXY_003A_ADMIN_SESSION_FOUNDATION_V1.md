# DEVPROXY-003A — admin authentication/session foundation (Origin TDD gate)

**Source-only CTO candidate; does not authorize deployment.** Planned on `cto/devproxy-003a-session-foundation-20261101`, stacked on returned but UNMERGED DEVPROXY-002 `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d` (draft PR #7), not an independent master-ready change. Parent [DEVPROXY-003 issue #9](https://github.com/leorami/Dev-Tunnel-Proxy/issues/9). P0 macOS notification guard PR #11 is another distinct draft; do not overwrite it.

## Scope — implement the smallest dependable signed-in administrator foundation

**Defects confirmed in DEVPROXY-002 isolated API tests:** `POST /admin/login` with an incorrect-length password returns HTTP 500 from `crypto.timingSafeEqual`, while correct-length login returns 200. The current `admin-session.json` persistence uses a direct JSON file write with ambient umask and rewrites the full bearer-token map on every auth check. Cookie lacks `Secure` on public HTTPS domains; weak cookie parsing matches substring names and accepts partial tokens. Generated `.env` permissions may be overly broad if runtime umask is not strict.

**CTO source design:**
1. Pure `utils/admin-session-security.cjs`: bounded UTF-8 password input, constant-size SHA-256 digests compared with `timingSafeEqual`, returning false for malformed/wrong-length passwords. This avoids throwing 500; it is *not a claim to solve online brute force/rate limiting*.
2. Cookie/Bearer validation: an exact lower-case 64-hex token, one unambiguous `admin_session` cookie or an explicit exact Bearer header; spoofed substring cookie names, duplicates and malformed tokens fail closed. Session token does not gain further privileges.
3. Host-only cookie `HttpOnly; SameSite=Strict; Path=/`, `Secure` on any hostname other than exact loopback `localhost`, `127.0.0.1`, `[::1]` with optional port. This supports existing local HTTP login without assuming every browser handles Secure on HTTP. **Known caveat:** Host is not a robust authenticated transport signal. No broader trust in `X-Forwarded-Proto` is introduced. DEVPROXY-003B will bind HTTPS assurance to a verified nginx/tunnel ingress and must test Host spoofing.
4. `admin-session.json`: atomic replace via temporary `0600` write, rename and `chmod(0600)`; rejects symlinks, malformed/expired/noncanonical session entries and repairs previously broad file permission upon read. This protects the file's OS access only; it depends on DEVPROXY-002's nginx HTTP denial for `/.artifacts/` and cannot safely ship alone.
5. Existing `.env` holding `ADMIN_PASSWORD` is made mode `0600` when loaded; generated files use `0600` with explicit chmod. No secret value is printed.
6. Authentication checks no longer synchronously rewrite all session tokens for every status poll. Login/logout/session expiry continue to persist token set; fixed 7-day expiry stays unchanged.
7. Login/logout responses are non-cacheable and session cookie revocation uses the same attributes as creation.
8. `tests/security/admin-session-foundation.test.mjs` was authored RED-first before the pure source module and API integration, with disposable tempfile tests for file mode/recovery and source wiring checks. Included in canonical `./smart-build.sh test:unit`. **CTO has not executed native Node tests.**

## Explicitly not solved yet

This is **003A only**, not all DEVPROXY-003: missing CSRF/Origin checks on cookie-authenticated mutation, origin verification, login attempt budgets/rate limits, active sessions after manual password change, multi-user identity, per-operation scopes, token revocation UI, notifications sidecar's in-Docker trust, P0 macOS owner pairing deployment, cookie Secure decision on forged Host/tunnel TLS, XSS and broad Docker privileges remain follow-on **003B/004**. Do not describe the control plane as fully hardened or approved. Avoid connecting the proposed MCP gateway to personal/sensitive operations.

## Required Engineer return

Run actual Node22 focused and canonical tests in a disposable copy/worktree with no live `.env`, session or proxy ports; start disposable admin API and test wrong-length/unicode/malformed login 401 or 400 **not 500**, correct login 200, cookie Secure+host-only on external host, non-Secure only for legitimate local loopback, same-site authenticated GET status, logout/revocation, restart/persistence and chmod 0600 of test-owned file; bad token duplication and Bearer precedence. Independently verify no X-Forwarded-Proto trust is gained; auth under DEVPROXY-002 nginx prefix remains denied anonymously. Browser UI parity should use a fixture browser without typing a real secret into the transcript. Keep `test:all` blocked until live-healing tests isolated. Return exact tested source SHA, commands/exits, negative matrix and single GitHub receipt, STOP for CTO code review.

**Release policy:** protected merge/rollout, current ngrok/bridge restart, credential rotation or user UAT are NOT authorized by this source work; there is no preexisting deployed DEVPROXY-002 to rely on. Any live security exposure requires separate owner-approved containment. 
