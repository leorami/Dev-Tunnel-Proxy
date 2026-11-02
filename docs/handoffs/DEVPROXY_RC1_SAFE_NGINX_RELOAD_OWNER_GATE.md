# DEVPROXY-RC1-ROUTE-RELOAD — a single safe mini-sprint

## Goal and evidence

Protect the **existing working generated app routes** when a route rebuild fails during a later security release. No deployment, no live nginx reload, no real Docker. Parent [Issue #23](https://github.com/leorami/Dev-Tunnel-Proxy/issues/23). One main Cursor Engineer-I, one consolidated receipt; preserve owner checkout and no additional primary.

**Exact dependency:** `leorami/Dev-Tunnel-Proxy`. The last Engineer-I genuinely RETURNED [issue #21](https://github.com/leorami/Dev-Tunnel-Proxy/issues/21) and draft PR #22 at `cto/devproxy-rc1-private-rollback-export-20261101@eb068144273527b8f59de11be1e943eb4ceb08a9`. That code is NOT installed. Work only on the immutable `origin/cto/devproxy-rc1-safe-reload-20261101@<40-char SHA from the owner instruction>` and verify it matches GitHub HEAD before touching anything. Preserve `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` and owner's untracked `.cursor/` or other changes. Previous PRs remain draft/unmerged.

## CTO independent verified source

- First committed `tests/security/nginx-safe-reload.test.mjs` at `9469d2dbc4373df559a67a779a9db7910bef9124` **before modifying the script**. It runs only against its temporary directory and fake node/docker executables; no owner app access.
- Corrected `scripts/reload.sh`: capture existing `build/sites-enabled/apps.generated.conf` into an on-filesystem temporary backup, fail closed if Node unavailable, generator fails, `nginx -t` fails or reload fails. Restore previous on-disk routes on failures and call nginx reload only following successful validation. Do not claim active nginx state is known after a failed reload.
- Added `tests/security/nginx-safe-reload.test.mjs` to existing safe canonical `./smart-build.sh test:unit`; eight earlier security suites unchanged.
- CTO byte-matched both GitHub blobs to a disposable Linux Node v22.16.0 reproduction, verified authentic RED on old script **4 failures/5 cases**, GREEN on new script **5/5**, and Bash syntax. **This is not Engineer-I's native Mac proof, canonical suite or a real nginx test.**

## Engineer RED/GREEN and verification gate

1. **Recheck state:** Query latest GitHub Issue #23, PR for this branch, Issue #21 and exact protected master, as well as actual Cursor/owner checkout. If another primary is executing, do not interrupt or duplicate. Inspect src test/script and work only in a safe isolated worktree.
2. **RED first:** Node22 `node --test tests/security/nginx-safe-reload.test.mjs` on test-only historical commit `9469d2dbc4373df559a67a779a9db7910bef9124`. Confirm failures for generator failure, invalid `nginx -t`, no prior route file and failed reload. Do not pretend CTO's Linux run is a Mac result.
3. **GREEN:** Run that focused Node22 test on the exact pinned candidate and `./smart-build.sh test:unit` in disposable environment. Tests must never invoke real `docker`, `node utils/generateAppsBundle.js` or the actual owner's app-route files; fake executables and temporary root only. Capture full results/exits and exact tested SHA. If a real failure appears, add a new RED regression before an in-scope correction; do not weaken tests.
4. **Review safety:** Independently inspect trap cleanup and file permissions; ensure last-good file restored with original mode/content, backup artifacts removed, and no attempt to reload after invalid config. Verify generation failure never invokes Docker, and no missing Node fallback grants broad container mounts. Report whether an unexpected process signal or concurrent generators could still cause route drift (not solved by this patch). If production fallback is invoked at boot, note the separate read-only mount issue without expanding this sprint.
5. **Return:** Commit `docs/receipts/DEVPROXY_RC1_SAFE_NGINX_RELOAD_ENGINEER_COMPLETION.md` with exact tested source SHA, final receipt SHA, real RED/GREEN outputs and exits, canonical suite exit, owner state unchanged, in-scope source diff, and explicit `NO_LIVE_RELOAD`/`NO_DEPLOY`/`NO_EXPORT`. Post genuine STARTED→IMPLEMENTING→VERIFYING→RETURNED and read back both PR head and issue comment. STOP for CTO exact diff review and owner release decision.

## Hard boundaries

No running the actual reload or production/dev switch scripts on owner app, no live nginx/ngrok/container restart, no real image backup, no route/config/credential/cookie/cert/secret reads, no public ingress, no owner Mac Messages or LaunchAgents, no merging protected master, no source-wide rewrite and no release. This patch improves future failure behavior but DOES NOT automatically preserve all bind-mounted config or constitute a proven rollback. Actual old image export, private configuration baseline, independent restore rehearsal and owner staging UAT remain separate explicit owner gates.

**DoD:** one verified, source-pinned, fake-only safe reload patch and one Engineer return, with the running application unchanged. Don't manufacture agent work while waiting for owner authorization to export actual images.
