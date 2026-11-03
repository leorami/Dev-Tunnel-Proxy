# Dev Proxy — CTO v10 source-first nonlive integration handoff

## Verified starting point

Use the exact full SHA in the single Engineer-I dispatch. Base is the most recent genuine Engineer-I RETURNED PR #69 `engineer/devproxy-p0-nginx-include-graph-ro-verify-20261103@5d09f28371785dfaa840e522f88d3b807598fe4f`. That return verified the live nginx include glob inventory read-only and added a regression proving the three-file signature misses extra included files. Keep that evidence, preserve existing v8 nonlive work and completed Mac tests. No new assignment is launched solely by a GitHub comment.

## CTO has already implemented source and tests

The CTO delivered `utils/rc1-effective-nginx-config-closure.cjs`, `utils/rc1-closure-gated-host-driver.cjs`, and `utils/rc1-loaded-nginx-file-identity.cjs` together with their five `tests/security/rc1-*` regression files. The original v6/v8 HMAC/fence code is unchanged. A full Linux Node22.16 fixture run across the existing v8 security tests plus the new v9/v10 regressions is **129/129 PASS**. The source is in this branch. Do not reimplement those modules or repeat the completed owner Mac read-only inventory.

## ONE primary Engineer-I remaining bounded contract

1. FIRST verify primary lifecycle, newest PR/branch tip and 40-character SHA; preserve any actually running assignment. Compare the CTO source to this branch, and code-review the test-owned modules.
2. Integrate the v9 closure-gated host driver and v10 read-only loaded-file identity into a **nonlive composition** of the existing v8 guarded worker. Use private disposable fixture files only, injected fixed-action fake callbacks, and the existing Node test runner. Do not start another application, listener, broker, Docker task or background process. Never switch the currently running API to the spool implementation.
3. Verify the exact fixed three-file source-to-loaded equality and enumerate loaded directory entries. A new glob-matched `.conf`, altered loaded nginx config, symlink, nested include, group/other-writable source or runtime path, or unexpected file must prevent the fake fixed action. Race/timeout after a potential reload remains indeterminate and quarantined. Return explicit `NOT_RUNTIME_ATTESTED` for all synthetic tests.
4. Run the five new CTO regression suites and all existing v8 focused security suites with `node --test --test-concurrency=1 tests/security/*.test.cjs`. Run the canonical `./smart-build.sh test:unit`. Report exact counts, exit status and any Mac deviations. Keep the actual running owner app and its 17 routes untouched.
5. Separately identify what trusted operator read-only evidence would bind the actual Mac-loaded nginx files, container image/mount identities, and complete include graph. Identify the remaining post-fence / outer-settle TOCTOU blocker. Do not claim the new helper authorizes the host worker or production release.
6. Return one consolidated GitHub STARTED→VERIFYING→RETURNED receipt at the actual final SHA, actual source diffs, exact results, evidence class (synthetic / Mac read-only / owner-runtime), independent Origin five runtime fields (UNKNOWN is not PASS) and genuine blocker. Only the bounded result `NONLIVE_LOADED_CONFIG_IDENTITY_VERIFIED / NOT_DEPLOYED` may be claimed if testing passes.

## Explicit operational boundaries

No protected merge, production recreation, running nginx reload, new Docker privilege or socket mount, owner data write, .env/session or credentials read, extra proxy or API, new public endpoint, host-worker installation, or reuse of the consumed earlier release GO. Keep `allowConfigEdit:false` and rename/cleanup fail-closed. No UI changes are in scope. Any later UI change requires actual screenshot bytes from the ONE canonical app and independent CTO pixel inspection before owner UAT. The CTO reviews the committed Engineer-I return before proposing any next action.
