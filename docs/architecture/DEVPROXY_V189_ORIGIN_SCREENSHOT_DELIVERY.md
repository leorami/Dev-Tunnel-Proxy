# V189 — Source-matched original screenshot delivery into the owner ChatGPT conversation

**Source-only Dev Proxy Origin consumer contract | 2026-11-22 | NO LIVE DEPLOYMENT.**

## Verified upstream contract and adoption status

The ONE editable Origin protocol is `leorami/project-template:CORE_COLLABORATION_PROTOCOL.md` (protected-main Git blob `fda5e7311b8e0cc692827ad0918fb8fdec1f0250`). Its *already released* owner-facing visual section requires Engineer to personally capture/verify actual source-matched original screenshots, the CTO to independently retrieve/view actual pixels and inspect the committed source before accepting a user-visible change, and actual embedded images in the owner conversation. UI acceptance must BLOCK when pixels are unavailable; green source tests or an image filename are not substitutes.

Origin Issue #140 remains OPEN; PR #129, #134 and #141 remain DRAFT, not fleet-installed. The relevant **draft** PR #134 demonstrates an actual working ChatGPT Code Mode content block: authenticated original safe PNG base64 → remove base64 whitespace → `image("data:image/png;base64,"+base64.replace(/\s+/g,""),"original")`. This is a client display capability, not an authenticated browser capability, authorizes no screenshot capture, no upload and does not retroactively make prior URL-only reports compliant. This consumer addendum changes neither Origin Core nor other projects.

## Canonical final-message transport — already deployed standard, incident correction

**Origin PR #144** was merged to protected `leorami/project-template` main on 2026-11-21. Its indexed `docs/architecture/ORIGIN_PLATFORM_AWARE_INLINE_DELIVERY_20261120.md` explicitly states **FINAL response, not just tool**. This consumer MUST honor that ALREADY adopted standard, not present unmerged Origin PR #134's separate `functions.exec image(...)` demonstration as the replacement. The actual recurring defect in Dev Proxy replies is that image-bearing *tool output* was emitted, but the final user-facing answer contained only prose. This is an assistant delivery failure, not an inherent missing Mac runner or a reason to reimplement the screenshot bridge.

**FINAL_REPLY_SANDBOX_IMAGE_REQUIRED:** verify existing sandbox file original PNG bytes + dimensions/source hash and ensure the `sandbox:/mnt/data/<verified-current-file.png>` pathname really exists in the active conversation runtime. Put literal `![Source-matched original screen](sandbox:/mnt/data/<verified-current-file.png>)` directly in the **FINAL** ChatGPT owner-facing message, not in a code block. A tool-only screenshot preview, GitHub URL, base64 `image()` call, screenshot filename, or user-uploaded path not actually mounted in this chat is NOT a final image. If the owner client DOM cannot be independently observed, report `INLINE_RENDER_UNVERIFIED` while still providing the correctly backed attachment. Avoid declaring client-side rendering proven without observing it.

**Privacy and accuracy:** user-provided private screenshots may be displayed back to their owner *inside this conversation* when appropriately supplied and validated, never copied into PUBLIC GitHub. Do not mislabel a user-provided ChatGPT failure screenshot as a current canonical Calliope app screen. When current authenticated app screenshots remain inaccessible, mark `BLOCKED_VISUAL_EVIDENCE_TRANSPORT` for **that specific UI UAT**, even if a historical or user-supplied image is correctly embedded to demonstrate the transport format.

## Actually executed proof in this CTO owner conversation

CTO fetched the pre-existing `docs/receipts/staging-browser/01-login.png` via the linked GitHub connector using `fetch_file` and `encoding:"base64"` at protected Dev Proxy `main@590bcf2a980b434f533ddacac43a24a777a933e7`, with actual Git blob `44a9489dbb6ae7310c4ee31ad029acdd627259cf`. A PNG header check passed and the original PNG was actually emitted as a **user-visible image-bearing `functions.exec` tool content block**, rather than a URL, metadata, or a printed Markdown string. Classification: `HISTORICAL_PUBLIC_LOGIN_NOT_CURRENT_CALLOPE`; this image proves ONLY the historical public login capture can traverse a safe connector-to-ChatGPT display route. It is not evidence of current signed-in Calliope screen or owner UAT.

## Current V188 actual host and visual limits

Genuine sole Engineer V188 #223 STARTED #7089955143 → RETURNED/STOPPED #7090013023. Engineer reports a new owner-granted one-file Config API source stage, same-container API-only recycle, loaded source blob `41536ba2efea0dd51a15dcb020596a9468cb0e11`, authenticated local-model repair/HEAD prompts `usedAI:true`, Origin/auth/logout/health and proxy/worker/tunnel parity preserved. The owner private signed-in **Health and Reports Calliope** original PNG bytes were NOT in the GitHub return and not available to this CTO tool client; Engineer explicitly reported `BLOCKED_VISIBLE_PIXEL_TRANSPORT`. Thus `SOURCE_STAGED`/reported `PROCESS_LOADED` are separately supported; `CTO_VISUAL_REVIEW_EVIDENCED`, `INLINE_CHAT_RENDERED` **for current V188 screenshots**, `ENGINEER-EXECUTED OWNER UAT VERDICT: PASS`, `OWNER_UAT`, and `HEALED` remain unproven / held.

## What a genuine next evidence pack requires

Only an existing authorized private capture channel may serve original current-source bytes to CTO. A newly invented URL, GitHub public artifact, screenshot *filename*, hash-only manifest or shadow dev runtime does not solve transport. The implementing Engineer personally runs owner-equivalent UI journeys on the one canonical app; captures current **desktop and relevant mobile** (Status + Calliope on Health/Reports, with light/dark and visible actual conversation state as applicable); records exact **40-character loaded/served source SHA**, local capture time, viewport/theme/state, original PNG SHA-256, control/data redaction provenance and source excerpts. The engineer receipt explicitly states what was and wasn't observed and its owner-equivalent UAT verdict.

CTO must then independently receive the *real original PNG bytes*, inspect pixels visually, hash-check provenance, read the Engineer's exact diff and cite genuine test/runtime evidence. Show source-true originals **inline with actual image-bearing output** in the owner ChatGPT conversation and label each current source/environment/view; or return `BLOCKED_VISUAL_EVIDENCE_TRANSPORT` / `BLOCKED_CTO_VISUAL_REVIEW` with UI acceptance HOLD. The current public old login screenshot cannot substitute for the owner authenticated experience.

### Current vs desired owner journey (no mockup is current)

**NOW (reported running V188):** owner opens protected Health or Reports, opens shared Calliope drawer, sends a natural repair / HTTP-HEAD question, receives a reported real local Qwen3 response with safety flags. Backend verified by Mac Engineer, original owner UI screenshot unavailable to CTO.

**TARGET (not yet evidenced):** the same real served Health/Reports page is exercised on desktop/mobile by Engineer, its actual pixels and source-matched behavior are inspected by CTO and shown inline to owner, real one-send/one-answer and fallback states are legible, and owner may optionally accept the UI AFTER Engineer + CTO verdicts. A private observer route, provider, permission or brand-new screenshot transport must be separately demonstrated and authorized; do not invent a new service to force compliance.

## Clear privacy and authorization lines

No owner private pixels, child/person data, cookies, tokens, credential material, admin session or unsanitized browser trace in PUBLIC GitHub. These source-only instructions grant no new observer privileges. Do not copy owner private screenshots or URLs into a search engine. Do not expose Dev Proxy read-only observer access without explicit owner consent and tested Origin/session/CSRF/revocation/TTL/asset allowlists from `DEVPROXY_MANDATORY_CTO_VISUAL_ACCESS_V1.md`. No shadow app or second runtime. No new Git merge, host source, API reload, Nginx/worker/proxy/tunnel action or owner UAT approval from these source policy edits.

**DONE for this V189 CTO source contract:** enforceable Dev Proxy `AGENTS.md` rule plus an executable CI test; one genuine historic approved-public image inline. **NOT DONE:** a trusted channel for *current owner-authenticated* screenshot bytes, CTO current-screen inspection, owner visual acceptance. Don't claim otherwise.
