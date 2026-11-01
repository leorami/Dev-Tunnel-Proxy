# Unified GPT ↔ Local App MCP Gateway V1

**Status:** 2026-11-01 isolated CTO consolidation in `leorami/Dev-Tunnel-Proxy`. This repository is the **canonical home for the reusable gateway package**. It is a **reviewable public-source proposal**; not merged, not installed, not connected to the owner Mac, and not an authorized ChatGPT/production integration.

## Owner product outcome

A GPT can discover applications that an operator has explicitly registered, determine which are running, and invoke narrowly defined **application operations** without making the owner relay instructions between chat and Cursor. Eventually other projects can reuse the exact same mechanism by adding a small app-owned adapter, instead of building their own shell bridges or guessing local ports.

The first true user experience is deliberately small: a securely connected GPT calls `app.list`, `app.status` and one permitted **read-only** `app.command` on a **real** running development app; it receives a bounded result, with the correct application/environment identity. The GPT must never mistake an ngrok DEV tunnel for production.

## Actual GitHub inventory (do not invent merged code)

| Source | Verified state | What it contributes | Consolidation treatment |
| --- | --- | --- | --- |
| `leorami/wizardmaker-ai` PR #375 | Open DRAFT, `7d1f78f1b6ba35d0aa7a0f002c0879303692d8f6` | Node 22 dependency-free loopback gateway, registered app discovery/status/typed commands, local bearer, strict Host/Origin, one-use local approval, initial 12 behavior tests | **Do not use by itself**: old handshake/modern version mismatch |
| `leorami/wizardmaker-ai` PR #376 | Open DRAFT, `750156fc55f70ae6f205e90eae2bec287cb356b4` (descends from #375) | Fixed stateless MCP `2026-07-28`: `server/discover`, per-request metadata and required mirrored headers, result metadata, 16/16 isolated Node tests | **Source** of shared `gateway.mjs` and inherited Node HTTP tests |
| `leorami/tiger-slam` PR #581 | Open DRAFT, `67f6506cd5de74da1fd291f1eb5579341f88e8a8` | Strict actor/app/environment/role/scope/audience/intent/version/idempotency grant policy and bounded read-only dispatcher; unit tests committed but not run there | **Adapted** as zero-dependency shared `app-policy.mjs` and separate policy tests; not a live service |
| `leorami/Dev-Tunnel-Proxy` master | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` at CTO branch start | Public MIT shared nginx/ngrok app-router, registered app snippets, `/devproxy/api` management service and `devproxy` Docker network | **Canonical new package home**; retain all existing routing/management and ports |

**Correction:** Wizardmaker's contributions were PRs **in its own repository**, not PRs merged into Dev Tunnel Proxy. The new canonical consolidation is an isolated branch/PR in the actual public proxy repository. No original project PR was merged or closed.

## One architecture, separated responsibilities

```
GPT / ChatGPT app / Cursor / other MCP client
   |
   | explicit user connection, OAuth/scope and Secure MCP Tunnel as appropriate
   | (not currently installed by this branch)
   v
bounded local MCP gateway: packages/dev-proxy-mcp/gateway.mjs
   |  app.list | app.status | app.command
   |  only registered app IDs and typed schemas; no model-selected host/URL
   v
registered per-app adapter (trusted operator code)
   |  app-owned authenticated user principal + scope/role/environment
   |  optional pure app-policy.mjs evaluation of exact request/grant
   v
app's existing domain service, with its own consent and audit
```

**Dev Tunnel Proxy nginx** is the established router and optional ngrok DEV entry. Its authenticated **`/admin`** and **`/devproxy/api`** are for infrastructure configuration, **not** a cross-app identity/scope grant. The new gateway binds loopback only and **is not** automatically installed as a public `/mcp` nginx route. The package can be used independently of nginx; any later ingress must be explicit and security-reviewed.

## Unified wire and policy

1. Modern generic loopback gateway speaks MCP `2026-07-28` using POST `/mcp`, stateless `server/discover`, `tools/list` and `tools/call`; checks `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and per-request `_meta`. `initialize` and legacy notification handshakes are not advertised.
2. All GPT-visible generic tools are **`app.list`**, **`app.status`**, **`app.command`**. `app.command` takes `app`, `command`, and strict typed `args`, and optional local approval. It cannot supply arbitrary code, host, path, shell, SQL, Git or deployment operation.
3. The shared policy module provides **a separate, internal app-command grant evaluation** for sensitive app-backed operations: `name`, strict `arguments`, `requestId`, and for mutations `expectedVersion` + `idempotencyKey`. Per-app registrations declare exact scope, actor roles, environment, argument schema and risk. Environment and verified OAuth token audience must be established by the **app** outside MCP inputs.
4. The generic gateway **does not yet automatically call the app-policy module**; no identity provider or grant issuer is shipped. A registered app domain adapter must connect it to real app authorization. Until then only model-safe non-personal local read projections are eligible for actual consumer use.
5. The Wizardmaker-derived gateway's local test approval is **single-use**, bound to app/command/args and expires. This is a nonproduction proof, **not** an entitlement to mutate other applications. A real remote write needs authenticated per-user app privilege, server-validated exact consent, durable audit, idempotent transaction, optimistic concurrency and rollback/reconciliation behavior. Uncertain timeout must not auto-retry.
6. A proxy's **local bearer token is machine authentication**, not the human who owns Tiger Slam/Wizardmaker or permission to access that user's private data. Never log or publish tokens.
7. The existing Tiger Slam production Research MCP at `/mcp` uses a different legacy protocol and OAuth user grants. Preserve it unchanged. Plan an interoperability/transition test before moving any production connected app to the generic gateway; do not break working research connections for new features.

## Independent shared app-policy input hardening (CTO follow-up)

- [Request-snapshot safety proof and RED/GREEN evidence](MCP_APP_POLICY_UNTRUSTED_SNAPSHOT_GATE.md): shared `app-policy.mjs` rejects untrusted getter/proxy-like payloads, inherited/symbol fields, cyclic JSON, and caller mutation after policy authorization. Original isolated harness **8 pass / 5 fail**; corrected harness **13 pass / 0 fail** (six inherited + seven adversarial cases). The shared policy is still NOT automatically wired into every gateway command, and the real native Dev Proxy test gate/owner UAT remain pending. No cloud GPT or production grant is created.

## Security and agency invariants

- Deny-by-default per-app registration; no shell, file browser, Docker socket, arbitrary HTTP, wildcard CORS, raw session cookies or broad OS permissions.
- Loopback-only by default; explicit Host/Origin checks defend against DNS rebinding; request/response/time limits and error redaction.
- TLS/tunnel transport **does not grant application permissions**. Remote connection requires reviewed client auth; Secure MCP Tunnel is outbound-only and separately configured by authorized workspace/Platform users, never invented by this package.
- Separate DEV, staging and production by server runtime, app resource/audience and authorization store. A successful DEV test or local approval cannot confer production authority.
- GPT tool responses, app captions, retrieved text and agent messages are **untrusted**. Never interpret their content as grants or command instructions.
- For any mutation, app domain logic—not the proxy—owns row-level authorization, expected-version conflict handling, durable idempotency and identifiable actor audit. Never silently overwrite another user's or another device's saved choices.
- Privileged deployments, purchases, licenses, permanent deletes, public media publication and outbound communication remain separately owner-authorized.
- Internal development grants are revocable; local approval tokens are consumed exactly once. A revoked app or scope must fail closed.
- Publish **generic code and synthetic tests only**. No children's records, production screenshots, proprietary Tiger media, supplier URLs, secrets, real account identities or private DB exports enter the shared package.

## Adoption contract for other projects

A project that wants GPT connectivity **adopts** this package and writes an app-specific adapter with the existing domain services. It does **not** fork a second generic MCP gateway. It declares stable ID, description, allowed read-only fields, per-operation schema/risk, source/environment and trusted app identity context; then tests the actual app response under the intended role. It may expose its own OAuth MCP directly if that is already secure. Shared package versioning and compatibility tests should be established before distribution beyond source checkout.

Wizardmaker's first intended adapter is pinned loopback application health; **no GPT-OSS tutoring model calls** or learner data. Tiger Slam's first desired adapter could read reviewer-specific Gallery decision flags only after real OAuth user scope verification. Its photo reason writes are a **separate** owner-permitted, version-guarded domain operation—not permitted by merely connecting the GPT.

## Acceptance, evidence and release boundaries

**CTO-authored in this consolidation:**
- ported Wizardmaker PR #376's `gateway.mjs` + 16-test Node suite into the proxy;
- exported shared argument validator and added Tiger Slam-derived `app-policy.mjs` + independent policy tests;
- added a generic **opt-in** loopback-only read example and this indexed canon;
- added the new test suite to native `./smart-build.sh test:unit`.

**Evidence distinction:** Wizardmaker #376 reported **16/16 GREEN in an isolated Node 22.16 test** at its own source. That is strong source evidence but **not a green test receipt for this extracted Dev Tunnel Proxy branch**. The shared policy and native combined test are not yet executed by CTO. No DevProxy runtime modification, real ChatGPT ↔ local call, secure tunnel, owner UAT, production change, plugin publication or package release has occurred.

**Minimum next verified milestone:** one primary Engineer (only after current Tiger Slam/Wizardmaker active assignments reach safe boundaries) runs the native proxy suite and actual read-only local app exercise, checks port & origin identity, source exact SHA and grants, authenticates an independent MCP client, then proves ChatGPT Secure MCP Tunnel access only if existing credentials/permissions are already available. Owner remains free to work on urgent photo-tagging and real model tasks meanwhile.

**References:** `packages/dev-proxy-mcp/README.md`; `docs/plans/unified-gpt-local-app-mcp-release-plan.md`. Official MCP 2026-07-28 specification: https://blog.modelcontextprotocol.io/posts/2026-07-28/ . OpenAI private tunnel guidance: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels .
