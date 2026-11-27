# V214 Status UX corrections

## Lifecycle

STARTED https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7183405899.

Continued from `engineer/devproxy-v214-authorized-status-delivery-20261125@d65aa16e538aa475462f8671d0526326705f1f81`. Protected `main` stayed `590bcf2a980b434f533ddacac43a24a777a933e7`. No container, nginx, live file, route, or second Status activation. The owner checkout was not switched and its uncommitted changes were not edited. No protected merge.

Engineer commits on the existing branch, draft #286:

| Commit | SHA | What |
| --- | --- | --- |
| RED tests | `0717034867f3bf8d4476e467eb7fecafc25d340d` | Browser tests for the three defects |
| Fix | `924097d63bab47407f71f5323aff38323a929bb4` | Refresh handler, conflict card, mobile header |
| Receipt | this commit | This document |

Never-merge evidence branch `evidence/devproxy-v214-status-ux-visuals-20261126@4b3212eef83a218886fc1c96f26558b938097682`. Draft #288. Do not merge it.

## Defects and the fix

- The visible header refresh button is the `common.js` replacement. The document now listens on `document` for `#reloadConfigs`, ignores the button while it is disabled, and after the header is installed names it "Re-read the last scan report". The `reloadConfigs` body is unchanged: one `GET /routes.json?_t=<digits>`, then "Report re-read", then a reload.
- At 768px and below, card header actions wrap onto their own row, stay inside the card, and are at least 44px tall.
- The shared mobile header is a two-row grid. The brand and tools share the first row. Navigation is one horizontally scrolling row. The logo is 32px. The header stays within 128px. Health and Reports use the same header. Health JSON panels are constrained so they no longer widen the page.

## RED

Local, Playwright 1.56, before the fix: 4 failed, 1 passed. The passing test was the desktop single-row header. Failures:

- Visible button title was "Reload configurations", with no aria-label and no report re-read.
- A double click sent no `GET /routes.json?_t=`.
- At 360px the document scrolled horizontally. The conflict Dismiss button and the header actions extended past the viewport.
- Status header height at 390px was 239px.

Hosted RED, unfixed tree `c27053abf062971f295759dc1306d0bcd1fb18fd`: https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45761683528, job `139712906928`, conclusion failure. The browser-test step failed. Capture and upload still ran. Artifact `15089684720` `devproxy-v214-status-ux-originals`. Those five frames match the PR #287 pixels, including the tall header and the Dismiss button past the card edge.

## GREEN

Local browser tests after the fix: 5 passed. Affected Node suites passed 37/37: `v210-status-report-trust`, `v160-status-calliope-experience`, `notification-bridge-status-thirdparty-script-trust`, `calliope-status-chat-singleflight`. The synthetic fixture unit gates passed 7/7.

A directory-wide `node --test tests/security` on this Mac is not the release gate. It reported 1396 pass, 87 fail, 3 cancelled, 3 skipped. The failures are in rc1 host/nginx and libsignal files. None of those files are the Status document, `common.css`, or `common.js`.

Hosted gate on the fix commit `924097d63bab47407f71f5323aff38323a929bb4`:

- https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45763152175 Dev Proxy V212 secure release candidate, success.
- https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45763152100 Dev Proxy supported Node LTS source gate, success.

Hosted GREEN frames, evidence `4b3212eef83a218886fc1c96f26558b938097682`: https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45763302925, job `139718152830`, success. Artifact `15090896771` `devproxy-v214-status-ux-originals`.

`governance/owner_inline_originals.py` blob `7c8bdde23062482627f37d2a78560bfb37b4031c` at Origin `c7fd045116783cd26d70c55583f0349b9896d0c2` accepted all 12 PNGs: synthetic-only manifest, `testedSourceSha=servedSha`, dimensions, and SHA256. `inline_markdown` then stopped with `not_a_conversation_sandbox_file` because this Mac has no `/mnt/data` conversation sandbox. That is a path check after the byte check. It is not a digest failure.

Classification: `SOURCE_RECONSTRUCTED_PREVIEW`. `testedSourceSha=servedSha=4b3212eef83a218886fc1c96f26558b938097682` is the evidence commit that rendered the fixture, not the mixed owner tree. Status tree `a55d2193fc27ab8892a931566d74ea60e05d5753`. The only status paths that differ from V213 `6e05877b076f9edc188382622cd4912abec7ed17` are `status/status.html`, `status/common.css`, `status/common.js`, and `status/health.html`.

| File | Viewport | Theme | SHA256 |
| --- | --- | --- | --- |
| `status-desktop-light-drawer-open.png` | 1365×900 | light | `cbd682a3e0db2ea1cb7f4accce6ad4f3caa4fd0f9f9d323bf147e12597877ffc` |
| `status-desktop-dark.png` | 1365×900 | dark | `88372e59db990d26fe64ed40c7589c2847935d60bb927bbfaee0679d90b6302b` |
| `status-desktop-light-conflicts-decoded.png` | 1365×900 | light | `57aa96b6bcb44b81b9dfe17053c015b6f652d7669b6774ed87a02987ca844899` |
| `status-desktop-light-report-reread.png` | 1365×900 | light | `e319f2ecb28dba1f306add94c549a772ee5c348479bd1cd8678efb3b7f791488` |
| `status-mobile-light-drawer-closed.png` | 390×844 | light | `ea6a4572d9aaec79407dec2b5ef005f7a54e4dd43254a89f55d7370c1d7e2f08` |
| `status-mobile-dark.png` | 390×844 | dark | `b59dbf1d1b266fb8f1cd2bfb97a394e8645be6718f9782d558cc90b2054c3eaf` |
| `status-mobile-light-conflicts.png` | 390×844 | light | `1f81df794137be060caf08cb1dd7b6bf28db99340ee925edae6fe5ff82ae15ed` |
| `status-mobile-dark-conflicts.png` | 390×844 | dark | `811d98a774eb4a43cbe1cb7812ce39f930500cf62b3bdbddbc188d1b0bffb5a4` |
| `health-mobile-light.png` | 390×844 | light | `d6c91ddee70179d533812ccc26fca332d6336ec316a18b8e8501586b3f0ff98b` |
| `health-mobile-dark.png` | 390×844 | dark | `9bb31f2e11e5160aa2ec0a872a201323460489725f17c55ed2707498eda38926` |
| `reports-mobile-light.png` | 390×844 | light | `913239dd92d08f71e93cc6a15c94b565cb6a3faaf9ab1860d7d69876098c964f` |
| `reports-mobile-dark.png` | 390×844 | dark | `e7fdb615bdbf7bc92dac2e23f1e718d8c83d7871630a92c4b782e4239adfe568` |

The three at-rest desktop frames are byte-identical to the RED run and to PR #287. The mobile Status frames changed. The new frame shows the green "Report re-read" label. On a phone, Help Me and Dismiss sit inside the card, and the header is two short rows with the last nav label scrolling into view.

## Engineer UAT

Synthetic fixture only. No listener. Desktop 1365×900 and mobile 390×844, light and dark.

- All five destinations are present: `/status`, `/health`, `/reports`, `/dashboard/`, `/dashboard/#create-route`.
- Theme toggles and returns to the stored theme.
- View density toggles comfortable/compact and returns.
- The Calliope drawer opens and closes.
- Dismiss hides the conflict card and shows a toast. The toast text is the word "info" because the existing call passes the arguments to `showToast` in the other order. The card still hides locally. That argument order was not changed.
- After the page had loaded, those actions sent no requests. No non-GET. No external request.
- Help Me, Ask, Self-Check, and Diagnose were not clicked.

This is not owner UAT. No private visual acceptance is claimed. The live served Status document is still blob `1728475984c35569b5b45caac0bed944ca7535a9`. Serving the fixed blob needs a new owner-authorized activation.

## Left unchanged

- Health's own reload button still binds the static control that the shared header removes. Same class of bug, not changed.
- Health and Reports do not load the icon script, so their tool buttons have no glyph. Status does. Pre-existing.
- Owner edits, reports, the loaded API, and the running containers were not touched.

STOPPED for independent review. No further operational attempt is started from this receipt.
