# Calliope: recorded browser evidence for a taught Next.js redirect-loop repair

**Status:** independent CTO source-only investigation / pre-integration review. Does not replace Engineer-I's active v91 assignment, grant new permissions, or require release delay. Baseline: Engineer-I v90 RETURNED `55e1ddaed111f327eefe834d34af6c36b2815e8c`; v91 CTO handoff pinned at `6e0593acffa240c6cbc67068c2ec5d6cc5ec0d16`.

## Problem proven by source inspection

Calliope's historical October 2025 training combined a real Next.js `/_next/` redirect-loop diagnosis with a successful browser replay. The current RC2 v86-v90 authenticated HTTP HEAD probes do **not** prove a browser loaded the JavaScript without a redirect loop or an HTML-masquerading-as-JavaScript response. The v91 pure patch proposal produces source before/after SHA256 and no live proof. A successful `HEAD 200`, candidate diff, KB entry or chat narrative must not be promoted to VERIFIED HEALING.

## Narrow independently implemented contract

`utils/calliope-recorded-browser-heal-evidence.cjs` is an **offline pure reducer** of two independently recorded browser-network captures for exactly one `/<slug>/_next/static/*.js` asset. Input is a carefully bounded, no-host/no-query/no-secret, two-capture trace containing a before-cycle and an after chain with 200 JavaScript MIME and no browser console errors. It confirms that the **recorded** before trace has a genuine redirect cycle, the **recorded** after trace ends with JavaScript (not HTML), and that they share the same asset path but use different capture IDs. It returns a stable SHA256 evidence digest for future receipt linking.

Even on matching traces, status is `RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION`, and `healingPerformed`, `ownerApprovalGranted`, `liveAttested`, `releaseGateSatisfied`, and `networkTransferAuthorized` are all **false**. The reducer has no network, browser, filesystem, Docker, model, command execution, state change or capability-registration functionality. Browser capture provenance and runtime health must be independently attested by a different trusted operator process and the existing approved Mac host worker before any release/UAT claim.

### Required integration behavior

1. The primary v91 Engineer may inspect this draft in read-only mode; do not copy or import dependent v92 source until the current v91 return is complete and reconciled. This is a separately owned future verification component, not a second Cursor assignment.
2. Future browser evidence must come from a genuine disposable `browser` replay (Playwright/Puppeteer with an exact trusted test Origin), record only safe route-relative paths and fixed MIME/status codes, and strip tokens/cookies/headers, full hostnames, query strings and body text before reaching this reducer.
3. For any real fix, require independently verified transaction/result identity (before SHA, apply receipt, restored route state and after browser capture), not this reducer's output alone. Record unsuccessful results as unsuccessful learning evidence. Never claim `healed` solely because this module returns a recorded-match status.
4. The original approval boundary is unchanged: only reviewed route mutation via signed fixed HMAC host settlement; no API Docker socket, arbitrary external URLs, process execution, credentials or public-ngrok mutation. Running repairs or accepting new capabilities remains an owner-scoped decision.

## Tests actually performed in isolated Node 22

Test-first missing-module RED observed. Local focused tests cover before-cycle/after-JS, false HEAD-only success, error-text-only claim, HTML fallback, JS MIME, wrong asset, console error, duplicate capture ID, malicious URL/query/percent/traversal, cross-route redirect, bounded hop count, reserved paths and no public executor API. Full Mac repo build, actual browser capture, signed host settlement, deployment and owner UAT are **not** claimed by this isolated source.
