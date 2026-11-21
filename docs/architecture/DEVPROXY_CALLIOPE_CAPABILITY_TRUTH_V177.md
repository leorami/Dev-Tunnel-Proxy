# Dev Proxy — Calliope Current Capability Truth (V177, 2026-11-20)

**CTO-first source canon; NOT a claim that source text has been published to the running Mac.** The default GitHub branch is protected `main@de163771106b5c3f8ab1fbdac39d8e615147b6d1`. This project's historical README and Calliope documentation promise autonomous self-healing that its currently approved secure management mode deliberately does not provide. The user previously saw an observational 503 followed by `please repair` / `try anyway` with no repair; neither that historical example nor the subsequent source fix proves today's live service heals routes autonomously.

## Evidence boundaries to preserve

- **V153:** Issue #150 genuinely STARTED/RETURNED and an isolated grounded-followup source change was accepted. Do not say V153 is still pending. A source-only return is not equivalent to the latest live HTML/JS actually being loaded.
- **V154:** Issue #153 read-only cross-project route repair assessment returned; CTO rejected the proposed live route change as unsafe at that boundary. Do not claim the original failing route was fixed in production.
- **V165:** four V163 static UI files were published and hash-verified on the owner host, but authenticated owner UI UAT remains incomplete. Separate source/documentation state from loaded behavior.
- **V172:** Engineer performed the four `^~` Nginx auth protections live, with reported host tests. This does not grant any Calliope repair permission.
- **V175:** Issue #185 genuinely RETURNED source-only observer security test repairs on draft PR #187 at `beacbdf973cfefd1e0f249d208a5d4f64640909c`; observer remains unmerged/undeployed, its JSON shells are not the actual application.
- **V176:** Issue #189 genuinely STARTED then RETURNED `STOPPED_CHATGPT_BROWSER_TOOL_UNAVAILABLE`: owner's Safari and Engineer's Mac browser can load the real login page; the current ChatGPT quick-chat tool cannot access a connected graphical browser or original independent pixels. Do not call the live site down. Source and user-owned screenshot checks are not logged-in product UAT.
- **Current main:** docs overclaim general self-healing and `docs/CURRENT_OPERATIONAL_STATE.md` is absent; previous isolated [PR #151](https://github.com/leorami/Dev-Tunnel-Proxy/pull/151) provides substantial **historical** documentation correction but was prepared at V152 and must be reconciled, NOT blindly merged.

## What the product can safely claim

Local observational diagnostics, source-grounded explanation, explicit restricted actions and operator-controlled deployment/recovery where there is actual test and authorization proof. Secure-mode Ask/Diagnose and `heal:false` do NOT magically perform repairs. A failed `HEAD` only establishes one observed response, not first-cause certainty. The Notifications Bridge remains contained; host Docker/worker actions require explicit policy and owner authority. Avoid claims about which user files or live routes are available without authenticated runtime evidence.

For public product descriptions, clearly distinguish *goal* (operator-guided future healing) from *currently verified behavior* (diagnostics/observational status). Retain historical examples only under a visible, early **historical/non-operative** banner. Do not erase legitimate technology history; label it. Do not publish passwords, route names, private session/state, child details, owner paths or screenshot browser tabs.

## Source-first implementation boundary

One single primary Cursor Engineer-I may reconcile only accurate prose from PR #151 onto exact current main, with CTO RED tests at `tests/docs/v177-current-capability-truth.test.cjs`. Fix source-of-truth docs and index; no runtime change, no API/NGINX/Compose/Calliope JS changes, no Git merge into protected main, no new browser session or screenshot transport service. Require initial expected RED test output then GREEN and canonical `./smart-build.sh test:unit`; a PR may remain draft until CTO source review. Source documents should be accurate in 2026-11-20 present-tense and be revised if latest actual repository receipts differ.

**DoD:** No unqualified automatic-heal promise in main README; early secure-mode caveat in assistant docs; discoverable current-state page with exact source/live/UAT distinctions; tests GREEN; single authentic primary consolidated receipt. Do not call documentation publication a product or visual acceptance milestone.
