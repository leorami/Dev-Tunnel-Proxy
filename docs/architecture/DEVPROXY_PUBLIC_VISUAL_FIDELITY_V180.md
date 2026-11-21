# Dev Proxy public browser evidence fidelity - V180

**Source-only CTO architecture note, 2026-11-20. Nothing deployed.**

## Ground truth

The existing Dev Proxy Linux Chromium capture is real: V178 [run #44862607630](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/44862607630), 10/10 unskipped tests, guest public /encast/, original artifact #14690283046 independently downloaded and verified by CTO. Desktop screenshot is 1365x5240, mobile is 390x2704. The served HTML SHA256 is d9efc3104771d982822ab86b08358b93ec4f853a3e95fe6fcf92d1b25fc67105; appSourceSha reflects Engineer's host checkout attestation, not cryptographic parity to the transformed HTML.

**Visual finding:** Top-of-page hero and early imagery render, but several below-fold sections show large blurred placeholders in BOTH original, unedited screenshots. V178 capture_public_app takes page.screenshot(full_page=True) after one initial top viewport and no programmatic scroll. That is a testable **capture fidelity hypothesis** (lazy/IntersectionObserver entrance) and NOT proof the app is defective. The same-origin GET-only guard might also block external assets; never silently broaden it.

## Required behavior

Use the existing guest Chromium page/context. Scroll **as a user would** from top to bottom in bounded viewport-height increments, with deterministic waits for intersection, image decode and CSS readiness, then return to top before full-page PNG capture. Stop on bad HTTP, redirects, private/auth route, untrusted external request, unexpected writes, timeout, enormous page, or source drift. Do not script DOM class removal or edit CSS to hide a real product defect. If the page intentionally blurs images, report that and withhold whole-page acceptance rather than manipulate visuals.

Actual original PNG bytes + SHA256, dimensions, viewport, HTTP/served HTML and source provenance must be independently checked through the existing GitHub Actions artifact path. Browser-only visuals require **Linux**, not a macOS runner. The public artifact must never contain private Status/Health/Reports/Dashboard/Calliope pages, cookies, credentials, or route inventories.

## Non-claims / readiness

Passing the source tests proves capture behavior, NOT owner UAT. Reliable public full-page screenshots do not authorize private admin observation or production deployment. Authenticated Dev Proxy management UI still needs a separate owner-approved read-only/private transport boundary. One engineer primary; CTO reviews real source diff and genuine original pixels before visible acceptance.
