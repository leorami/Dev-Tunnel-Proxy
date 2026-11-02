# Dev Tunnel Proxy Security RC1 — one integrated and testable release candidate

**Owner-governed release candidate, NOT MERGED, NOT DEPLOYED, NOT OWNER ACCEPTED.**
The goal is to stop accumulating independently passing but uninstalled security branches and produce **one cohesive disposable-env-verifiable product candidate** with unchanged live proxy, Mac bridge, credentials and app routes. This is a release-readiness gate, not authorization to install it.

## Immutable lineage and explicit intent

- Protected default: `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` at planning.
- Branch from DEVPROXY-003A returned `341de493674b2ad8f5b60a4da4ebb102cd1a6553` (draft PR #12). This **inherits** DEVPROXY-002 verified control-plane/network protections `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d` (draft PR #7).
- Exact returned P0 macOS bridge source `92e0d2105f9b0afddc7abcaaf3f6fe37bfd3ec39` (draft PR #11): faithfully copied policy, runtime server, status HTML and tests, preserving GitHub blob IDs. This does NOT migrate the installed host Mac process.
- Exact source-only login return `25c6dbd2b801ce8b8a48ae9ba87592e1b7d6eb7d` (draft PR #13): same-origin redirect policy, login page and tests. Browser wiring not yet Engineer-verified.
- Existing shared local MCP trial PRs #2/#3/#5 **are not included or authorized for release**. Their local two-test-app proof does not authenticate actual cloud GPT.
- The overlapping `smart-build.sh` hooks are explicitly reconciled into one canonical safe unit step; no other branch is superseded/closed by this integration.

## Owner-facing functionality that MUST survive

1. Existing nginx/ngrok proxy routes, dynamic app discoveries, dashboard, reports and dashboard login must remain functional under both dev/prod nginx configurations. No route drift, no app downtime on the test fixture, no 401/302 loop.
2. An anonymous tunnel user cannot read admin credentials, `/.artifacts/` files, routes, chat history, notifications or invoke AI self-healing, overrides/promotions/install/config writes. Public fixture Docker health remains available.
3. Wrong-length password is an ordinary 401, not a server crash. A real signed-in fixture can authenticate, refresh authenticated status, log out and be denied once revoked. Session files remain owner-only and restartable; external Host cookie is Secure; loopback HTTP remains usable.
4. Browser login return is constrained to the **same origin** even if an attacker supplied `?redirect=https://evil.example`, `//evil`, encoded/escaped values or script-like URLs. Legitimate local `/status`, `/reports` and `/dashboard` return safely. Validate from the actual nginx-served page, not the pure policy alone.
5. The Mac bridge enforces explicit local owner pairing before Messages.app or LaunchAgent actions and never exposes a wildcard CORS policy. A test-owned Mac fixture proves authorization *without sending actual texts or modifying host LaunchAgents*. Pair Bridge must not silently prompt on every load; invalid credential state is distinguishable from bridge-offline.
6. Preserve origin separation: public HTTP nginx/app request, HTTP-only localhost API, browser origin, a localhost macOS bridge, a Docker-private container and a remote ChatGPT connector are **different security principals**. Neither Host, forwarded headers, private IP nor model intent is user authorization.

## Integrated RED/proof fence

- `tests/security/security-release-integration.test.mjs` was added RED-first on this RC branch before source integration. It asserts existence and correct cross-layer wiring for **all four** component protections plus their test hooks and key nginx/Compose safety rules.
- Real focused suite must include:
  `node --test tests/security/management-perimeter.test.mjs tests/security/admin-session-foundation.test.mjs tests/security/notification-bridge-authorization.test.mjs tests/security/login-redirect-same-origin.test.mjs tests/security/security-release-integration.test.mjs`.
- Canonical `./smart-build.sh test:unit` must run all five once plus the existing collect-docs and embeddings tests, with no live state changes. Do not substitute arbitrary `npm test`, and do not claim a RED run without an actual observed failing test.
- Isolated nginx+Node+Mac mock wiring must show actual HTTP denials, authenticated routes, cookie/tunnel host semantics, browser login-return behavior, private artifacts, macOS pairing, and no unintended operations. Reproduce the real brotli-enabled production-image build; a stock nginx binary cannot stand in for the project's custom module.
- Engineer-executed **owner-equivalent UAT** is required: use only fixture secrets, capture screenshots/no credentials, review happy-path status/dashboard and login/redirect + Mac Pair Bridge at desktop/phone widths, report explicit PASS/BLOCKED/FAIL. This is not the owner's actual approval.
- `./smart-build.sh test:all` historically calls live Calliope healing endpoints; do NOT execute it against owner's real proxy; isolate it in disposable API fixtures or explicitly mark BLOCKED without claiming comprehensive PASS.
- Report test commands/exits, immutable tested SOURCE SHA, final receipt SHA, all file overlaps, exact UAT evidence, service noninterference and known unresolved security findings. Stop for CTO exact-diff review and explicit owner release decision.

## Explicit non-goals / stop rules

- No merge to `master`, no GitHub PR auto-merge/closure, no change to live 8080/443/3001/3002/17888, no ngrok public route migration, no current Docker/LaunchAgent restart, no Messages sends, no real admin/bridge token read or rotation, no production SSH, no API key reads and no actual owner browser session takeover.
- No silent expansion into 003B CSRF + throttling + trusted HTTPS attestation, 004 Docker socket privilege reduction, 005 transactional routing, or 008 real Cloud ChatGPT connectivity. The candidate is **risk-reducing**, not a full clearance certificate.
- A real public exposure incident requires distinct owner-approved response. No content from owner `.env`, `.artifacts` or `.certs` should be pasted to a report.

## Exit decision

After one source-exact Engineer return and CTO committed-diff review, present one owner decision for a staged safety-reviewed rollout with a tested rollback image and owner UAT. **Source green does not mean installed.** Candidate is NOT GO until the independent production-like brotli, browser, anonymous/authenticated test gates pass and the owner authorizes deployment. See `docs/release/DEVPROXY_SECURITY_STAGED_ROLLOUT_GATES_V1.md` for the release boundary.
