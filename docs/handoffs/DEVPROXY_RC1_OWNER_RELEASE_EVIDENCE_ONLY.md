# DEVPROXY-RC1-OWNER-RELEASE — one primary Engineer-I, no live changes

## The one consequential milestone

Close the remaining gap between a verified **disposable security release** and an **informed owner GO/NO-GO**, without starting another unrelated feature stream. Collect redacted release evidence and a safe, owner-controlled rollback/maintenance plan. **Never interpret source green as permission to deploy.**

- Repository: `leorami/Dev-Tunnel-Proxy`.
- Parent production preflight [issue #17](https://github.com/leorami/Dev-Tunnel-Proxy/issues/17) RETURNED on `cto/devproxy-rc1-production-packaging-20261101@54cb4c78ba40ac2e71e7123af9a91bacf36de815`, draft PR #18; CTO reviewed its actual receipt/diff and accepted SOURCE + disposable image conditionally, preserving Engineer recommendation **NO-GO**.
- Work only from the **exact 40-character SHA** in the user's Cursor instruction on `origin/cto/devproxy-rc1-rollback-readiness-20261101`. Do not chase a moving latest, create another primary, or alter old draft PRs.
- [Decision canon](../release/DEVPROXY_RC1_OWNER_GO_NO_GO_V1.md) provides the source-grounded evidence, unmet requirements and explicit stop boundaries. Existing installed proxy and Mac host bridge remain on old code.

## Direct CTO work already prepared — do not duplicate

1. Created **RED-first** `tests/security/release-decision-readonly.test.mjs` with fail-closed gate cases, separate Mac approval, positive-ready state that never grants deploy authority, no secret echo and CLI invalid-input checks.
2. Implemented dependency-free `utils/release-decision.cjs`, a strictly allowlisted evidence-status classifier; no network, Docker, filesystem, credential, shell or remote tool access. Unknown/malformed states fail NO-GO.
3. Implemented `scripts/release-decision-readonly.mjs`: consumes at most 8192 characters of optional JSON from STDIN and emits only fixed gate names/PASS/FAIL/BLOCKED/NOT_RUN states, never input values or secret fields; exit 2 NO-GO, exit 0 READY_FOR_OWNER_DECISION. Its output **is not** a deployment approval.
4. Hooked its test-only suite to canonical `./smart-build.sh test:unit` without removing existing six verified RC1 gates. No live test:all; no user secrets.
5. Wrote the release decision canon with exact tested disposable image and known installed image references, noting **those IDs do not constitute durable backup copies**. CTO source review is not an executed Node project test or owner UAT.

## One Engineer-I mini-sprint

**Gate A — actual continuity:** Recheck issue #17, PR #18 and the new parent tracking issue, GitHub master, exact pinned branch tip and real executing Cursor status. Preserve owner's working tree and running nginx/ngrok, Apps, Docker and `127.0.0.1:17888` Mac bridge. If the one primary is busy, do not reassign it. Start in an isolated worktree. No protected merges, force/reset/clean or other repositories.

**Gate B — genuine RED/GREEN:** Inspect CTO source. Prove the historical test-only RED `c594b20048e935635d128f0e36a6111a1393b5c8` in Node 22, record actual result (do not assert run by CTO). Run `node --test tests/security/release-decision-readonly.test.mjs` and safe `./smart-build.sh test:unit` with fake process-only credentials, capturing full exits/receipt SHA. Add RED first for any real failing behavior. Confirm CLI with intentionally malformed input leaks no tokens/URLs and claims neither authorization nor installation.

**Gate C — safe owner baseline planning, no secret inspection:** Read existing Engineer preflight receipt and, only where genuine read-only owner access exists, confirm installed image IDs and running process health using **metadata-only** commands that do not print `docker inspect` environment, secret labels, private route names, certificate paths, session values, or actual authentication tokens. If access is unavailable, report BLOCKED. For route baseline, prefer counts/hashes and test-owned metadata; never request a potentially exposed private `/.artifacts/` body from old public ingress. Do not run live Calliope API writes/repair. No public tunnel queries unless separately approved, and even then status-only with no body or URL in public issue.

**Gate D — durable rollback and owner UAT decisions:** Present the existing installed image IDs only as identifiers and a *proposed private offline image export/restore/hash* plan with exact permissions and disk check. **Do NOT execute docker image save, prune or import on owner installation without separate explicit authorization**, because image archives can contain embedded secrets and affect disk space. Document a clean rollback checklist for proxy image, API image, original mode/config state and the separate Mac LaunchAgent, and list which elements remain unproven. Draft owner staging UAT acceptance: sign-in/out, both tunnel/local modes, app routes/health/dashboard, safe Calliope read, anonymous denial, and per-tab Mac pairing with owner's private token. Do not impersonate the owner's actual browser or send real Messages.

**Gate E — one consolidated return:** In `docs/receipts/DEVPROXY_RC1_OWNER_RELEASE_EVIDENCE_ENGINEER_COMPLETION.md`, report exact tested source SHA, resulting receipt SHA, commands/exits, unmodified owner checkout, exact NO-GO/READY gate states, any *redacted* local image/route metadata summary, a precise private backup/rollback proposal, actual missing permissions and UAT, and next recommended single owner decision. Post genuine STARTED→IMPLEMENTING→VERIFYING→RETURNED to the tracking issue with readback and stop for CTO committed-diff review. **Any blocked prerequisites keep deployment NO-GO**, without spinning up more feature work.

## Nonnegotiable

No running `docker compose up/down/restart` or production mode switches, no nginx/ngrok reload, no live `docker image save` without separate authority, no privileged root Docker changes, no public tunnel probe of old private endpoints, no actual user credentials/session/bridge token, no Mac Messages/LaunchAgent modifications, no public MCP, no snapshot code-review changes, no protected master merge or deployment. Do not claim installed security improvement from an open draft PR. Preserve pending Origin standards PR delivery for its own separate gate.

**Definition of done:** a trustworthy, reproducible, **redacted** release-readiness decision and owner checklist, not another "feature ready" slogan. Once reviewed, the single next milestone is owner-authorized staged rollout with a verified rollback, not another indefinite hardening loop.
