# V214 Engineer completion

## Lifecycle

STARTED #271/7177561366. CTO pin `origin/cto/devproxy-v214-authorized-status-delivery-20261125@190a52c4d74e27c707afe45b42d0c8a7a24bddba`. Handoff `docs/handoffs/DEVPROXY_V214_AUTHORIZED_STATUS_DELIVERY.md`, blob `0e6ab5baaa183a1b39f35e981df590ed5e5146e0`. Parent READY / NOT STARTED is #271/7177009894. No V214 STARTED comment and no `engineer/devproxy-v214-*` branch existed at start.

Engineer branch `engineer/devproxy-v214-authorized-status-delivery-20261125`. This receipt is the only commit on top of the frozen pin. Protected `main` remained `590bcf2a980b434f533ddacac43a24a777a933e7`. `master` remained `62a4d7babae986ade1feb0fd6dbe7dd32532523a`. Draft #285 was not edited. V212 remains RETURNED/STOPPED #271/7166434156 at `ad080bb64d79e16f23c51213e3061fb917037e4b`. V213 remains CTO-only at `6e05877b076f9edc188382622cd4912abec7ed17`.

Work used an isolated checkout at the frozen pin. The dirty owner checkout was not switched. Its unrelated local edits were not modified. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`. No container operation, nginx reload, route or config edit, API source edit, report regeneration, Ask, audit, self-check, notification action, archive operation, protected merge, or second replacement.

## Before

The ordinary Status document was the reviewed pre-V210 blob `3709655a064ba4ef7a6f8543c42add6930240ec3`. SHA256 `943d3b39c5fe4c1bb7d9dddd8a1847ac37c2a738cc69fe1ba806a9c18696feec`. Size 266938. Regular file, link count 1, mode 644, no ACL and no extended attributes. Authenticated no-cache `GET` returned 200 with that SHA256 and that size.

nginx serves `/status` from a read-only directory bind of the status directory, not a single-file mount. `open_file_cache` is absent. The status HTML location does not set a cache header. A same-directory rename and its inverse were rehearsed on a test-owned fixture on the same volume as the status directory. The fixture was removed. A private preimage was kept. No live file was replaced during the rehearsal.

`dev-proxy`, `dev-proxy-config-api`, ngrok, and the already running Calliope host container were all started `2026-11-25T22:29:57Z`, restart count 0. Proxy image `9b2ae98f11d8`, API image `f44b069ce4b5`, nginx 1.25.5, API Node v24.22.3. The loaded `utils/proxyConfigAPI.js` is the durable product file, SHA256 `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3`, size 154706. `NODE_ENV=production`, deny inline Docker `1`, allow inline Docker `0`. The host worker pid file does not name a live process, and its log ends `HOST_WORKER_STOPPED_CLEANLY`. No separate notification-engine process was running. The API container already had `node utils/notificationsAPI.js` beside the config API. That process was not started or reconfigured here.

Anonymous boundaries before the replacement: `GET /health.json` 200, `GET /` 200, `GET /status/status.html` 302, `GET /admin/check` 401, foreign origin 403, `GET /config` 200 with only `apiBasePath` `/devproxy/api` and `version` `1.0.0`, anonymous `POST /devproxy/api/apps/scan?http=1` 302, anonymous `GET /devproxy/api/config/` 302.

## Gate

The candidate blob is `1728475984c35569b5b45caac0bed944ca7535a9`. Exact diff from the preimage: 136 insertions, 183 deletions. V214's parent is `6e05877b076f9edc188382622cd4912abec7ed17`, and the only file V214 adds is this handoff. The Status blob is unchanged from that tested tree.

Every script, stylesheet, and asset referenced by the candidate matched that tested tree:

| Path | Blob |
| --- | --- |
| `status/common.js` | `33d757a78f2d65edcaad93d543fa955010a7e069` |
| `status/common.css` | `28f006befdc02bc93f460abf04d2241a7a05ef4b` |
| `status/config.js` | `bd858c04942a6756dd43180830120463fe5eea5c` |
| `status/vendor/lucide.min.js` | `0123783f406f3141429457cf42d6afe86f01486d` |
| `status/vendor/marked.min.js` | `e12b0fab1b958792f45849d31abb3cdecc012d1b` |
| `status/vendor/purify.min.js` | `54a70fe024a729c6ef4a0a5d3557918063d5afad` |
| `status/vendor/LICENSES.md` | `ad6313d517e03d1a118dcc022244e88d693d0513` |
| `status/assets/calliope_heart_stethoscope.svg` | `d033ebbc47906ba8bc605803d258f00d14bc3579` |
| `status/assets/favicon.png` | `90a043995a2276f4424d2bebbf23327c88d4cc08` |
| `status/assets/favicon.svg` | `cf365c9a574b623fbd5c25e5dde5c43159bb65a1` |
| `status/assets/logo.svg` | `0d7f7fad5172097a687544267f556298ca378e2e` |

The candidate adds no `apiPath(...)` name and no fetch URL literal that the preimage did not already have. POST count is 15 in both. Each candidate `apiPath` name is present in the loaded API file. `window.DTP.showToast` exists in the live `common.js`, which is the tested blob, not an owner-only drift.

V213 hosted run 45716180297 is still recorded success on `6e05877b076f9edc188382622cd4912abec7ed17`. Job 139562695000 and job 139562788694 both completed success, and every listed step completed success. That gate was not re-run. The 711/711 figure is the accepted handoff record for those jobs, not a new count from this checkout. `test:all` was not run on the owner host.

Current archive baseline, taken before the replacement and unchanged after it: report set count 330624, set SHA256 `33ee3c22e8a480a31deae33dc81d87f1d117896e881230e5a51266676d6bea0a`. That count is not V211's 330618. Spool set count 2, set SHA256 `1e99cef0f77482019482b47921e724df7ffa7bd1ae8d9a2d6648b08ea500c6f2`. `health-latest.json` SHA256 `bbea1ba829efbaca882da61b9cbf105c9ad9c2fa984b77b71796c42541ceddbf`. `scan-apps-latest.json` and `scan-apps-2026-11-03T06-33-01-466Z.json` SHA256 `894f520aa47075342e3e499e0db86e58e845af2f8ec748560e581f78ce2e4a2f`. `bundle-diagnostics.json` SHA256 `54f33ca33e45db95c9f8dd1539446f88db0a391e084264fb26b3f26c0a1b43a6`. `/routes.json` is the nginx alias of `scan-apps-latest.json`.

## Action

One same-directory replacement. The blob was written to a temporary file in the status directory, mode 644, with no ACL and no extended attributes. `git hash-object` matched `1728475984c35569b5b45caac0bed944ca7535a9`. The live path was a regular file immediately before one `rename(2)` over it. The temporary name was removed by that rename. Replacement count: 1. No retry. Rollback count: 0.

After: size 263894, link count 1, mode 644, no ACL and no extended attributes. The modification time changed with the replacement. Disk SHA256 `f5c8e539c52ca7df782924f9bc6ce7e2f2e377f9ce52f5ea5ebba97513fbe5d4`.

## After

Authenticated no-cache `GET` returned 200, 263894 bytes, SHA256 `f5c8e539c52ca7df782924f9bc6ce7e2f2e377f9ce52f5ea5ebba97513fbe5d4`. The same hash was served again after the report re-read reload. Anonymous boundaries were unchanged: health 200, root 200, status document 302, admin check 401, foreign origin 403, config body still only `apiBasePath` and `version`, anonymous scan POST 302, anonymous config GET 302.

Proxy, API, ngrok, and Calliope container start times, image ids, and restart counts were unchanged. nginx config hashes were unchanged. `open_file_cache` remained absent. Report, spool, diagnostics, and health hashes above were unchanged. The only dirty owner file whose bytes changed is `status/status.html`. The owner checkout stayed on its previous branch.

**Operational state:** `STATUS_DOCUMENT_SERVED_VERIFIED`.

## Journeys

Ordinary authenticated Status page, light theme, disposable tab. The existing owner tab was not resized.

- Last scan chip: `11/3/2026, 12:33:01 AM`. Evidence chip: `Last scan only; not live health`. That is the report timestamp, not current health.
- Conflict card: reported count 2, decoded route details 0, and the text "Some conflict details unavailable or ambiguous. Verify current configuration before acting." Historical wording states that the card is not live routing authority and cannot change configuration.
- Row chips included historical localhost and ngrok labels for 503, 404, 401, 307, 308, and 200. Tips included reported server error, not found, client error, redirect, permanent redirect, and working correctly.
- Diagnose controls are present. The idle Calliope label is `Local-only`. Those controls were not clicked. The document's route Diagnose function sends `POST` `ai/audit`, which this assignment does not start.
- The visible header reload control is the `common.js` replacement. Its title stays "Reload configurations", and clicking it sent no request. `common.js` replaces the header on `DOMContentLoaded`, which is the same order as the preimage, so the document listener is not on the visible button. The document function `reloadConfigs` was invoked once. It sent only `GET /routes.json`, set the button text to `Report re-read`, and reloaded the page. No scan was started.
- The Calliope drawer was closed and opened again. At 390px width the open drawer measured 390px. Opening it sent only `GET` requests to the existing thoughts, health, and stats reads. The stored open preference was restored.
- Theme was light, switched to dark, and restored to light. The stored theme preference was unchanged at the end.
- Help Me, Ask, Self-Check, Dismiss, and route Diagnose were not clicked. No non-GET request was recorded for the wrapped journey actions. The wrapper was installed after the first load, so it does not inventory the initial document fetches.

## Visual evidence

Original PNGs, private only, not in git:

| Capture | Viewport | PNG bytes | SHA256 |
| --- | --- | --- | --- |
| Desktop, light theme, drawer open | 1365×900 | 183214 | `1ab403dc047e55d86e0080b36241b0cc3d86da8d3b3864771ecab82e46bd6905` |
| Mobile, light theme, drawer closed | 390×844 | 89937 | `f7b8581aa510efe88d1357cdf061f8bd073d5b3d2aff7629b5fde6354b864f0f` |

Tested candidate pin `6e05877b076f9edc188382622cd4912abec7ed17`. Served document blob `1728475984c35569b5b45caac0bed944ca7535a9`. Served SHA256 `f5c8e539c52ca7df782924f9bc6ce7e2f2e377f9ce52f5ea5ebba97513fbe5d4`. `testedSourceSha=servedSha` is not claimed. The owner tree remains mixed.

The disposable tab was restored to inner width 1152, touch emulation cleared, and closed. The existing tabs were not resized.

`BLOCKED_VISIBLE_PIXEL_TRANSPORT`. No already authorized private original-byte path was functional. The originals stay in restricted local storage. Hashes are not visual acceptance. No owner UAT.

**Visual state:** `BLOCKED_VISIBLE_PIXEL_TRANSPORT`, independent of the operational state.

## Release gate and parity

| Item | Before | Action | After |
| --- | --- | --- | --- |
| Status document | pre-V210 blob `3709655a`, served SHA256 `943d3b39` | one rename to blob `1728475` | `STATUS_DOCUMENT_SERVED_VERIFIED`, served SHA256 `f5c8e539` |
| Rollback | inverse rehearsed on a fixture | not required | rollback count 0 |
| Visual | served pre-V210 page | private 1365×900 and 390×844 | `BLOCKED_VISIBLE_PIXEL_TRANSPORT` |

V213 full secure-mode evidence was reused, not re-run. This single document is not whole-repository or loaded-API parity. The loaded API remains the durable product file above.

## Origin evidence

- `SOURCE_CURRENT`: not claimed for the whole tree. The served Status document equals reviewed blob `1728475984c35569b5b45caac0bed944ca7535a9`. The loaded API, nginx config, and other owner edits are not this branch.
- `SINGLE_RUNTIME`: one Config API on Node v24.22.3, one proxy (nginx 1.25.5), one ngrok, and the already running Calliope container (`node:22-alpine`, Node v22.23.2). No second API, proxy, ngrok, or status app was started. The host worker is stopped. No separate notification engine was running.
- `NO_SHADOW_APPS`: no second status app or listener was created.
- `REAL_APP_VERIFIED`: anonymous denials match the expected boundary. The signed-in Status page shows the November 3 report time, the evidence chip, the ambiguous conflict card, and historical HTTP labels. This is not owner UAT.
- `OWNER_WORK_PRESERVED`: other dirty checkout files, reports, diagnostics, spool, proxy, API, ngrok, and the parked processes were not changed by this replacement.

Dev Proxy lock blob `5194ef29f3b5b3fe20c6afca817723440e43f699` and Origin master lock `1a13179679ce9cf1172ac1506f2d37019a4b021d` are distinct files. Both pin Core `c49fb010cb9db6bb28e0345d7690d5bbd587b443` / blob `fda5e7311b8e0cc692827ad0918fb8fdec1f0250`. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2`. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` still does not name Dev Proxy. Registration remains pending. Operational adoption is not claimed.

STOPPED for independent CTO review. No further operational attempt is started from this receipt.
