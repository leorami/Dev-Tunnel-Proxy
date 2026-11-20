# Mandatory CTO Visual Access — Dev Proxy v1

**Status: source-only CTO security contract; NOT wired to an observer server; NOT deployed.** Owner decision: Dev Proxy (not automatically every Origin consumer) must give the CTO authenticated read-only visual access to the single canonical live app, with genuine screenshot bytes and exact source snippets inline in ChatGPT. Engineer-I's independently captured screenshot/UAT evidence remains mandatory too.

## Existing site and real access truth

Owner-supplied canonical application: `https://ramileo.ngrok.app/status`; verify the actual live origin and loaded source before inspection. The current ChatGPT container DNS could not resolve this host; the public URL fetch did not return pages. GitHub source access is NOT browser access. Never claim an authenticated screenshot, live visual approval, provider launch, or observer implementation without original pixel bytes. No separate disposable app or mockup may substitute.

## Permission model: no master password in chat

Only an existing trusted, authenticated owner session may explicitly authorize an inspection grant *within* the app's secure interface. Never ask the owner to paste a password, cookie, API token, MFA code, one-time URL secret, hostname/credential configuration, or session material into ChatGPT, Cursor or GitHub. Use a trusted provider/browser handshake with owner consent and the narrowest independently authenticated **observer** identity: never reuse the `admin_session` cookie or admin bearer as the observer credential.

Server-side observer grant must be distinct, **revocable**, one-use redeemable, auditable without secret values, origin/audience/source-SHA bound, and expire within 10 minutes. No secret-bearing GET/magic URL or referrer leak. Deny absent consent, reused redemption, expired/revoked grants, source drift, untrusted browser origin, unknown authenticated client, or disabled transport. If an authenticated browser/plugin is unavailable, return `BLOCKED_CTO_BROWSER_TRANSPORT` rather than weaken auth. GitHub PR/issue comments are not an authorization channel.

Observer privileges are GET/HEAD of **exact allowlisted** UI documents and source-manifested inert static assets only. No wildcard asset roots or arbitrary URL fetch, no cross-origin navigation/capture, no admin `GET`, `/devproxy/api/*`, routes, private JSON, `.artifacts`, notifications, healing, config, Ask, reload, host/worker operations or hidden write method. Enforce at actual server and Nginx, not only via disabled buttons. If the UI requires dynamic information, create a separately audited, explicitly field-allowlisted **sanitized read-only projection**. Never forward admin APIs or private route names, owner paths, sessions, HMAC, queues, secrets or user/child information to the observer.

Pure, unconnected CTO contract: `utils/cto-observer-access-policy.cjs`, test `tests/security/cto-observer-access-policy.test.cjs`. The caller alone must verify grants server-side; passing a JS object from a client is not authentication. Neither test GREEN nor a linked file grants network access, token issuance, or browser permissions.

## Mandatory UI evidence and Source→Runtime proof

A supported **ChatGPT Work Cloud Browser** or explicitly connected Dev Proxy observer plugin/MCP must first be demonstrated to navigate this one owner app and retrieve actual PNG bytes through a trusted, audience-appropriate transport. A Web URL alone is insufficient. Verify current branch/full SHA, host/container/page source and viewport/theme/state, no second app, and exact owner-authenticated session provenance. Engineer personally checks actual interactions before CTO review. CTO personally navigates and captures appropriate Status, Health, Reports, Dashboard and Calliope screenshots; inspect 375/768/1440 and desktop/mobile light/dark where relevant, focus/keyboard, one-send chat, truthful route diagnostics and Preview behavior. No destructive route creation for UAT.

For each UI acceptance: original screenshot bytes and SHA256, source and loaded SHA, viewport/theme/capture time, screenshot provenance, exact immutable code snippets/file/lines, Engineer visual verdict, CTO independently viewed visual verdict, and separate owner UAT signoff. **Display real screenshot(s) and snippets INLINE in the owner's ChatGPT reply.** Links, hashes, synthetic images, or inaccessible Cursor-only PNGs are NOT delivery. If actual bytes are not visible to the CTO, report `BLOCKED_VISUAL_EVIDENCE_TRANSPORT` and `UI_APPROVAL_WITHHELD`.

## Required integration proof before live deployment

1. Bind issuance to authenticated admin owner+CSRF/trusted-origin check, verified observer principal, exact source SHA and one-use redemption; enforce expiry/revocation, audit without secrets.
2. Add end-to-end server/Nginx denies for sensitive GETs, all writes, path/regex aliases, origin mismatch, admin cookie reuse, replay, GET side effects, redirects, unsafe assets, stale source and sensitive JSON. No invisible privilege escalation.
3. If needed, build narrow sanitized page projections; adversarially verify private-field exclusion. Do not open arbitrary URLs or leak host private state.
4. Verify actual provider/browser navigation at the canonical user-provided site and secure original PNG transport to CTO; show screenshot inline, not an attestation about unseen bytes.
5. RED-first unit/integration, `./smart-build.sh test:unit` and native Nginx/browser tests with **zero skipped security cases**; retain legacy authentication and intentional public exceptions.
6. Source integration, default-branch changes, live deployment, new services/credentials, session transport and user UAT are separately gated. No test or GitHub receipt grants them.

**Definition of done:** `CTO_CAN_NAVIGATE_REAL_SITE_READONLY` + `ORIGINAL_PIXELS_IN_OWNER_CHAT` + independently viewed exact code, with no shared admin password or expanded destructive authority. Until then, the mandatory visual capability is NOT DONE.
