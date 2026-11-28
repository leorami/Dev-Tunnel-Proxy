# V217 — release gate and activation safety

Source only. Nothing in this record was installed, served, merged, restarted, or activated. A synthetic fixture result is not live user acceptance testing. Code-ready is not production-ready.

## Where this stands

Issue #271 comment [7230619735](https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7230619735) is the authority for this pass. STARTED is #271 comment [7231679791](https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7231679791), posted after `66dd557e5980473f21a63d8880b135ae33b5f1de` was on the remote. V216 had already returned and stopped. The V214 live grant stays consumed. This sprint does not use it.

Protected `main` at the start of this return was `590bcf2a980b434f533ddacac43a24a777a933e7`. The engineer branch is `engineer/devproxy-v217-activation-safety-20261127`, opened from the V216 receipt tip. Draft pull request [#294](https://github.com/leorami/Dev-Tunnel-Proxy/pull/294) targets `main`. Do not merge it, and do not merge #292 or #293.

The owner checkout was not edited. No IDE browser tab was resized. The `status` tree was not changed, so the 16 V216 frames are cited instead of recaptured.

## Qualified product

The product commit is `53422746e528cfc6a338abf1bac4aee4b5198be4`. Its `status` tree is `1696cc771f415725863617b1392ef4324e8c1149`, the same tree as V216. This document does not change that tree, the versioned asset bytes, or the V213 served preimage fixture.

The activation procedure, the expected hashes, and the stop-if-different rule are in `docs/handoffs/DEVPROXY_V217_ACTIVATION_PACKET.md`.

## What the candidate changes

`scripts/v216-frontend-install.cjs` stays a fixture helper. It still refuses a path outside the temporary directory and a path inside a git checkout. It is not an owner-host installer.

Recovery reads and validates the version 2 journal before any cleanup. A missing or invalid journal stops with no write. Each temporary file has an intent record (exact name, transaction id, device, inode, size, and hash) before it is created. Recovery unlinks only a regular file whose basename, device, and inode match that record. A name that merely starts with `.v216-` is left in place.

The document root is an explicit input. The target must sit inside it. Custody must sit outside the whole served document root, not only outside the target subdirectory, and it must be mode `0700`, owned by the operator, and free of symlinks.

Linux metadata uses `getfattr -d -m - -e base64`. macOS metadata uses `xattr -px` and `st_flags`. Attributes are stored as base64 bytes. `setfattr --restore` is aimed at the absolute temporary path. If any attribute cannot be read or copied, including `security.*` and `com.apple.provenance`, the step refuses before a served write. Before rename, the temporary file must match the preimage on owner, mode, ACL, extended attributes, and flags. The document-root and target-directory device and inode are checked before the steps and again around rename.

`scripts/v216-release-lane.cjs` parses the Python `Ran N tests` line and the final `OK` or `FAILED` line. `Ran 0 tests` followed by `OK` and exit 0 is tests 0, pass 0, strict false. A skip, an expected failure, or an unexpected success is not a pass. The reported counts are the counts that line names.

The host acknowledgement poll in `utils/rc2-cross-process-settlement.cjs` treats a transient `nlink !== 1` during `link` plus `unlink` as not yet published, until the existing deadline. The settlement test waits until the request file exists. It does not sleep a fixed 40 ms, and it does not skip.

## Original RED

[46094072692](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46094072692) on `fde5c3c3a9e18f74424e66fde723f2f7fb0e5968` failed, as required, against the old installer blob `0eb276df27c28fa668b4de46cdab4fd9125cbcb6` and the old runner blob `fc8a5e2fac9f16d9443daf0d5bd82de92f1d3789`. Installer-macos, pure-node 22.x shards 0 and 3, and pure-node 24.x shards 0 and 3 failed. The other lanes on that run succeeded. That red run is not a pass.

Two later product commits also failed and were fixed forward. They are not the original RED, and they are not a pass:

- [46095470167](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46095470167), [46095470117](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46095470117), and [46095470238](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46095470238) on `239e2c46b79e722062f3cb1faba1bdba2a90a493` failed because `setfattr --restore` named a relative file `tracked`. `e3220f4acbe6c8b4a4f6a24b831d386dc626c826` aims the restore at the absolute temporary path. The same ownership test then passed in a disposable Linux container.
- [46096009054](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096009054) on `e3220f4acbe6c8b4a4f6a24b831d386dc626c826` failed pure-node Node 22 shard 2. The config-extract fixture recorded the extract mtime and wrote the live copy earlier, so under load the live stamp fell outside the one-millisecond attestation window. `53422746e528cfc6a338abf1bac4aee4b5198be4` pins both copies with `utimes`. The other workflows on `e3220f4` succeeded.

## Coverage reconciliation

`tests/release-lanes.json` maps every discovered test once. On the product commit that is 181 pure-node files, 4 nginx-fixture files, 4 libsignal-native files, 7 browser files, and 40 blocked files. `tests/security/v217-coverage-dispositions.test.cjs` requires the blocked list to equal `tests/security/fixtures/v217-dispositions.cjs`, and it requires every blocked entry to name a disposition, its original test names, and an evidence file that contains that path. The lane runner throws when a blocked entry has no disposition, evidence, or reason. An empty suite cannot pass. There is no global skip.

The strict pure-node total on hosted Node 22 and, separately, hosted Node 24 is 1560 tests, 1560 pass, and zero fail, cancelled, skipped, and todo. Shard totals match across the two Node versions: shard 0 is 435, shard 1 is 415, shard 2 is 365, shard 3 is 345.

| Lane | Files | Hosted result on `5342274` |
| --- | --- | --- |
| pure-node 22.x and 24.x | 181 | 1560 pass on each Node version |
| nginx-fixture | 4 | 8 pass |
| libsignal-native | 4 | 11 pass, historical pin `@signalapp/libsignal-client@0.106.0` |
| browser | 7 | 51 pass, zero skips |
| installer-macos | the two installer files | 18 pass on hosted `macos-15` |
| lane manifest | `v216-release-lanes.test.cjs` | 2 pass |
| blocked-capability | 40 | printed and not executed |

The historical native lane says `0.106.0` is not current-latest proof. Official latest on this product commit is `@signalapp/libsignal-client` `0.108.7`, license `AGPL-3.0-only`: Linux run [46096391794](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391794) and macOS run [46096391819](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391819). Nothing was downgraded.

### The 42 files V216 left blocked

Two now run in pure-node. Forty stay blocked. A blocked file is not a pass. Ported rows prove the current source contract named in the evidence file. They do not prove computed style, a pixel gap, or a live click. Superseded rows are replaced by the secure-mode refusal in `tests/security/v162-secure-dashboard-truthful-actions.test.cjs` (`LEGACY_UNSETTLED_MANAGEMENT_BLOCKED`). The old heal expectation was not executed.

| Path | Disposition | Original tests |
| --- | --- | --- |
| `test/dashboard-dropdown-bug.test.js` | executed | 5 pure mock cases, in pure-node |
| `test/unit/route-promotion-filtering.test.js` | executed | 4 pure cases, in pure-node |
| `test/browser-console-test.js` | manual | browser console diagnostic |
| `test/calliope-comprehensive-tests.js` | manual | calliope comprehensive manual runner |
| `test/calliope-enable-disable-visual-test.js` | manual | calliope enable and disable visual runner |
| `test/calliope-real-time-ui-test.js` | manual | calliope real-time UI runner |
| `test/calliope-simple-test.js` | manual | calliope simple manual runner |
| `test/calliope-ui-interaction-test.js` | manual | calliope UI interaction runner |
| `test/comprehensive-browser-test.js` | manual | comprehensive browser runner |
| `test/e2e/nginx-proxy-pass.test.js` | capability-blocked | historical dashboard `proxy_pass` through a disposable nginx |
| `test/integration-layout.test.js` | capability-blocked | isolated browser session against a disposable status origin |
| `test/integration/api-apps-install.test.js` | capability-blocked | authenticated disposable config API |
| `test/integration/api-reindex.test.js` | superseded | public unauthenticated reindex; secure mode refuses it |
| `test/layout-responsive.test.js` | capability-blocked | isolated browser session that can resize a disposable origin |
| `test/lyra-auth-test.js` | manual | lyra auth visual runner |
| `test/mixed-content-test.js` | manual | mixed-content manual runner |
| `test/nextjs-auth-test.js` | manual | nextjs auth visual runner |
| `test/quick-calliope-test.js` | manual | quick calliope manual runner |
| `test/quick-validate-layout.js` | manual | quick layout validation runner |
| `test/run-calliope-puppeteer.js` | manual | calliope puppeteer runner |
| `test/run-iterative.js` | manual | iterative visual runner |
| `test/run.js` | manual | historical test runner |
| `test/scanApps.js` | manual | scanApps manual diagnostic |
| `test/site-auditor-test.js` | manual | site auditor manual runner |
| `test/status-chip-mechanism-test.js` | manual | status chip mechanism runner |
| `test/status-chip-test.js` | manual | status chip manual runner |
| `test/status-model.js` | manual | status model manual script |
| `test/test-calliope-button-behavior.js` | manual | calliope button behavior runner |
| `test/ui-fixes-verification.js` | manual | UI fixes verification runner |
| `test/ui/tests/calliope-chips.spec.ts` | ported | chip and toggle markup on the current source; computed style was not executed |
| `test/ui/tests/calliope-computed-styles.spec.ts` | capability-blocked | computed styles from a disposable origin |
| `test/ui/tests/calliope-fixes.spec.ts` | superseded | expects `heal:true`; secure mode refuses it |
| `test/ui/tests/calliope-layout.spec.ts` | capability-blocked | isolated browser session against a disposable status origin |
| `test/ui/tests/calliope-style-parity.spec.ts` | capability-blocked | computed-style comparison on a disposable origin |
| `test/ui/tests/calliope-toggle-comprehensive.spec.ts` | ported | toggle, `aria-pressed`, and drawer markup; the 16px gap was not measured |
| `test/ui/tests/calliope-toggle.spec.ts` | ported | toggle and `aria-pressed` markup; a live click was not executed |
| `test/ui/tests/dashboard-dropdown.spec.ts` | superseded | expects Audit + Heal and Advanced Heal; secure mode does not offer them |
| `test/ui/tests/routes-audit-half.spec.ts` | capability-blocked | isolated dashboard origin with disposable route fixtures |
| `test/ui/tests/status.spec.ts` | ported | Calliope toggle and drawer on the current status document; live console capture was not executed |
| `test/verify-realtime-thoughts.js` | manual | realtime thoughts manual runner |
| `test/verify-thoughts-pushed.js` | manual | thoughts pushed manual runner |
| `test/view-density-toggle.test.js` | capability-blocked | isolated browser session against a disposable status origin |

The exact original test titles and the capability each blocked file still needs are in `tests/security/fixtures/v217-dispositions.cjs`. Playwright no longer defaults to `http://localhost:8080`. `test/ui/playwright.config.ts` refuses to start unless `UI_BASE_URL` is an explicit `127.0.0.1` origin. The lane does not run those historical specs.

## Release gates

All of these succeeded on product commit `53422746e528cfc6a338abf1bac4aee4b5198be4`:

- Release lanes, run [46096391713](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391713). Lane manifest, both Node 22 and Node 24 pure-node shards 0–3, nginx-fixture, libsignal-native, browser, installer-macos, and the blocked-capability record all succeeded.
- Secure release candidate, run [46096391804](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391804).
- Supported Node source gate, run [46096391824](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391824). Node 22 and Node 24 both succeeded.
- Auth-prefix workflow, run [46096391857](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391857).
- Private API regex-precedence workflow, run [46096391809](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391809).
- V191 [46096391886](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391886), V192 [46096391837](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391837), V193 [46096391926](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391926), V194 [46096391817](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391817), V196 [46096391958](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391958), V197 [46096391915](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391915), V198 [46096391916](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391916), V201 [46096391924](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391924), and the RC2 API image-only gate [46096391858](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391858).
- Official libsignal latest, Linux, run [46096391794](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391794), candidate `0.108.7`.
- V199 official libsignal native macOS, run [46096391819](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46096391819), candidate `0.108.7`.

Pushing this document starts the pull-request workflows again. The return comment names the runs for this commit. A docs commit is not a new product claim. The same two libsignal workflows are dispatched on this commit's SHA because their path filters do not include this document. The return comment records those run ids. `0.106.0` remains the historical lane pin.

## Evidence

No new frames were captured. The status tree is still `1696cc771f415725863617b1392ef4324e8c1149`. The 16 V216 originals stay the visual record: evidence `fb9503f3894f10f9bdb411174cc69074dd5f9e96`, artifact `15237208294`, zip SHA-256 `be49487815638e4b03c086eb97c57ce68ffcbc44e70890fc1213fd12977da9cb`. They are a source preview, not owner acceptance.

## Owner-authorization decision

The required release lanes and the canonical workflows on `53422746e528cfc6a338abf1bac4aee4b5198be4` are green. The minimal later decision, which this record does not perform, is:

Authorize one activation of status tree `1696cc771f415725863617b1392ef4324e8c1149` from that product commit, and only by `docs/handoffs/DEVPROXY_V217_ACTIVATION_PACKET.md`. Stop with no write if the live preflight does not match the packet. Do not merge pull requests #294, #292, or #293 as part of that decision.

That sentence stands only if the workflows on this receipt commit are green as well. A red receipt run withdraws it. The return comment is the place that either repeats this one decision or names the failing gate.

## Still blocked

- No file was copied into the served tree.
- No merge, deploy, restart, prune, or credential change.
- The 24 manual scripts and the 9 capability-blocked files were not run. They are recorded, not passed.
- Computed style, pixel gap, and live click from the ported specs were not run.
- The historical libsignal pin `0.106.0` is not current-latest proof. Current latest on the product commit is `0.108.7`.
- Source-ready is not production-ready. Nothing was activated.
