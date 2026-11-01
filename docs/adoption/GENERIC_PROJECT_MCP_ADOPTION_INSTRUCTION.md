# Copy-and-paste project instruction — Optional GPT ↔ Local App MCP Adoption

**Who this is for:** The owner can paste the complete instruction below into **any ChatGPT/Cursor project** that already uses Dev Tunnel Proxy, or any project considering the optional package. It is self-contained; recipient must substitute its real repo/app identity from source, not ask the owner to manually rewrite it.

**Status:** The reusable package is in **draft Dev-Tunnel-Proxy PR #2**, not installed or validated for arbitrary projects. This instruction is **an evaluation request, not authorization** to create a tunnel, install dependencies, expose local ports, merge protected branches, use credentials, write owner records, or deploy. It does not interrupt the project's active implementation lane.

---

## READY-TO-SEND GENERIC INSTRUCTION (copy this section)

> **Evaluate optional adoption of our shared GPT-to-local-application MCP gateway.**
>
> Shared source of truth: public GitHub repository `leorami/Dev-Tunnel-Proxy`, draft PR **#2** (`cto/unified-gpt-local-app-mcp-bridge-v1-20261101`). Before any edits, independently establish that PR's actual current SHA and review `packages/dev-proxy-mcp/README.md`, `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md`, `docs/qa/UNIFIED_GPT_LOCAL_APP_MCP_RELEASE_QA.md`, and `docs/plans/unified-gpt-local-app-mcp-release-plan.md`. Use those files, not a remembered PR description, as the package contract. The shared source combines Wizardmaker's corrected MCP runtime (PRs #375/#376) with Tiger Slam's app-authorization policy (PR #581).
>
> **Do not interrupt any active Engineer-I assignment.** Check your project's governing CORE protocol, actual repository/branch/SHA, local running app, pending plans, owner permissions and current agent receipts first. Preserve owner dirty work, source mounts, current local ports, authentication, cookies and existing production connectors. You are evaluating an **optional opt-in integration**, not replacing your project's app API, its existing MCP server, production authentication or any active task.
>
> Determine whether your project already has a secure MCP endpoint and whether the shared gateway adds real value. If yes, propose the **smallest useful app-specific adapter**: one stable app ID, pinned locally configured app endpoint, one harmless **read-only** app-domain operation and explicit JSON argument schema, result/redaction policy, exact environment, user role/scope and authentication boundary. Never create generic terminal, Docker, Git, arbitrary URLs, file access, admin commands, local privilege escalation, or a new public proxy route.
>
> GPT access must honor **app-owned authorization**: a proxy bearer token or ngrok reachability is not permission to read private user data or write anything. Distinguish local test, authenticated remote ChatGPT access and production. Do not copy tokens into chat, logs or commits. No production writes, releases, financial actions, external contacts or irreversible changes without their separate owner approval. The package's pure `app-policy.mjs` is **not yet wired into the generic gateway** and cannot by itself confer identity or consent; keep sensitive operations closed until a verified actor/scope/resource audience is integrated.
>
> If adoption is genuinely valuable and doesn't conflict with current work, create only a **proposal on an isolated branch** under your project's authorization rules, with failing tests first, source-exact plan and no deployment. Use the upstream package rather than forking a second generic gateway. Validate the actual gateway package with Node 22 and its documented native test gates; check your app's real status and allowed read via the local proxy, deny wrong-app/role/scope/origin/host, preserve existing functions, and record one consolidated PASS/BLOCKED receipt. A genuine cloud GPT/secure tunnel call requires separate, real connection evidence, not a localhost 200.
>
> Report in plain English: **Adopt now / Defer / Not needed**, the actual user benefit, exact source/branch/commit and what (if anything) you changed, tests performed and remaining blockers. If an implementation agent is already busy, do not start a competing assignment; preserve the proposal for the next safe boundary. Only the owner can authorize protected merge, new credentials/tunnel or deployment. Ask no routine questions the repository and this policy already answer.

---

## What adopters should deliver (when legitimately authorized)

A qualified project supplies a **thin app adapter**, never a duplicate copy of the reusable network/security core. It demonstrates actual read-only app data through a real running local instance using a correct user permission boundary, and produces an exact SHA/receipt. The operator may choose *not* to adopt if its existing native app MCP is sufficient.

Expected read-only examples: `project.health.check`, `project.build.status`, `project.review.summary` (only safe approved fields). **Not** `shell.exec`, `git.push`, `docker.restart`, `deploy.production`, `filesystem.read`, unrestricted HTTP or any tool pretending a browser session.

Write tools are a **separate later project**. Grant/revoke, app-user identity, transactionally durable idempotency/optimistic conflict checks, user-visible action approvals, audit and human UAT must be proven before they exist. A single-use in-memory local test approval is not enough for real remotely executed writes.

The gateway becomes a standard by being *easy to opt into and safe to decline*, not by installing a powerful daemon into every project.
