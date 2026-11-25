# V210 engineer completion — historical status-report trust

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7160782403
CTO pin: `origin/cto/devproxy-v210-status-report-trust-20261125@ad907d2417f71a9b6cc3efaf601055637d035933`
Handoff blob: `56e902a79ab6968ce52ba3b049d594449c90f9c9`

Source correction is committed and not deployed. No scan, route edit, nginx or Docker mutation, notification change, export, or restore.

## Lifecycle

Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7`. V209 remains RETURNED/STOPPED #271/7160298926 at `engineer/devproxy-v209-notification-runtime-persistence-20261125@6d948b7d4e8ccbc5c083d0912a35d7922289734f`. Draft #279 and draft #280 were not edited. V210 READY / NOT STARTED was #271/7160529101. No V210 engineer branch existed before this start.

Work was done in an isolated worktree at the frozen pin. The dirty local `master` checkout was not used. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2` still matches. `CORE_PROTOCOL_LOCK.json` blob `5194ef29f3b5b3fe20c6afca817723440e43f699`. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` still does not name Dev Proxy. This receipt does not claim registration or operational adoption. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`.

Draft PR: https://github.com/leorami/Dev-Tunnel-Proxy/pull/281
Base: frozen CTO V210 branch, not protected `main`.

## Source

Both producer strings in `utils/conflictResolver.js` match the parser. A new conflict is `Route <route>: NEW CONFLICT - <winner> wins (first config) over <others>`. A stored resolution is `Route <route>: Using persisted resolution - <winner> wins (conflicts with <others>)`. Others are joined with a comma and a space. Qualified `apps/` and `overrides/` names and every losing participant are preserved. Malformed, unsafe, and same-route ambiguous input produces no selection.

Three reachable defects were not covered by the first parser fix:

- When Calliope affordances are off, the Diagnose control calls `openDiagnoseModal`. That function put the reported route and the reported target names into `innerHTML`.
- The reload control re-read `/routes.json` and then said "Reloaded!". Its failure text named `node test/scanApps.js` and `./scripts/smart-build.sh`. The fetch used `cache: 'no-cache'` rather than `no-store`.
- A historical HTTP 5xx was described as a current upstream service issue, and a recorded status 0 was described as no response from the target now.

RED `da0e3342299187e4a253ac4497c13bb068e9d561`: on Node v24.22.3 and Node v22.19.0, 7 tests, 4 pass, 3 fail, 0 skipped. The original four tests passed. The three new tests failed.

Fix `5fcbf3b31d5dd379642a59c66544042a9f369340`: the diagnose modal builds its heading, issue list, and buttons with text nodes. The reload control says "Report re-read", uses `cache: 'no-store'`, and on failure says that it does not start a new scan or change configuration. Status 0 and 5xx tooltips stay prefixed "Last scan only:" and describe that scan. No authorized workflow was removed and no backend gate was changed.

`resolveConflict`, `renameRoute`, `autoFixConflict`, `applySuggestion`, `viewConfig`, `openConfigModal`, and `saveConfig` have no remaining caller in the rendered report. They were left in place. `openRecommendModal` also has no caller; it still names the legacy scanner and still interpolates report keys into markup. `status/health.html` still names that scanner on its own reload failure path. Neither was changed.

A private renderer executed the page functions against synthetic reports. Qualified multi-participant text rendered as text. Malformed and ambiguous reports said the detail was unavailable and rendered no path. The help control set one fixed sentence and clicked a stub that made no request. A missing or future `generatedAt` displayed as Unknown. An old timestamp did not. Status 503 and 0 used the scan-observation wording. A route containing markup stayed in a text node, and the issue line did too. All three inline scripts in `status/status.html` parsed. No network call was made.

## Tests

Local canonical unit groups, excluding `tests/security/v171-four-auth-prefix-nginx.test.cjs`: 53 groups, 631 pass, 0 fail, 0 skipped, on Node v24.22.3 and on Node v22.19.0. That run was the pre-fix tree, so its V210 group was the original 4 tests. `tests/security/v201-origin-adoption.test.cjs` and `tests/security/v201-retire-v200-diagnostic.test.cjs`: 4 pass, 0 fail, 0 skipped, on both local lines.

After the fix, on both local lines, `v210-status-report-trust`, `v160-status-calliope-experience`, `notification-bridge-status-thirdparty-script-trust`, and `calliope-status-chat-singleflight` together were 37 pass, 0 fail, 0 skipped. The other local tests that read `status/status.html` were 53 pass, 0 fail, 0 skipped on Node v24.22.3. `./smart-build.sh test:unit` was not run, because that command also starts the disposable nginx fixture.

CI on the fix commit `5fcbf3b31d5dd379642a59c66544042a9f369340`, not on this receipt:

- Source gate #45603519552 succeeded. Node v22.23.5 and Node v24.22.3. The historical status step was 37 pass, 0 fail, 0 skipped on each line.
- Dispatched V190 run #45603513369 succeeded on Node v22.23.5. The job command included the V171 file. Both disposable nginx cases passed (`model RED` and `model GREEN`). The command result was 12 pass, 0 fail, 0 skipped. This did not run on the owner host.

The frozen pin's earlier runs remain as the handoff recorded them: RED #45600457803, implementation GREEN #45600614356, and final pin #45600773710, #45600774467, and #45600773896. This receipt does not restate those as runs of the engineer head.

## V209 fixture discrepancy

The saved V209 unit log shows the disposable nginx group executed on the owner host: 3 pass, 0 fail, 0 skipped. The two container cases took about 671 ms and 750 ms, so they were not skips. No container whose name starts with `devproxy-v171` remains. The local 53-group count above is not a claim that the fixture passed locally in V210, and a 53-group exit code would not have proved zero skips. The isolated count is the V190 run above.

## Freshness

`/routes.json` and `/status.json` are authenticated aliases of the scan report and the health report. Anonymous requests for both returned 302. The scan report's `generatedAt` is `2026-11-03T06:33:01.466Z`. It has two targets, zero warning strings, and a conflict total of 2. Its status histogram is 200×2, 307×2, 308×2, 401×2, 404×12, and 503×36. Those 503s belong to that scan. They are not a current outage. The health report's `generatedAt` is `2026-01-07T23:21:31.927Z`.

Anonymous `GET /health.json` returned 200. That route returns a fixed ok body when the health file exists. It does not report the file's age. Anonymous `GET /` returned 200. Anonymous `GET /status/status.html` returned 302. Anonymous `GET /admin/check` returned 401, and the same request with a foreign origin returned 403. Anonymous `GET /devproxy/api/config/` returned 302, and the foreign-origin request returned 403. Anonymous and foreign-origin `GET /config` returned 200 with only `apiBasePath` and `version` `1.0.0`. Anonymous `POST /devproxy/api/apps/scan` returned 302. The loaded management classifier still marks that POST `LEGACY_UNSETTLED_MANAGEMENT_BLOCKED`. No scan producer was running. The Config API process is Node v24.22.3. The host worker process is still the Node 24 runtime and was not re-qualified. The proxy process start was `2026-11-23T18:53:08Z` and the API process start was `2026-11-25T06:10:55Z`.

The served status document is the mounted checkout, not this candidate. An existing authenticated session was used in a new browser tab. The served page is the light theme and still says "Generated", still uses the pre-correction conflict subtitle, and still shows the unparsed-conflict notice. Its displayed time matches the November 3 report. Private viewport captures, not published: desktop 1365×900 sha256 `0e808ee074c595cc45ea5cb68bc76d397c1629bd4c77589659b4f6fbca211a1e`, and mobile 390×844 sha256 `dfad84cdcd4ddf8cd98d31a868dcbe013f767c3f1010f4f000d62872708bd64a`. The narrow capture shows the already-open Calliope drawer. The disposable tab was returned to a responsive width of 939 before it was closed. The existing tabs were not resized.

V210 is not the served page. Candidate pixels are `BLOCKED_VISIBLE_PIXEL_TRANSPORT`. No visual acceptance and no owner UAT.

## Decision

One next step: an owner-authorized read-only refresh of the November 3 scan report. The source now describes that report as historical, but the loaded page does not include this source, and the loaded API still blocks `apps/scan`. The grant has to show that the loaded handler dispatches the existing constrained HEAD inventory and not `test/scanApps.js`. Do not start a scan, restart autoscan, or treat the 36 historical 503s as a current outage. No notification recovery and no deployment follow from this receipt.
