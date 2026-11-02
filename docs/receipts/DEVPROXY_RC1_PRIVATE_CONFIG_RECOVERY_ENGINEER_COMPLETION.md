# DEVPROXY-RC1 private image and config recovery receipt

Engineer-I execution of `docs/release/DEVPROXY_RC1_PRIVATE_CONFIG_RECOVERY_EXECUTION.md` after Issue #23 RETURNED. CTO corrections from PR #25 were applied before any owner archive. The original unsafe snapshot was not run against owner files.

**NO_DEPLOY.** **NO_LIVE_RELOAD.** **NO_PROTECTED_MERGE.** Host Docker daemon was not used as a restore target.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-rc1-private-config-snapshot-20261101` |
| Pinned start SHA | `14fd9458bbd5c6947b6c188a437bb011856f8cb1` |
| Reconciled safe-reload | `c15ec9f5ca881b32b7596c2a50f90326c4acf72f` |
| Merge commit | `fa153a200e92f5399ce9f527a25cf317cd5dce6f` |
| Correction commit | `069aff84ac82add5d9a64f65cba4ad32f0c3c46f` then the capacity-scoped follow-up on this return |
| Draft review | PR #25 |
| Coordination | Issue #19 owner directive `6568525541` |
| Node | v22.19.0 |
| Owner checkout | stayed `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

## RED / GREEN

| Command | Result | Exit |
| --- | --- | --- |
| Historical `1c761b2` config tests | 0 pass / 8 fail (script absent) | 1 |
| CTO regressions vs original PR #25 script | 3 pass / 11 fail (`SOURCE_ROOT_REQUIRED`, wrong tree, stale mode/mtime) | 1 |
| Corrected `private-config-snapshot` suite | 15 pass / 0 fail | 0 |
| `nginx-safe-reload` after merge | 6 pass / 0 fail | 0 |
| `./smart-build.sh test:unit` | all prior security suites plus config (15) and safe reload (6) | 0 |
| `./smart-build.sh test:all` | not run (live port 3001) | not run |

## Corrections implemented

1. Require `--execute --owner-approved --source-root <absolute owner checkout>`.
2. Reject relative or symlinked source roots / ancestors.
3. After `tar`, recheck each file's type, bytes, mode, mtime, and SHA-256; fail `SOURCE_CHANGED` and delete the incomplete run directory.
4. Refuse a directory that becomes a symlink during archive.
5. Scope `.artifacts` to recovery-critical files. Recursive `.artifacts/reports` alone exceeded 100k nodes / multi-GiB and returned `CAPACITY_LIMIT` on the first authorized attempt. Reports are not required to restore nginx routes.

## Authorized private backups (owner Mac)

Both tools were run from the reviewed worktree. Archives live only under the owner-private `private-rollbacks` tree (mode `0700`). No archive path, secret, or `.env` body is included here.

### Image archive

| Check | Result |
| --- | --- |
| Command | `node scripts/private-rollback-export.mjs --execute --owner-approved` |
| Status | `PRIVATE_EXPORT_CREATED; RESTORE_NOT_VERIFIED; NO_DEPLOY` |
| Exit | 0 |
| Running IDs at export | proxy / API / ngrok still matched the three pinned IDs |
| Archive | ~140,540,928 bytes, mode `0600` |
| SHA-256 | `017d97d20e2e718253ae9e2611e35dd5558fcd7182f091eaa51f23e50bb66fc7` |
| Recorded tags | `dev-tunnel-proxy-proxy:latest`, `node:18-alpine`, `ngrok/ngrok:latest` |

### Config archive

| Check | Result |
| --- | --- |
| Command | `… --execute --owner-approved --source-root` owner checkout |
| First attempt | `CAPACITY_LIMIT` because recursive `.artifacts` exceeded node budget |
| After scope fix | `PRIVATE_CONFIG_SNAPSHOT_CREATED; ISOLATED_RESTORE_NOT_VERIFIED; NO_DEPLOY` |
| Exit | 0 |
| Manifest | 76 files, 1,351,056 bytes |
| Source head recorded privately | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Source dirty | true (untracked `.cursor/` only on the owner tree) |
| Compose files present | yml, override, production |
| Includes generated routes | yes |
| Includes `.artifacts/reports` | no |
| Includes admin-session artifact | yes (opaque bytes only) |

## Isolated restore evidence

### Config

Extracted the config tar into a disposable `/private/tmp` directory. Compared every manifest entry for type, mode, whole-second mtime, and SHA-256: **0 mismatches**. Disposable tree deleted. Restored route name fingerprints (files under each directory): apps 28 / `bbc3b4a78e292ef9`, overrides 1 / `c8d85ec3eeac3831`, sites-enabled 1 / `d20ec6edf13722d8`. Generated bundle contained 55 `location` directives.

Stock `nginx:1.25-alpine nginx -t` against restored `default.conf` + `apps.generated.conf` with fixture certs and stub upstreams: **syntax ok / test successful**. That is not a live reload and not a browser UAT.

### Images

1. Offline: archive `index.json` lists the three original digests.
2. Disposable privileged `docker:27-dind` on a private network, archive mounted read-only, loaded with `docker load` **inside dind only**.
3. Load printed three image IDs (platform config digests). Archive `RepoTags` were null, so retag from the private tag record is required for a named restore.
4. dind container and network were removed. Host running containers were not replaced or restarted. Proxy remained `running` on `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634`.

A private operator report (`OPERATOR_RECOVERY_REPORT.private.json`, mode `0600`) was written beside the archives. It is not committed and must not be uploaded.

## Live system unchanged

| Check | Result |
| --- | --- |
| Proxy | running, same image id |
| Bridge | pid 3760 on `127.0.0.1:17888` |
| LaunchAgent label count | 2 |
| Owner git | `master@62a4d7b`, only `?? .cursor/` |

## Remaining blockers before any deploy

Public ingress review, owner staging UAT, Mac bridge host plan, explicit production GO, and a retag+recreate drill that still must not target the live daemon without a separate owner cutover approval.

## Unperformed

No protected merge, no compose down/up/restart, no mode switch, no host `docker load`/`prune`, no public tunnel change, no Messages/LaunchAgent change, and no deployment.
