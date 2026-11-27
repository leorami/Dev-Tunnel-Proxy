# V214 shared-shell corrections

## Lifecycle

STARTED https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7223485974.

Continued from `engineer/devproxy-v214-authorized-status-delivery-20261125@381473f0aa065b566d9dae1dbab52de5bf61ac9e` after CTO REVISE https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7197051400. Protected `main` stayed `590bcf2a980b434f533ddacac43a24a777a933e7`. No container, nginx, live file, route, worker, prune call, credential, or second Status activation. The owner checkout was not switched and its uncommitted changes were not edited. No protected merge. Draft PRs #286 and #288 stay drafts.

Engineer commits on the existing branch, draft #286:

| Commit | SHA | What |
| --- | --- | --- |
| RED tests | `f3082d5a6cba1c1f25d9d2520fc8eb106aa57775` | Shared-shell browser tests and source assertions |
| Fix | `d83b62a81b77231e59d33f566d6ec38d1e7dd9bb` | Shared refresh, drawer, Health evidence, Reports states, Dismiss order |
| Drawer restore | `ef31413a15cda81baf196e6604c2f6daa72c5e6e` | A drawer restored from storage is not left inert |
| Phone header | `63854b07c6b71945b5eb415441d17112ff10ba5b` | One nav row and one tool row under the wider Ubuntu font |
| Receipt | this commit | This document |

Never-merge evidence branch `evidence/devproxy-v214-status-ux-visuals-20261126@70b3f1b3db3e8151d518b18d9a0b4b291103a04d`. Draft #288. Do not merge it.

## What changed

- Status, Health, and Reports share one header refresh. The icon button stays the same size. A separate polite status line says what happened. A second click while a read is in flight sends nothing. Health re-reads `/health.json`, `/status.json`, and `/routes.json`. Reports re-reads `reports/list`. Status still re-reads `/routes.json?_t=` and then reloads. Failure text says the data could not be re-read. It does not name `scanApps.js` or `smart-build.sh`, and it does not say the configuration was reloaded.
- Health shows the endpoint result separately from the last scan. A missing or invalid report is Unavailable or Unknown. It says "0 reported on that scan" only when the report says 0. The timestamp and "Last scan only; not live health" stay visible. JSON panels are closed disclosures.
- The collapsed Calliope drawer moves past the gutter, is hidden, is not focusable, and does not take clicks at the screen edge. Opening focuses the question field. Escape closes it and returns focus to the opener.
- Reports distinguishes loading, empty, failed, and populated. Prune stays behind "Clean up old reports" and still asks before it posts.
- Dismiss now calls `showToast('Historical conflict report dismissed', 'info')`.
- At 320 the header is three rows: brand, tools, then all five labels. From 360 up, the brand and tools share a row and the five labels stay on the next row. Labels are not ellipsized. Controls stay at least 44px.

The first evidence pin, `1c200b8bc582958c017c97ada61006e166295e30`, failed on Ubuntu because the wider font wrapped the tools and the nav. Health at 360 was 149px and Health at 320 was 175px. That run is https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46038771927. The phone-header commit is the correction. On this Mac, with Arial forced onto the header, Health at 320 was 117px and the five labels summed to 254px inside a 308px nav. All five labels fit. The 144px allowance is only for 320. From 360 up the limit stays 128px.

## RED

Local, Playwright 1.56, before the fix. The five existing Status UX tests passed. The new shared-shell file had 11 failures and 2 errors. The new Node file had 4 failures. The Dashboard static check passed.

## GREEN

Local browser tests after the phone-header commit: 19 passed (5 existing + 14 shared-shell). Playwright 1.56. No listener.

Affected Node suites, 76/76 on Node 22.19.0 and 76/76 on Node 24.22.3: `v214-shared-shell`, `v210-status-report-trust`, `v160-status-calliope-experience`, `notification-bridge-status-thirdparty-script-trust`, `calliope-status-chat-singleflight`, `calliope-crosspage-singleflight`, `reports-list-contract`.

Hosted on the phone-header commit `63854b07c6b71945b5eb415441d17112ff10ba5b`:

- V212 secure release https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46039652675 success. Runner contract job `140643834404`: 11 pass, 0 fail. Full current contract job `140643960711`: 711 pass, 0 fail, 0 skipped, 0 cancelled.
- V203 Node LTS https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46039652654 success. Each job is 68 pass, 0 fail across its four steps. The historical status step, which includes `v214-shared-shell`, is 41/41 on Node 22 (job `140643834799`) and 41/41 on Node 24 (job `140643834466`).

A directory-wide `node --test tests/security` is not the release gate, and Node 24.22.3 does not run that directory as a test root. The 174 top-level `*.test.cjs` and `*.test.mjs` files were run instead. Two of them never settle on their own (`rc1-closure-gated-host-driver` "abort after asynchronous host check", and `rc1-host-operation-quarantine` "two simultaneous callers"), so the counted run used `--test-timeout=120000`. Result: 1479 tests, 1395 pass, 79 fail, 2 cancelled, 3 skipped, duration 235223ms. The failures and the two cancellations are rc1 host/nginx, rc2 candidate/worker files, and libsignal/request-binding files. None are the Status document, `common.css`, `common.js`, Health, or Reports. This is not a whole-repo pass.

Hosted browser evidence on `70b3f1b3db3e8151d518b18d9a0b4b291103a04d`: https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46039687433, job `140643946958`, success. Synthetic fixture gates 7/7. Browser tests 19/19 in 21.427s. Capture then uploaded the artifact.

## Evidence

Classification: `SOURCE_RECONSTRUCTED_PREVIEW`. Not owner UAT. `testedSourceSha=servedSha=70b3f1b3db3e8151d518b18d9a0b4b291103a04d`. The rendered engineer tip is `63854b07c6b71945b5eb415441d17112ff10ba5b`. Status tree `8c45bf494cd95401b6a82330e24b0b237ce5e28d`. Status document blob `765584fef92244a02e8d919d89ca2eb86f05c520`. The status paths that differ from V213 `6e05877b076f9edc188382622cd4912abec7ed17` are `status/common.css`, `status/common.js`, `status/health.html`, `status/reports.html`, and `status/status.html`.

The capture script and the published Origin extractor both stop at 16 frames (`MAX_FRAMES = 16`). These 16 cover 320, 390, 430, and desktop, light and dark, and the states the correction is about. They are not every width and theme.

Artifact `15218159312` `devproxy-v214-status-ux-originals`, 1516889 bytes. Authenticated download ZIP SHA256 `010c5aa5214570a7536e07f06185a5a0fdb4b5a5dd9262ce401cce20c8d497f7`, matching the Actions digest. `MANIFEST.json` SHA256 `57184a4ef844a95a68a84e75c059e665219f817b7952ed36716eba3fb5b61347`. `SNIPPETS.md` SHA256 `5ab8df75db6a10bde6eaaef4d1a166d641417f2de393b3521f13f9fa70530cb4`.

`governance/owner_inline_originals.py` blob `7c8bdde23062482627f37d2a78560bfb37b4031c` accepted all 16 PNGs: synthetic-only manifest, matching source and served SHAs, dimensions, and SHA256. `inline_markdown` then stopped with `not_a_conversation_sandbox_file` because this Mac has no `/mnt/data` conversation sandbox. That is a path check after the byte check. It is not a digest failure.

`deniedExternalCount` is 0. Eight fixture-origin GETs for `/.artifacts/calliope/healing-log.json` were denied. No owner host was requested.

| File | Viewport | Theme | SHA256 |
| --- | --- | --- | --- |
| `status-desktop-light-drawer-open.png` | 1365×900 | light | `cbd682a3e0db2ea1cb7f4accce6ad4f3caa4fd0f9f9d323bf147e12597877ffc` |
| `status-desktop-dark.png` | 1365×900 | dark | `88372e59db990d26fe64ed40c7589c2847935d60bb927bbfaee0679d90b6302b` |
| `status-mobile-light-drawer-closed.png` | 390×844 | light | `0d585d82f2db3b0c95fcff7207ad3be54f2b6477a7dd8912e07504c73281a9ec` |
| `status-430-light.png` | 430×844 | light | `0a4b02d6826308d026bb9db23ef2faa747e362a3005f5e700c4c267b7272728d` |
| `status-320-light.png` | 320×844 | light | `e5a13c4689baea43b614abae2b8aa18784463e3b811a86b466b52197c9feb97a` |
| `status-desktop-light-conflicts-decoded.png` | 1365×900 | light | `57aa96b6bcb44b81b9dfe17053c015b6f652d7669b6774ed87a02987ca844899` |
| `status-desktop-light-report-reread.png` | 1365×900 | light | `ec2e52f15029c126b8da0c1e4fa437954c347eeb5d45a1a0d408de8c91814a55` |
| `status-mobile-light-conflicts.png` | 390×844 | light | `86dd575870d7e2d276b7fb9bb1a3c064c906be22d345d6204e7905353e20e63c` |
| `health-mobile-light.png` | 390×844 | light | `9cc0a89f756550a679222929bcdc434a3ac06e93733b0e4e42f716c387fde73a` |
| `health-mobile-dark.png` | 390×844 | dark | `dad8dd88bccaa14de48115b5a6216affee7b6565539696ba1fd4a4a96fc55376` |
| `health-desktop-light-missing.png` | 1365×900 | light | `32ca75f6f9249b226475ae7f08538697dfc8ea5a3a67393100fc22f9dcb8b89f` |
| `reports-mobile-light-empty.png` | 390×844 | light | `364e05ff276305f99761e43a1d43ed42133c7fcf84464e647cb230f4ff2ac70f` |
| `reports-mobile-dark-empty.png` | 390×844 | dark | `720d7871237c19075adea7d05a38671706af95ea8d11e400cc2fa6a55b080845` |
| `reports-430-light-populated.png` | 430×844 | light | `39d0ebae941fd2cb5c0041f9526a64a8d801d36f426157d5407d786a0ca1f6c4` |
| `reports-mobile-light-failed.png` | 390×844 | light | `d370e0f563ab899e3345b24d714acb60b0429c31b41ebe8cdc57458532de9849` |
| `reports-desktop-light-cleanup.png` | 1365×900 | light | `ff15dbcd4e04a97e9d4e2998970db0086f3742f374e77161c7bcdec07cacdb7c` |

Reviewed from the downloaded bytes: icons are drawn, the closed drawer does not sit on the right or bottom edge, Health missing is Unavailable/Unknown with the caveat, the report re-read text is beside the brand and not inside the icon button, Reports empty/failed/populated are distinct, and cleanup is a closed disclosure until opened. The three at-rest desktop frames that do not show the new feedback line are byte-identical to the previous evidence set.

The live served Status document is still blob `1728475984c35569b5b45caac0bed944ca7535a9`.

STOPPED for independent review. No further operational attempt is started from this receipt.
