# DEVPROXY-RC1 — one primary Engineer-I, prove private rollback export safely

## Goal / immutable authority

Deliver a **native-tested, operator-ready offline export of the three existing running image IDs**, with no export of owner images yet. This is a single security-release mini-sprint; it must reduce a real owner deployment blocker, not restart product feature work. Owner has NOT granted authorization to export or restart anything. No second primary Cursor Engineer.

- Repo: `leorami/Dev-Tunnel-Proxy`.
- Parent returned: issue #19, `cto/devproxy-rc1-rollback-readiness-20261101@34821698239ec93ed4d4d937e6a2bb5ff69d20b4` (tested `20fe6d10f61b61a84027c3bd5857e48af7578f32`). Exact Engineer receipt: `docs/receipts/DEVPROXY_RC1_OWNER_RELEASE_EVIDENCE_ENGINEER_COMPLETION.md`.
- **Execute ONLY** the exact 40-char SHA in owner instruction on `origin/cto/devproxy-rc1-private-rollback-export-20261101`; do not chase a branch tip or alter previous PRs.
- [Owner-gated image archive contract](../release/DEVPROXY_RC1_PRIVATE_IMAGE_ROLLBACK_OWNER_GATE.md). Source proposal and code are not yet accepted.
- Existing owner checkout reportedly `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, only untracked `.cursor/`; inspect afresh, preserve all owner state. Draft security PRs #7/#11/#12/#13/#15/#18/#20 remain unmerged and not installed.
- **Absolute gate:** No `docker image save` against real Docker, even though code supports it, unless the owner has separately explicitly said YES to exporting these exact three image IDs into the fixed private location. This user request for an Engineer instruction **does not itself authorize** image export. Also no live route crawl or private credential access.

## CTO source already prepared

1. `tests/security/private-rollback-export.test.mjs` committed RED first at `c77068f22ca14c3dca4f4523f820480ab94d9c6d` before script existed. Tests create a disposable temporary `HOME`, private local output, and fake `docker` executable: NO real Docker, images, Messages or app traffic. Contract covers no-args dry-run, missing owner flag, unknown options, changed image ID, symlink/permissive paths, and mock image archive checksum/privacy.
2. `scripts/private-rollback-export.mjs` implements fixed-ID checks against three returned live images, no-op default, explicit `--execute --owner-approved` accidental-execution gate, owner-private `0700` directory, `0600` archive and private SHA-256 note, argv-only image export, post-export image recheck and fail-closed cleanup. It prints only fixed status strings; it never loads, prunes, restarts or deploys.
3. `./smart-build.sh test:unit` adds this **mock-only** suite, preserving seven prior RC1 security suites.
4. [Owner decision/rollback limitations](../release/DEVPROXY_RC1_PRIVATE_IMAGE_ROLLBACK_OWNER_GATE.md) distinguishes mere archive creation from independently tested restore, live config backups, route parity, public ingress and owner staging UAT.
5. CTO has code-read source through GitHub and checked syntax; no native Node/Docker test run or owner Mac/secret/route access occurred.

## Engineer-I mini-sprint

**A — continuity and isolation.** Confirm latest issue #19 RETURNED and this tracking issue's status, pinned source SHA, actual Cursor primary state, dirty owner checkout and running ports. If any newer primary is active, don't interrupt or start duplicate work. Use a disposable worktree and fixtures; never stash/reset/clean owner files.

**B — RED/GREEN.** Run historical test-only commit `c77068f22ca14c3dca4f4523f820480ab94d9c6d` with Node22; record actual failing result, do not invent one. Run `node --test tests/security/private-rollback-export.test.mjs` on pinned tree with fake Docker and real Node22. Run canonical `./smart-build.sh test:unit` in an isolated fixture environment, using process-only fake ADMIN_PASSWORD, confirm all eight nonmutating security gates. If a legitimate failure appears, add a new RED test first, repair in scope and re-run. Do not weaken tests.

**C — prove noninterference and privacy.** With a *test-owned fake Docker executable* on PATH and only temporary HOME, verify no Docker is called without both flags, mismatched image IDs abort before archive, symlinked/outside/permissive directories fail closed, private directory permissions and checksum are correct and no environment, path, owner data, image digest or secret is printed to stdout/stderr. Confirm that the script itself never writes into the repo/.artifacts, sends HTTPS, calls real launchctl, saves real images, or prunes/restarts containers. Test error-handling and incomplete temporary directory cleanup. Stress-case fake Docker exits nonzero or writes zero bytes, post-export ID changes, and wrong runtime; require a RED test for any defect found. **Do not invoke script with `--execute --owner-approved` against real Docker** in this assignment.

**D — limited release design.** Independently verify the immutable three live image IDs against metadata-only issue #19 receipt (no environment, private mount, token or config reads). The installed images and `latest` tag are not durable rollbacks. Outline a **future** owner-private restore test using a separately isolated test daemon; do not load into the real owner daemon. Draft baseline checklist to preserve actual generated `apps.generated.conf`, 27 app config names, override files and proxy config only after separately approved private backup; known risk: production switch downs containers before backup, entrypoint fallback cannot rename read-only app route mount, and route precedence depends on mtime. Don't run those scripts.

**E — one consolidated return.** Commit only in-scope fixes + `docs/receipts/DEVPROXY_RC1_PRIVATE_IMAGE_EXPORT_ENGINEER_COMPLETION.md` with exact tested product SHA, receipt SHA, actual RED/GREEN and canonical exits, fixture archive mode and checksum proof, mock Docker identity test, output privacy, owner work preserved, explicit `LIVE_EXPORT_NOT_AUTHORIZED`, and remaining NO-GO decision. Record genuine STARTED→IMPLEMENTING→VERIFYING→RETURNED in tracking issue with GitHub readback. STOP for independent CTO diff review and owner decision on actual export. No reassignments or speculative background work.

## Stop

No real image archive, private Docker disk alterations, live proxy routes/health endpoint bodies, `docker compose up/down/restart`, old destructive production/development switch scripts, real LaunchAgents or Messages, ngrok changes, public tunnel calls, image load/prune, API key/session/private file reads, credential rotation, cross-project Origin updates, protected master merges, or production deployment without separately explicit owner permission.

**Definition of done:** source-exact safe mocked exporter, trustworthy Node22 receipt, **no actual export** and an owner decision that can be answered simply YES/NO. After owner approves, carry out the export as a separate constrained action, verify a restore on a truly isolated Docker environment, then stage and UAT before any production security release.
