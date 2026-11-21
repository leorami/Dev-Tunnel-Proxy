# V176 — One real Dev Proxy login-page browser → original PNG → ChatGPT proof

**STATUS: CTO HANDOFF / READ-ONLY / NOT STARTED.** This is deliberately *one* consequential transport experiment, NOT an observer-auth implementation, fake preview site, release, or a call for a new paid service.

## Owner intent and source truth

The owner's real application is available in Safari at `https://ramileo.ngrok.app/admin/login?redirect=/status`. On 2026-11-20 about 18:52 America/Chicago the owner supplied original Safari pixels proving that this login page rendered. Its visible copy matches immutable `status/login.html` Git blob `8fc9a6518f6ae46c05ecf00200f415d8a0f36e79` at `main@952aa2625990f8da60784a8c6a63759b47b43569`. **A login page is not proof of authenticated product UAT.** The owner screenshot stays PRIVATE; do not post pixels/browser tabs in this public repo.

The prior CTO environment failure was **NOT a Dev Proxy outage**. CTO's generic container resolver (168.63.129.16) could not resolve *even* `github.com` or `example.com`; `ramileo.ngrok.app` also fails there. GitHub connector access uses a separate tool backend. The web fetch does not provide an authenticated graphical browser session. Do NOT "fix" the working tunnel, Docker, nginx or owner DNS to repair this unrelated tool-network sandbox.

Authoritative current repo default: protected `main`, its SHA above. V175 single primary #185 genuine STARTED #7054405043 -> RETURNED #7054491961. V175 accepted P0 source corrections but [DRAFT PR #187](https://github.com/leorami/Dev-Tunnel-Proxy/pull/187) `beacbdf973cfefd1e0f249d208a5d4f64640909c` is **not merged or deployed**. V172's four live `^~` protections must stay intact. New V176 CTO branch is based EXACTLY on that V175 tip; verify full 40-char SHA at dispatch.

Most crucial: V175's four new `/observer/*` pages are placeholder JSON projections, **not** the canonical full application, and runtime passes placeholder values `routeCountPublic:0` and `publicHealthOk:true`. Do not mistake observing those shells for seeing the actual Status/Health/Reports/Dashboard/Calliope application. Do not invent more fake shells.

## Goal: prove the ONE missing transport, BEFORE further privileged code

Prove that this **same owner-facing ChatGPT collaboration** can use an *actually callable, authenticated graphical browser* (Work Cloud Browser, ChatGPT desktop browser, or preexisting authorized Dev Proxy observation connector), open the **existing canonical login URL** without signing in, receive the **original PNG bytes** in this ChatGPT conversation, and display that actual image inline beside a Git-blob/source-accurate code snippet. No owner password or observer grant needed for an unauthenticated login-page proof.

If the browser cannot actually be invoked or its PNG bytes cannot be transported to the current owner chat, state `BLOCKED_CTO_BROWSER_TRANSPORT` with the **first cause** and stop. Do not try to substitute Cursor's own screenshot, a mockup, an inaccessible GitHub ZIP, a future plugin promise, the owner's already-uploaded screenshot, an image generator, or an unreviewed public screenshot upload.

## One single-primary read-only mini-sprint

1. Check authentic GitHub latest primary lifecycle, complete remote SHA, and pending branches/PRs **before** starting. If another primary is active, STOP without duplicate dispatch. Post a genuine STARTED here only if actually executing the task.
2. Check real owner-host reachability **read-only** from the established Mac or Cursor browser (HEAD/GET of existing canonical login only). Record status 302 vs login 200, canonical origin, redirection; do not log cookies, login passwords, route inventory, browser history or owner-private tabs. The owner's Safari screenshot already proves a separate live vantage point.
3. Inventory what **is actually callable from the owner ChatGPT session**, not just named in docs: Work Cloud Browser, desktop browser, approved plugin/MCP. Do not assume Cursor browser = ChatGPT browser. This ChatGPT message's tool inventory does NOT currently include a graphical authenticated browser.
4. If and only if a trusted browser **is available** through the current owner chat and user authorization: visit the existing public login page without authenticating, capture native unaltered PNG; prove viewport and SHA256, loaded URL and matching exact source blob/lines; deliver image bytes into THIS ChatGPT conversation. Display it as literal inline Markdown image in the FINAL owner reply. A private screen capture on Cursor alone is only Engineer evidence, not CTO proof.
5. Distinguish `SITE_UNREACHABLE_FROM_AGENT_NETWORK`, `CHATGPT_BROWSER_NOT_CONNECTED`, `CAPTURE_BYTES_NOT_RETRIEVABLE`, `OWNER_CHAT_INLINE_RENDER_UNPROVEN` as possible first causes. If one holds, STOP and recommend **one** owner-only trusted interface action (e.g. using Work mode with a secure browser login), never ask for the password/token in chat.
6. Only after real unauthenticated pixel delivery works should we plan a **separately authorized** minimal read-only authenticated viewer on the **same actual app**, with live source truth and no write APIs. Do not deploy the unproven observer service or use its substitute JSON pages.
7. Return one consolidated actual STARTED→RETURNED/STOPPED GitHub receipt with exact branch/full SHA, browser provider actually callable, HTTP/browser outcomes, pixel transport evidence (private, not publicly posted), proof limits and remaining narrow owner decision. Treat reviewer visual acceptance and owner UAT as separate.

## Hard stops and nonoverlap

READ ONLY. No commits/merges on owner checkout, no `main` change, no route generation, app login attempt with owner password, no cookie/token transport, no new service/plugin purchase, no Nginx reload or Compose/ngrok reset, no private screenshot upload to public GitHub, no use of untrusted browser automation, no background claim. Privacy remains consent-first. Use available Linux browser runners for web captures; native macOS runner only needed for a distinct Tauri proof lane, not for Dev Proxy.

**DoD**: EITHER (A) verified original screenshot reaches and is shown INLINE to CTO in this ChatGPT interaction with source blob proof, OR (B) a source-/provider-grounded terminal first-cause `BLOCKED_CTO_BROWSER_TRANSPORT` and smallest trusted next step. Never claim CTO live visual access merely because a plan, browser label, or user-uploaded image exists. Do not prolong this same task with an unnecessary extra source sprint.
