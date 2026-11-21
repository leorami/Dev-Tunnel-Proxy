# V178 — real browser UAT of an existing PUBLIC Dev Proxy application (no passwords)

**One primary Cursor Engineer-I, one bounded source-only mini-sprint, PREPARED not STARTED.**
Do not create a second app, restart the working proxy, invent a screenshot, or
turn this into a generic authentication/observer-service implementation.

## Proven starting truth

- Repo `leorami/Dev-Tunnel-Proxy` protected default `main@d79cee370f739c48bb9e18da13d4d6407b9df925`.
- CTO-reviewed PR #192 **MERGED** into main at `f8675304b2e70a83a5a83916b8b24d410ad2bb3a`.
- True Ubuntu Chromium [Actions run #44857318425](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/44857318425) is **GREEN, 4/4 tests, zero skipped**. It actually reached the public login HTML and transported two original desktop/mobile PNGs in artifact #14688332161; CTO independently read original bytes, hashes, dimensions and displayed images in owner ChatGPT. **No macOS runner. No ChatGPT Work switch.**
- Latest primary V177 #191 genuine STARTED #7056082809 → RETURNED #7056114748, CTO reviewed, PR #193 merged into main at above current SHA, source-only docs, issue closed.
- V175 observer draft #187 remains UNMERGED/NOT DEPLOYED and its JSON shells are NOT the actual Status app. V172's four live auth protections stay in place.
- Existing source script `scripts/visuals/capture_public_login.py` is **already browser-running source**; do not replace the proven pipeline.
- New CTO RED-first test `tests/visuals/test_v178_public_proxied_app_gate.py` deliberately fails because `validate_public_app_target` does not exist yet. Run it and preserve the RED before implementation.

## Product goal

Use the **same proven Linux-browser → original PNG → GitHub Actions artifact → CTO inline ChatGPT** route to inspect ONE REAL, EXISTING **OWNER-INTENDED PUBLIC** application reached through the working Dev Proxy, beyond its login page. The owner explicitly says other projects already inspect Dev Proxy apps. Do not confuse protected owner Status/Health/Reports/Dashboard or API routes with a publicly authorized proxied app.

## Work contract (source only)

1. Verify current STARTED/RETURNED/STOPPED and latest full GitHub SHAs. One genuine STARTED here only when actually implementing.
2. On the owner Mac, inspect *existing configuration metadata only* and prove one currently configured **public-intended** app URL/path and its existing app source repository/revision; never enumerate or publish private route names, secrets, user file paths, or credentials. If no suitable approved-public route exists, return `STOPPED_NO_OWNER_APPROVED_PUBLIC_APP`, do not synthesize one or broaden permission.
3. RED first: `python3 -m unittest -v tests/visuals/test_v178_public_proxied_app_gate.py`. The new secure entrypoint must require **both** an explicit public-route allowlist and owner-public intent; reject `/admin/*`, `/status`, `/health`, `/reports`, `/dashboard`, `/devproxy/api/*`, JSON private data, origin/path aliases, URL credentials, query tokens, and unknown or private routes. No wildcard/auto-discovery bypass.
4. Keep existing production browser capture for public login unchanged. Extend the script (and workflow only where needed) with a separate explicit mode for **one approved public application**, fresh browser context/no cookies/GET or HEAD only; do not accidentally capture authenticated browser tabs or private content. Preserve actual app source SHA separately from proxy source SHA; a live HTTP 200 alone does not establish source parity.
5. Capture genuine mobile and desktop original pixels of the **existing actual** app and source/response manifest (URL redacted if needed, hashes/dimensions, actual app source and served evidence); **nothing private is uploaded to a public GitHub artifact**. For any classification doubt, STOP without screenshot/upload and preserve private findings offline.
6. Run the proven Ubuntu GitHub Actions workflow with real Chromium **zero skipped** plus focused RED→GREEN; independently verify original artifact bytes and exact current source before owner-facing acceptance. Any code changes are Git-only on an isolated branch/draft PR. No production deployment, Nginx/Compose/ngrok/worker changes, protected merge, owner credentials, paid service, or private media uploaded.
7. Return one consolidated STARTED→RETURNED/STOPPED receipt, full branch/SHA/PR, actual source-tested/served revision, screenshot transport evidence location, zero-skip test count, and whether the CTO can actually retrieve original pixels. Do not claim the owner saw inline screenshots merely because Cursor saw them.

**Important separate gate:** Protected Status, Health, Reports, Dashboard and Calliope require a truly least-privilege, owner-authorized private browser evidence channel, **not** this public workflow. Never post owner-private pixels to a public-repo artifact. Preserve the owner goal of CTO independent navigation without asking for the master password; do not claim that protected capability exists merely because public app screenshot delivery succeeded.

## Done

One verified, pre-existing public proxied application successfully captured by real Chromium with exact approved route and app-source provenance, its original screenshot bytes reachable for CTO display, no authentication or privacy downgrade, no working proxy changes. Or one truthful STOP cause if no approved-public app can be verified; do not create iterative artificial hardening cycles.

**Exact engineer command:** `Execute origin/<this-cto-branch>@<actual-full-remote-40-SHA>:docs/handoffs/DEVPROXY_V178_PUBLIC_PROXY_BROWSER_EVIDENCE.md exactly as written.`
