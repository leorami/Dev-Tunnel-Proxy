# DevProxy RC1 — prevent trusted-origin login lockout during eventual deployment

**One primary Engineer-I, one bounded safe verification.** This handoff is CTO-first source/tests only, based on genuine returned staging `cto/devproxy-rc1-security-staging-20261102@f9c3ef359526be15059d7bd412e82247ea482d22` (draft PR #27; owner Mac disposable staging on `127.0.0.1:18090` was **not** stopped or modified). Read current Issue #9 and PR #27 before execution; if a primary already resumed, do not duplicate it.

## Consequential source defect, verified at exact returned SHA

- `utils/proxyConfigAPI.js` initializes `TRUSTED_ORIGINS=normalizeTrustedOrigins(process.env.DEVPROXY_TRUSTED_ORIGINS)` once.
- A cookie-authenticated `POST /admin/login` with a normal browser `Origin` requires an exact member of `TRUSTED_ORIGINS`; an empty set rejects all browser login attempts with 403.
- **Neither `docker-compose.yml` nor `docker-compose.production.yml` forwards `DEVPROXY_TRUSTED_ORIGINS` to `proxy-config-api` at returned SHA.** Its successful disposable staging used a separate process-only `api.env` file; that success does not prove default Compose deploy parity.
- An operator may have additional private environment overrides; **do not assume they exist**. Protect the default paths by requiring explicit trusted origins at Compose config-render time and forwarding them to API.
- Unchanged owner checkout `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` and running services must remain untouched.

## Direct CTO code and RED-first contract

CTO branch changes are narrowly limited to: `docker-compose.yml`, `docker-compose.production.yml`, `tests/security/trusted-origin-compose-gate.test.mjs`, and the `smart-build.sh test:unit` hook. The new Compose environment entry is:

`DEVPROXY_TRUSTED_ORIGINS=${DEVPROXY_TRUSTED_ORIGINS:?Explicit trusted browser origins required for admin login}`

This requires the operator to provide the full trusted `scheme://host[:port]` origins **explicitly**, including actual owner browser origins where authorized. No insecure wildcard, Host-derived policy, or client-controlled forwarded-header fallback. Do not write real private domains, tokens or passwords to GitHub.

CTO local Node22 RED contract before the Compose additions: **1 PASS / 2 FAIL** against source-equivalent isolated service fixtures; corrected fixture GREEN **3/3**. The actual new test and Compose source have been committed to the isolated CTO branch and read back from GitHub, but full repository tests and native macOS Compose rendering remain **Engineer verification**, not yet passed by CTO.

## Remaining-only Engineer steps

1. Confirm exact pinned origin branch+SHA, own clean isolated worktree and no active competing primary. Do not alter PR #27's branch, protected master or current disposable owner staging.
2. Reproduce RED from the parent `f9c3ef...` source: run the new test against parent Compose manifests, showing 2 failures and the intact API bootstrap. Then run GREEN from the CTO branch (expect 3/3). Run `./smart-build.sh test:unit` under native Node22, recording actual exit.
3. Without starting containers or reading live secrets, verify both Compose configs **fail validation when trusted origins are unset** and **pass `docker compose ... config --quiet` when process-only safe sample origins are supplied**. Do not print resolved environment or run `docker compose up/down`. Confirm any real release runbooks now explicitly call for owner/operator-provided origin allowlist matching the browser origin and public static domain.
4. Audit the live-running proxy only by previously authorized read-only metadata; don't touch it. Preserve existing `~ / Library / Application Support / Dev Tunnel Proxy / private-rollbacks` without creating any new archives. Confirm staging remains accessible if already running. No need to repeat signed-in browser work already accepted in #27 unless source changes actually affect it (they should not).
5. Deliver one committed consolidated receipt at a new SHA on this branch, with native RED/GREEN and safe Compose render exits, exact changed files, staging/rollback preservation, source-only acceptance status, current release blockers and owner UAT route from #27. Stop for independent CTO actual committed-diff review. No further feature sprint or owner reauthorization for backups.

**Authority:** no protected merge, live/ngrok/bridge restart, production environment edit, public staging exposure, credentials reading/rotation, tunnel probe or deployment. Owner UAT for existing isolated `http://127.0.0.1:18090/admin/login` and eventual release approval remain distinct owner-only decisions. This source fix prevents a foreseeable lockout; it does not grant cutover authority.
