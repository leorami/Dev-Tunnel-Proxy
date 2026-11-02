# Dev Tunnel Proxy — private rollback archive, exact owner decision

**Release remains NO-GO.** This is a proposal and a **default-inert** local export implementation; the real Mac installation, Docker images, nginx, ngrok, routes, Messages.app and LaunchAgents have not been changed by CTO. The user has **not yet explicitly authorized** private export or deployment.

## What is verified

Engineer-I [Issue #19 RETURNED](https://github.com/leorami/Dev-Tunnel-Proxy/issues/19) on `cto/devproxy-rc1-rollback-readiness-20261101@34821698239ec93ed4d4d937e6a2bb5ff69d20b4`; CTO compared it to the frozen tested `20fe6d10f61b61a84027c3bd5857e48af7578f32` and read the receipt. Exactly **one receipt file** was added on return. Historical RED 0/1, focused GREEN 10/10, canonical unit success and correct fail-closed NO_GO are supported. No image export, restore, merge, production switch, public tunnel request, or owner staging UAT occurred.

Read-only installed image IDs are:
- `dev-proxy`: `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634`
- `dev-proxy-config-api`: `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`
- `dev-ngrok`: `sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa`

These IDs are **not backups**. The previous receipt estimates image sizes totaling ~134 MiB and ~60 GiB free on the root volume, but Docker Desktop's private disk limit and archive compression overhead are unverified. Do not assume the destination has sufficient available space until measured privately.

## New isolated, source-only implementation

`scripts/private-rollback-export.mjs` is a cautious operator script. **Without arguments, it performs no Docker calls or disk writes**. It will never execute an export in the absence of the explicit `--execute --owner-approved` arguments, and the mere presence of flags does NOT prove owner permission. They are accident-prevention only; actual approval must exist outside the software. It requires all three currently running container image IDs to still match exact pinned values, and those images to remain installed. Unknown IDs fail closed before any export.

After a separately granted owner approval and private operator run, it writes a one-time `rollback-images.tar` under:
`~/Library/Application Support/Dev Tunnel Proxy/private-rollbacks/release-<random>/`

- Creates private directories mode `0700`, files `0600`, rejects symlinked ancestors or permissive preexisting root; no output in the repository, `.artifacts` web tree, logs, chat, or connected cloud storage.
- Uses `docker image save` for **exact image IDs**, not a moving `latest` tag; argument-vector subprocess, no user-supplied shell or host path.
- Records SHA-256 of the archive to owner-only `SHA256SUMS.private`; checks live container image IDs again; never prunes, pulls, loads, stops or restarts anything.
- Prints only fixed status strings without the archive path or checksum. The owner can inspect the private path on their Mac, not paste it into chat.
- **Saving and hashing an image archive is NOT equivalent to proving a restore**, even if archive creation succeeds. The `rollbackArchiveVerified` gate must remain NOT_RUN until checksum and full restore/recreation are proved in a separate disposable Docker test daemon, and current config/state/routes are preserved.

Test `tests/security/private-rollback-export.test.mjs` was authored RED-first. It creates an isolated HOME and a fake Docker executable in a test-only PATH. Tests verify default inert behavior, wrong flags, image drift refusal, symlinked/permissive directory refusal, private artifact creation and no live-effect command. Hooked to safe `./smart-build.sh test:unit`. CTO has only inspected GitHub source and syntax, **not executed native Node or Docker tests**.

## Owner choices: the real next decision

**YES, authorize private export only:** The owner explicitly authorizes exporting only the **three image IDs above** to the fixed owner-private location on the Mac. Engineer-I may run the pinned, tested operator script only *after* its mock test suite passes and exact live IDs are reconfirmed. Permission does **not** include a restore, Docker prune, config copy, public network probe, production restart, merge, or deploy. Archive contents may include embedded app code or secrets, so they must never be uploaded.

**NO or not yet:** Engineer-I can still safely prove mock-only behavior, but the live archive remains blocked, and the production release remains NO-GO.

## Further release blockers beyond the image archive

1. A private read-only health/route baseline (not just filenames or mtimes), and exact last-known-good nginx/Compose/override/app route/config state. Any private config copy or snapshot needs its own owner permission. 
2. A **tested restore** using isolated Docker (not owner running daemon), including confirmation the previous nginx/API/ngrok images and config can restart with identical route behavior; do not rely on destructive `scripts/switch-to-production.sh` or `switch-to-development.sh`.
3. Staged owner UAT (login/logout, dashboard, app routes, public ingress, and separately controlled Mac bridge pairing), plus explicit production GO approval.
4. Pending Origin validation protocol/port and root Docker socket privileges. Record the risks even if a staged rollout of containment is ultimately authorized.

**Bottom line:** A safe archive is a prerequisite; it is NOT an approval to install the security release. Do not keep declaring source GREEN as if it had changed the running proxy.
