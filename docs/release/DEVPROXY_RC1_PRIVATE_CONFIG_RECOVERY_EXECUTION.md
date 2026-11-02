# DevProxy RC1 — real owner-private config recovery, not a paper gate

**State:** CTO source-only tool prepared; **NO LIVE MAC BACKUP EXECUTED**, no deployment authorized. Owner's later directive in [Issue #19](https://github.com/leorami/Dev-Tunnel-Proxy/issues/19#issuecomment-6568525541) explicitly authorizes protective private backups and offline recovery work. Earlier NO-EXPORT comments predate that directive. Existing one primary Engineer-I still owns the nginx reload sprint in Issue #23; do not interrupt or create another simultaneous primary.

## Why this exists

The tested image exporter in PR #22 archives only three running Docker images. It **cannot** preserve nginx routes, Compose override/mode, certificates, config, sessions, tunnel parameters, dashboard static files, or other bind-mounted owner state. Production API bind-mounts the repo into a root process with the host Docker socket, so changing an owner checkout is potentially a live change. Never use old destructive production switch scripts to obtain backup evidence.

## CTO's prepared implementation

`scripts/private-config-snapshot.mjs` is a safe, separately gated **local** configuration snapshot. With no arguments it writes nothing and does not access Docker. It accepts only `--execute --owner-approved --source-root <absolute-owner-checkout>`, and archives that explicit owner root rather than the script's own checkout. A relative or symlinked source root is rejected. This flag prevents accidental execution; **it does not grant permission**. Owner permission for protective local backups is documented in Issue #19.

The script requires a current `docker-compose.yml`, `config/default.conf`, and `build/sites-enabled/apps.generated.conf`. It backs up present allowlisted recovery-critical paths: Compose/override manifests, `config/`, `build/sites-enabled/`, `apps/`, `overrides/`, `status/`, `dashboard/public/`, known relevant scripts, and any `.env*`, `.certs/`, `.artifacts/` that exist. It intentionally does NOT recursively copy every source/dependency in the repository or any host Docker socket; original source SHA and dirty workspace state must be recorded privately as a separate inventory to make full reconstruction possible.

Security and correctness:
- Stores a tar, private per-file SHA256/mode/mtime manifest, and private archive SHA256 in a one-time `config-*` subdirectory of `~/Library/Application Support/Dev Tunnel Proxy/private-rollbacks/`.
- Writes private archive files mode `0600` under directories mode `0700`. Never logs a file path, secret, hash or token to stdout; no network or Docker subprocess. Archive includes **sensitive original data** and must never be uploaded, attached to a GitHub issue, pasted into ChatGPT, or put in a served `.artifacts` tree.
- Refuses missing required source files, source symlinks (including nested paths), unsafe destination symlinks or permissions, source trees over 8 GiB / 100,000 entries, or insufficient disk capacity. Uses argv-only `tar`, with a source re-hash to detect content changing mid-snapshot.
- A `tar` plus SHA manifest is **NOT** a tested complete recovery. A separate isolated extraction must prove modes, mtimes, per-file hashes and nginx route precedence; Docker images additionally need an **independent daemon** and original tags verified. Rollback also needs current live Compose mode and potentially the named nginx cache volume; no restore into the owner's running Docker daemon.

## Real execution sequence (only AFTER original Issue #23 RETURNED)

1. Re-check actual primary agent state, clean/dirty owner checkout, live Docker image IDs, root volume + Docker Desktop disk capacity, current Compose mode, and route file existence using minimal read-only metadata. Preserve all owner files and live services.
2. From a frozen, reviewed **owner-controlled local checkout**, run the Engineer-validated image export **and** this configuration snapshot with explicit owner-authorized flags. Both write only to owner-private local storage. Do not run scripts from an untrusted PR without code review.
3. Hash archives, verify restrictive modes, record all previous image reference/tag bindings, and **extract the configuration tar into a disposable test-only directory**, compare hashes/modes/mtimes. Image archive must be tested with a separate offline Docker environment, not the owner's active socket or running images.
4. Run a disposable nginx/API/browser fixture with restored route/config material **without exposing actual credentials**. Verify each existing app route against a private redacted baseline; public ingress and Mac bridge remain separate explicit owner gates.
5. Produce a private operator recovery report containing the archive paths; GitHub receives only nonsecret evidence status, test exit codes, SHA of code tested, counts and next blockers. **No production merge, rebuild, reload, restart or cutover without separately explicit owner approval.**

## Evidence available now

CTO wrote the test first: `tests/security/private-config-snapshot.test.mjs` originally had **0/8 passing** with the source missing. A local disposable Node test with a fake owner HOME/checkout then passed **8/8**, including actual fixture tar extraction, secret confinement, per-file restore, original mtime, wrong/missing flags, symlinks and overly broad destination permissions. These tests did not inspect, modify or copy the owner's actual Mac data. Exact native Mac source validation and canonical project unit suite are still pending, to be performed by the sole primary Engineer after Issue #23 returns.

**Stop conditions:** never claim BACKUP_COMPLETE on an untested source branch; never start a duplicate Engineer; never say images/config were saved until there is an owner-local private archive and hash/recovery receipt. Owner permission for backup does not include master merge or live production modifications.
