# P0: paired notification-bridge UI executes integrity-unbound third-party JavaScript

## Current source evidence — not a live exploit claim
On the exact accepted single-primary V120 commit `7da2026a9b1bfd1cd2dacecc335bfaecb6788f62`, `status/status.html` Git blob `3a9eb28d3489f73ebf335ef937f9efbec2b0a319` contains:
- `https://unpkg.com/lucide@latest` (floating dependency, no SRI)
- `https://cdn.jsdelivr.net/npm/marked/marked.min.js` (floating dependency, no SRI)
- `https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js` (versioned but no SRI)
- `sessionStorage.getItem/setItem(NOTIF_BRIDGE_PAIR_KEY,token)` and `Authorization: Bearer ${token}` to localhost notification bridge.

That is a concrete **page-origin privilege/trust** boundary: any third-party script executing in this page can access the tab's sessionStorage and potentially misuse a stored bridge bearer. The current bridge source has Host/Origin/bearer checks, but **untrusted JS already executing inside a paired legitimate page is not separated from the bearer**. No active CDN compromise, successful attack, paired owner tab, exfiltration or live Mac exploit is asserted.

The checked-in `config/nginx.production.conf` does not add an explicit CSP header, but other runtime/platform headers were not inspected; do not claim absence of a live CSP without network evidence. This branch performs **no network requests** to CDNs or owner localhost, no credential access and no production mutation.

## RED-first isolated CTO contract

`tests/security/notification-bridge-status-thirdparty-script-trust.test.cjs` is additive, based on the V120 returned SHA and **not wired into canonical unit tests** while V121 is owned by the sole primary. The regression permits first-party locally-reviewed scripts and remote exact-version scripts **only if** they have a pinned SRI digest and `crossorigin=anonymous`. It forbids any unpinned or mutable CDN JS in the *paired privileged status page*. A static source-exact GitHub scan of V120 HTML identifies **three violations**; expected current-state result is intentionally RED until a reviewed UI correction.

The preferred repair is to ship vetted, version-pinned JavaScript locally as part of the trusted app artifact, then independently verify its digest, immutable delivery and browser behavior. As an alternative, exact immutable CDN URLs with independently verified SRI/crossorigin may satisfy the narrow test, but they still place third-party code in the origin; CSP, XSS hardening and least-privileged pairing lifecycle merit a holistic design review. Do not falsely certify SRI alone as complete browser authorization.

## Additional source-verified potential DOM injection sinks

Exact V121-returned `status/status.html` Git blob `3a9eb28d3489f73ebf335ef937f9efbec2b0a319` uses `title.innerHTML` to interpolate **raw `source` and `route`** into the Notifications Settings header (line ~1601), and `configHeader.innerHTML` to interpolate `source.replace(/\\.conf$/, '')` into grouped config headings (line ~2563). The same codebase's regular route-card title correctly uses `document.createTextNode(displayRoute)` (line ~2251), demonstrating a small viable rendering alternative.

This is an **unsafe source-level DOM HTML sink** if any affected identifier can carry attacker-controlled markup. Whether a remote adversary can actually influence those values in the live deployment **has not been established**. The RED-first test now independently asserts these two interpolations must be removed/replaced by text-node rendering before calling the privileged page safe; no malicious payload was executed, no browser or owner page modified. Other `innerHTML` sinks exist and must be audited if the UI remediation is authorized. SRI is **not a substitute** for DOM XSS protection, and a protected bridge must still authenticate every privileged operation.

## Independent parallelism / noninterference

Primary Engineer-I is **genuinely STARTED on V121**, GitHub PR #79 #6715181825, to perform only the owner-Mac read-only bridge authority check from CTO PR #126; it must not be interrupted, re-scoped, or given this draft as another prompt. This branch touches only an additional test file and this documentation. `status/status.html`, `smart-build.sh`, bridge auth, MAC state, route configs, passwords/keys, workers, LaunchAgents, Docker and nginx remain untouched.

After V121 actually RETURNS and the CTO reviews the committed diff, decide whether the red regression warrants one bounded status-page script-trust correction, using separate authorization for any production rollout. No owner intervention or UAT delay is requested by this research alone.
