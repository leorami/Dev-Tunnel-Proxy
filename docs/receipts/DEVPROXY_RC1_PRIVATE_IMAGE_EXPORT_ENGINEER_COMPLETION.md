# DEVPROXY-RC1 private image export receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_RC1_PRIVATE_EXPORT_SAFE_VERIFICATION.md`. The mock exporter is tested. **No live image archive was created.**

**LIVE_EXPORT_NOT_AUTHORIZED.** **Recommendation: NO-GO.**

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-rc1-private-rollback-export-20261101` |
| Tested CTO SHA | `6b3c054c8359484a9b9e726d3bb31afc5a6f00d6` |
| In-scope repair | `scripts/private-rollback-export.mjs` canonical private-path check |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Parent evidence | issue #19 RETURNED at `34821698239ec93ed4d4d937e6a2bb5ff69d20b4` |
| Draft review | PR #22 |
| Coordination | issue #21 |
| Node | v22.19.0 |
| Owner checkout | stayed `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

Draft PRs #2, #3, #5, #7, #11, #12, #13, #15, #16, #18, and #20 were not edited. No newer primary was active.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 test of `c77068f22ca14c3dca4f4523f820480ab94d9c6d` | 0 pass, 7 fail. The exporter script was not in that commit. | 1 |
| Node 22 test of the pinned tree before the repair | 6 pass, 1 fail. The approved fixture case returned `UNSAFE_PRIVATE_DIRECTORY` | 1 |
| Node 22 `node --test tests/security/private-rollback-export.test.mjs` after the repair | 7 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` | collect-docs 23, embeddings 7, perimeter 10, admin session 9, bridge 10, login return 3, RC1 integration 5, packaging 4, release decision 10, private export 7 | 0 |
| `./smart-build.sh test:all` | not run. It still calls live port 3001. | not run |
| Real `docker image save` | not run | not run |

`ADMIN_PASSWORD` for the unit run was process-only and was not printed. No worktree `.env` remained.

## Repair

On Darwin, `os.tmpdir()` is under `/var`, which resolves to `/private/var`. The pinned check required `realpath(root) === path.resolve(root)`. That rejected a normal temporary HOME before the fake archive could be written, so the approved-export test could not pass. The script now compares `realpath(root)` with `realpath(HOME)` plus the private relative path. A symlinked `Library` or `private-rollbacks` segment is still rejected by the existing `lstat` walk, and a directory that resolves outside HOME is still rejected. The symlink and world-readable cases stayed redacted failures with no fake `docker` log. Tests were not weakened.

## Fixture archive proof

A test-owned `docker` executable and a temporary HOME, not the owner daemon:

| Check | Result |
| --- | --- |
| Flags | `--execute --owner-approved` against the fake executable only |
| Status | 0 |
| Stdout | `PRIVATE_EXPORT_CREATED; RESTORE_NOT_VERIFIED; NO_DEPLOY` |
| Stderr | empty |
| Directory modes | private root `0700`, run directory `0700` |
| File modes | archive `0600`, `SHA256SUMS.private` `0600` |
| Archive | 600 bytes written by the fake `docker`, not an image |
| SHA-256 | `2f3d2caf803988cbb4d05b9e4477bf3b6e81e6ffae60db7023127d1275c91283` |
| Note | that digest, two spaces, `rollback-images.tar` |

The owner path `private-rollbacks` was absent before and after. The fake `image save` argv was exactly the three pinned image ids. The log had no `load`, `prune`, `compose`, `restart`, `stop`, or `start`.

Additional fake-Docker cases, all exit 2, none printed a marker, digest, URL, or home path:

| Case | Stdout | Archive left |
| --- | --- | --- |
| `docker image save` exits nonzero | `PRIVATE_EXPORT_FAILED; NO_DEPLOY` | no |
| save writes zero bytes | `PRIVATE_EXPORT_FAILED; NO_DEPLOY` | no |
| image id changes after save | `PRIVATE_EXPORT_FAILED; NO_DEPLOY` | no |
| docker exits 127 before inspect | `IMAGE_ID_MISMATCH; NO_DEPLOY` | private root not created |

The script does not call `launchctl`, does not open a URL, does not write `.artifacts`, and does not prune or restart containers.

## Live identifiers, unchanged

`docker inspect` format for status and image id only. Environment, mounts, and commands were not printed.

| Container | Status | Image id |
| --- | --- | --- |
| dev-proxy | running | `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| dev-proxy-config-api | running | `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` |
| dev-ngrok | running | `sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa` |

These match the issue #19 receipt. `image inspect` of each id returned the same id. They are still not a backup, and the `latest` tag is not a rollback target. Listeners remained node pid 3760 on `127.0.0.1:17888` and Docker pid 3787 on 8080, 3001, and 3002. The LaunchAgent label count stayed 2.

## Future restore, not performed

After a separate owner YES for the export, a later action may `docker image load` the private tar only into a Docker daemon that does not use the owner's socket. That daemon must not be the running installation. Confirm the loaded ids, then discard that daemon. Do not `docker load` into the owner daemon, and do not prune.

## Config baseline still requires its own YES

Image export does not copy bind-mounted config. Preserve these only after a separate private-backup approval:

| Item | Current metadata | Risk if a switch runs first |
| --- | --- | --- |
| `build/sites-enabled/apps.generated.conf` | 31,839 bytes, mode `0644` | `scripts/nginx-entrypoint.sh` tries to `mv` it aside when `nginx -t` fails. A read-only mount makes that `mv` fail, and the fallback cannot rename it. |
| App config names | 27 files, name hash `4f17904278565a14` | `utils/generateAppsBundle.js` sorts app files by mtime, newest first, so route precedence changes when timestamps change. |
| Overrides | 1 file, name hash `c8d85ec3eeac3831` | Same basename in apps and overrides is a conflict input to the generator. |
| sites-enabled names | 1 file, name hash `d20ec6edf13722d8` | This is the generated bundle above. |
| Proxy image and Compose mode | running development containers | `scripts/switch-to-production.sh` calls `docker-compose down` before its later copy steps. It was not run. |

No route health body was requested. The name hashes are not a route baseline PASS.

## Next single decision

YES or NO: authorize a private export of exactly these three running image ids into the fixed owner-private `private-rollbacks` directory. This assignment's answer is NO. A later YES still does not authorize restore, prune, config copy, tunnel checks, staging sign-in, merge, or deploy.

## Unperformed

No real `docker image save`, load, or prune. No compose up or down. No mode switch. No public tunnel request. No credential, session, or token read. No Messages or LaunchAgent change.
