# V180 — make the existing PUBLIC app screenshots faithful below the first viewport

**ONE PRIMARY Cursor Engineer-I. PREPARED / NOT STARTED.** This is an end-to-end browser capture fidelity fix, not a new app, private auth implementation, or deployment.

## Verified starting state

- Repo leorami/Dev-Tunnel-Proxy. Protected canonical main at bb37a9c851fedd1037f6dd5b7191c812da9fb6b7 (recheck directly before execution).
- V178 #195: authentic STARTED #7056736994 → RETURNED #7056823217; primary correction #7056826339; CTO original-pixel/source review #6002645130; PR #198 merged, source-only, at c77c51e9cfc821049adf55089b26bfe8cad36b16. Issue #195 CLOSED. No active primary known at planning boundary.
- Original PUBLIC Encast /encast/ desktop 1365x5240 SHA256 c13810b9bbf8bb2dc5f96da907b3e4198b3dd34fd05f494c59edbb278c025ba2 and mobile 390x2704 SHA256 571ed6b87c72c920c799d900d3ed4d7883b38fc46f86f0fc4906495dfccfedc7, independently inspected via Actions artifact #14690283046 on GREEN run #44862607630 (10/10 tests, zero skips).
- Visual RED evidence: several lower cards remain blurred/placeholder in both original full-page captures, although the hero and early cards load. Existing capture_public_app screenshots fullPage at initial scroll position; root cause may be lazy-loading vs intentionally blurred UI vs denied external assets. DO NOT declare product defect without browser interaction proof.
- V179 independent source security PR #197 merged at 1260f74e767f50b598dfcc17dfd59826a95b718a, normal production Nginx ^~ guards preserved; PR #196 pixel-verifier merged source-only at current main. Neither touches this task.
- CTO new RED test tests/visuals/test_v180_fullpage_scroll_fidelity.py deliberately imports not-yet-existing stabilize_public_app_page from scripts/visuals/capture_public_login.py and runs a genuine browser IntersectionObserver fixture that starts with 2 blurred belowfold cards. Architecture canon docs/architecture/DEVPROXY_PUBLIC_VISUAL_FIDELITY_V180.md. Pin exact remote CTO branch SHA at dispatch.

## Contract and work

1. Reconcile latest GitHub issue #195 terminal, main full SHA and exclusive primary; if another real primary STARTED after that, preserve it, do not interrupt. Start only when actual work begins, post authentic STARTED to coordinating issue.
2. RED first: run the new focused test and capture missing helper failure; do not weaken it. Add a bounded, source-only stabilizer to the existing Playwright public-app capture that scrolls through the visible document, allows real intersection/lazy asset activation, waits reasonably for images/transitions, returns to top, and does not fake CSS or edit app DOM.
3. **Allowed files:** scripts/visuals/capture_public_login.py, tests/visuals/test_v180_fullpage_scroll_fidelity.py, tests/visuals/test_public_login_capture.py, .github/workflows/public-login-visual.yml if needed. Canon and handoff frozen; no Encast app repo change. Do not modify the public-login proven behavior, protected Auth UI, Nginx, Compose, tunnel, credentials, host worker or notifications.
4. Preserve exact PUBLIC /encast/ allowlist, same-origin GET/HEAD, fresh no-cookie browser, rejection of private paths/encoded aliases and denied outside resources. Scrolling is the only new browser interaction. Bound maximum page height, steps and waits; stop with first cause for app redirects, missing source evidence, uncertain public classification, or external asset restrictions. Do not allow third-party origins to make screenshots look prettier.
5. Run full isolated fixture browser tests under Ubuntu Chromium with zero skips (existing 10 + new fixture), canonical relevant checks, actual live public Encast capture, source/served-HTML/proxy provenance and real desktop/mobile PNG SHA. Inspect page visually after normal browser scrolling. If lower cards remain blurred, determine from read-only browser evidence whether source intentionally blurs or resources were blocked; report honestly and stop without calling UAT PASS.
6. Provide one consolidated RETURNED/STOPPED issue receipt, exact branch/full SHA and draft PR, red and green transcript, working actual screenshot artifact IDs, which sections remain blurred, permission actions NOT performed. Do not claim CTO saw pixels until CTO actually retrieves bytes and displays originals INLINE.

## Stop conditions

NO protected main merge, live service reload/deployment, owner credentials, auth bypass, private admin screenshots to public GitHub, fake layout, owner checkout reset, cross-project source writes or arbitrary route discovery. Do not ask the owner to reauthorize what this source-only handoff already permits. Only meaningful specialists if nonoverlapping; this coupled browser/test scope needs one primary.

## Definition of done

Actual lazy-scrolling browser behavior passes the newly added deterministic RED fixture after implementation and Ubuntu native real browser checks, with honest source-matched original public app visual evidence and one consolidated return. Privileged Status/Health/Reports/Dashboard/Calliope remains a separate owner-controlled gate; this task cannot claim it.

## Next Engineer-I instruction

Execute origin/<EXACT_CTO_BRANCH>@<FULL_40_SHA>:docs/handoffs/DEVPROXY_V180_FULLPAGE_VISUAL_FIDELITY.md exactly as written.
