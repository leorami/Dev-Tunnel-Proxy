# V211 Engineer completion

## Lifecycle

STARTED #271/7165402130. CTO pin `origin/cto/devproxy-v211-authorized-status-activation-20261125@fe05e2c96283b43cb6a2c26fbc0a9395983cb9ae`. Handoff blob `a129d48937e4028a7f6bf764f2473a1fdc84767d`. Engineer branch `engineer/devproxy-v211-authorized-status-activation-20261125`. This receipt is the only commit on top of that pin. Protected `main` remained `590bcf2a980b434f533ddacac43a24a777a933e7`. Draft #281 was not edited. V210 remains RETURNED/STOPPED #271/7160947988 at `ec2af0d721a661abab3f26f9dbca251f74bd2f8a`.

Work was done from an isolated worktree at the frozen pin. The dirty owner checkout was not switched. Its unrelated local edits, including `status/common.js`, `status/common.css`, and `status/reports.html`, were not modified. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`. No restart, nginx reload, Docker change, route or report rewrite, API source change, legacy scan, notification or bridge action, archive, or protected merge.

A one-word permission probe on #271 was deleted, and the first revision of #7165402130 was a one-word placeholder replaced immediately with the STARTED text. Neither revision contained evidence.

## Lane A — Status document

**Before:** the served Status document and the owner-checkout file were the same bytes. Git blob `3709655a064ba4ef7a6f8543c42add6930240ec3`. SHA256 `943d3b39c5fe4c1bb7d9dddd8a1847ac37c2a738cc69fe1ba806a9c18696feec`. Size 266938. That is the reviewed pre-V210 blob. Authenticated no-cache `GET` of the Status document returned 200 with that SHA256. The file is a regular file, link count 1, mode 644, no ACL and no extended attributes. nginx serves it from a directory bind of the status directory, not a single-file mount. `open_file_cache` is not set. A same-directory rename and its inverse were rehearsed on a test-owned fixture on the same volume. A private preimage was kept. No live file was replaced during the rehearsal.

**Candidate:** reviewed V210 blob `1728475984c35569b5b45caac0bed944ca7535a9` at `ec2af0d721a661abab3f26f9dbca251f74bd2f8a`. The exact blob diff is 136 insertions and 183 deletions. The script sources are unchanged and local: `/status/vendor/lucide.min.js`, `/status/config.js`, `/status/common.js`, `/status/vendor/marked.min.js`, `/status/vendor/purify.min.js`. The added lines do not introduce a CDN script, `innerHTML`, `insertAdjacentHTML`, `document.write`, or `eval`. The live page still depends on the owner-local `common.js` and `common.css`, which this lane did not overwrite.

**Action:** none. The document was not replaced.

**After:** `STATUS_BLOCKED_BEFORE_MUTATION`.

Full applicable release verification could not be completed safely. On this pin, `smart-build.sh test:all` runs `test:unit`, then `test:thoughts`, then `test:calliope`, and stops at the first failure. `test:unit` includes the V171 group, which starts a disposable nginx container. That is forbidden on the owner host. `test:thoughts` runs `test/calliope-simple-test.js`, which POSTs Ask, and `test/test-incremental-thoughts.sh`, which POSTs `audit-and-heal`, both at `localhost:3001`. `test:calliope` runs the Ask test again and then `test/site-auditor-test.js`. No existing workflow runs `smart-build.sh test:all`. The V210 run #45603519552 is the scoped 64/64 Node test, not this full runner. Adding a workflow, stubbing those tests, or treating the scoped run as a waiver would violate the handoff. Scoped success was not reused as a release pass, and those commands were not run against the owner host.

No rollback was required because the live file was not changed. Served bytes after the decision still hash to `943d3b39c5fe4c1bb7d9dddd8a1847ac37c2a738cc69fe1ba806a9c18696feec`.

## Lane B — one bounded observation

**Before:** the loaded Config API process is `node utils/proxyConfigAPI.js`, Node v24.22.3, started `2026-11-25T06:10:55Z`. The loaded `proxyConfigAPI.js` matches the bind-mounted product file (size 154706, mtime before that start). `POST /devproxy/api/apps/scan` requires the management auth boundary. `requireAuth` checks trusted origin and then the existing session before the safe handler. The safe handler is `inlineHostDockerUnavailable()` plus `http=1`, and it returns before `classifySecureManagementOperation` and before the later `spawnSync(test/scanApps.js)` handler. In the running process that predicate is true: `NODE_ENV=production`, deny flag `1`, allow flag `0`, and the activation spool is set. Any one of production, deny, or a configured spool blocks inline Docker. The legacy spawn cannot run for this call.

The loaded audit adapter sends HEAD only to `dev-proxy:80`, with a fixed Accept header, no caller host, no redirect, and no auth forwarding. The scanner allows at most 32 routes and 4 concurrent probes. `bundle-diagnostics.json` is the mounted checkout file, SHA256 `54f33ca33e45db95c9f8dd1539446f88db0a391e084264fb26b3f26c0a1b43a6`, size 6667, regular file, link count 1, mode 644, generated `2026-11-19T20:04:52.110Z` in the bundle-generator shape. The reader accepted it. It has 52 included rows, 37 unique safe routes, so the probe set is 32 with `truncated` expected and 20 skipped. Filename inventory is separate: 17 app snippets. The diagnostics file was not regenerated.

**Action:** one authenticated same-origin POST to the already loaded `/devproxy/api/apps/scan?http=1`. No extra headers, no body, no retries. Started `2026-11-25T14:38:34.333Z`, ended `2026-11-25T14:38:35.074Z`, 741 ms.

**After:** `CURRENT_LOCAL_HEAD_OBSERVATIONS_VERIFIED`.

HTTP 200. Top code `APPS_INVENTORY_LOCAL_READONLY`, count 17, mode `LOCAL_APPS_CONF_ONLY`. `httpScan.code` is `READONLY_HTTP_SCAN_EVIDENCE_ONLY`. Observed 32, HTTP-green 5, HTTP-non-green 27, skipped 20, truncated true. Result codes were only `LOCAL_HTTP_OK` (5) and `LOCAL_HTTP_NOT_GREEN` (27). Unavailable probes: 0. `routeModified`, `productionChangeAuthorized`, `deployed`, `dockerUsed`, and `healingPerformed` were false. `liveAttested` was false. This is not full app functionality and not a persisted report refresh.

Unchanged after the call: Status document blob `3709655a064ba4ef7a6f8543c42add6930240ec3`; diagnostics SHA256 above; `scan-apps-latest.json` and `scan-apps-2026-11-03T06-33-01-466Z.json` SHA256 `894f520aa47075342e3e499e0db86e58e845af2f8ec748560e581f78ce2e4a2f`; `health-latest.json` SHA256 `bbea1ba829efbaca882da61b9cbf105c9ad9c2fa984b77b71796c42541ceddbf`; report-set count 330618 and set SHA256 `fa54a1003a8bdaec562d5792a32aa81379283f2e06f5997349583b7a15337918`; spool tree SHA256 `ecb49539621f86180cb7f66a555f43a61664a9ebcfffa8dfb4aa473fe7d31346` (2 files); proxy started `2026-11-23T18:53:08Z`; API start unchanged. The parked notification engine state file changed during preflight and again after the observation. That engine was already running on Node v25.9.0 and was not part of this request. It is not attributed to the scan.

Anonymous boundaries before the observation, and not repeated after it: `GET /health.json` 200, `GET /` 200, `GET /status/status.html` 302, `GET /admin/check` 401, foreign origin 403, `GET /devproxy/api/config/` 302 and foreign 403, `GET /config` 200 with only `apiBasePath` `/devproxy/api` and `version` `1.0.0`, anonymous POST scan 302. The notification bridge service is not loaded. The notification engine job remains running. No bridge enablement.

## Visual evidence

The served page, still the pre-V210 document, shows the label **Generated**, timestamp **11/3/2026, 12:33:01 AM**, **Conflict Detected**, and the unparsed notice "Detected 2 conflicts, but couldn't parse the details." Rows still show historical localhost and ngrok HTTP labels, including 503 and 404. Light theme. No report content was transmitted for the capture. Diagnose was not opened, because Lane A did not change the document and the capture was not a candidate-journey acceptance.

Original PNGs, private only: desktop 1365×900 SHA256 `7658c077ee64472681d54ade030761b8938b2161706ba9bedb95d121165d84fa`; mobile layout viewport 390×844 SHA256 `d1d1f953967d57e7e03c6b1e05541276d68faf8b51dc70d29219b8bd99dcdf86`. The mobile capture shows the already-open Calliope drawer. The disposable tab was restored to inner width 939, touch emulation cleared, and closed. The existing tabs were not resized.

`BLOCKED_VISIBLE_PIXEL_TRANSPORT`. No approved original-byte transport was available. Hashes are not visual acceptance. No owner UAT.

## Release gate and parity

| Lane | Before | Action | After |
| --- | --- | --- | --- |
| A Status document | pre-V210 blob `3709655a`, served SHA256 `943d3b39` | not mutated | `STATUS_BLOCKED_BEFORE_MUTATION` |
| B local HEAD observation | safe handler proven | one POST `http=1` | `CURRENT_LOCAL_HEAD_OBSERVATIONS_VERIFIED` |
| Visual | served pre-V210 page | private 1365×900 and 390×844 | `BLOCKED_VISIBLE_PIXEL_TRANSPORT` |

Full applicable release gate: not run. Zero-failure scope of this operation is the one observation response above, not a test suite. No test was skipped by deleting or stubbing it. Limitations: `test:all` cannot be executed honestly on the owner host or by any current isolated workflow; owner-local status dependencies remain; the observation does not refresh the November 3 report; pixel bytes were not delivered to CTO.

Single-file parity: served Status document equals blob `3709655a064ba4ef7a6f8543c42add6930240ec3`, not candidate `1728475984c35569b5b45caac0bed944ca7535a9`. Overall source is mixed. The loaded API is the durable product tree, not this branch. `testedSourceSha=servedSha` is not claimed.

## Origin evidence

- `SOURCE_CURRENT`: not claimed. The running Status document is the pre-V210 blob. The running API is the already loaded product, not this receipt branch.
- `SINGLE_RUNTIME`: one Config API on Node v24.22.3, one proxy (nginx 1.25.5), one ngrok, one host worker on Node v24.22.3, one notification engine on Node v25.9.0. The bridge is not loaded.
- `NO_SHADOW_APPS`: no second API, proxy, ngrok, worker, or status app was started.
- `REAL_APP_VERIFIED`: anonymous denials match the expected boundary. The signed-in Status page shows the November 3 generated report and the unparsed conflict notice. One current local HEAD observation was recorded. This is not owner UAT.
- `OWNER_WORK_PRESERVED`: dirty checkout, reports, diagnostics, spool, proxy, API, worker, and the parked engine remain. The Status document was not replaced.

Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2`. `CORE_PROTOCOL_LOCK.json` blob `1a13179679ce9cf1172ac1506f2d37019a4b021d`. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` still does not name Dev Proxy. This caller sees no Origin namespace, so registry adoption is not visible. Registration remains pending. Operational IP adoption is not claimed.

STOPPED for independent CTO review. No further operational attempt is started from this receipt.
