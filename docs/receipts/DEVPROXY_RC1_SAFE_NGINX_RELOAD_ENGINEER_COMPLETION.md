# DEVPROXY-RC1 safe nginx reload receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_RC1_SAFE_NGINX_RELOAD_OWNER_GATE.md`. Fake node/docker only. The running proxy was not reloaded.

**NO_LIVE_RELOAD.** **NO_DEPLOY.** **NO_EXPORT.**

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-rc1-safe-reload-20261101` |
| Tested CTO SHA | `4fb807d79c130dd15273e3b0a6d863b7f48410a5` |
| In-scope addition | refuse a symlinked `apps.generated.conf` path before node or docker runs |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Parent private-export | issue #21 RETURNED at `eb068144273527b8f59de11be1e943eb4ceb08a9` |
| Draft review | PR #24 |
| Coordination | issue #23 |
| Node | v22.19.0 |
| Owner checkout | stayed `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

Draft PRs #2, #3, #5, #7, #11, #12, #13, #15, #16, #18, #20, and #22 were not edited.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 test of `9469d2dbc4373df559a67a779a9db7910bef9124` | 1 pass, 4 fail. Old soft-reload script still reloaded after failed generation and failed `nginx -t`, and left the new unverified file after a failed reload. | 1 |
| Node 22 `node --test tests/security/nginx-safe-reload.test.mjs` on the candidate plus the symlink refusal | 6 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` | collect-docs 23, embeddings 7, perimeter 10, admin session 9, bridge 10, login return 3, RC1 integration 5, packaging 4, release decision 10, private export 7, safe reload 6 | 0 |
| `./smart-build.sh test:all` | not run. It still calls live port 3001. | not run |
| Real `scripts/reload.sh` | not run | not run |
| Real `docker exec … nginx -s reload` | not run | not run |

`ADMIN_PASSWORD` for the unit run was process-only and was not printed. No worktree `.env` remained.

## In-scope source change

Pinned CTO commits already replaced the soft-reload path with fail-closed restore. This return adds one RED regression and the matching guard:

- Before generation, walk from `build/sites-enabled/apps.generated.conf` up to the repo root and refuse any symlink in that chain.
- Ancestors above the repo are not inspected, so a macOS `/var` → `/private/var` temporary root does not false-fail the fake suite.
- On refusal, the script exits before `node` or `docker`, leaves the symlink in place, and does not rewrite the symlink target.

Existing fake cases still cover: generator failure with no Docker contact and prior content restored; failed `nginx -t` with no reload; successful test then one reload; no prior file removed after failed validation; failed reload restores prior content and does not print success.

## Safety review

| Check | Result |
| --- | --- |
| Trap cleanup | `finish` on `EXIT` restores the backup with `mv -f` when a prior file existed, otherwise removes the candidate, then deletes the backup |
| Mode and content | Probe with mode `0640` and failed `nginx -t` restored `OLD_GOOD_CONF` at mode `0640`; backup files were gone |
| Invalid config | Failed `nginx -t` never reaches `nginx -s reload` |
| Missing Node | Exits before Docker; no `docker run` mount fallback remains |
| Symlink bundle | New test: status nonzero, empty Docker log, symlink preserved, target content unchanged |
| Live services | Proxy still running; node pid 3760 on `127.0.0.1:17888`; LaunchAgent label count 2 |

## Residual risks not solved by this patch

1. A second concurrent generator, or a signal that interrupts after generation and before the trap finishes, can still leave route drift. This script is not a lock.
2. A failed `nginx -s reload` restores the on-disk prior file. Active nginx workers may already have started loading the candidate. The script exits nonzero and does not claim success.
3. `scripts/nginx-entrypoint.sh` still tries to `mv` `apps.generated.conf` aside when boot-time `nginx -t` fails. A read-only mount makes that `mv` fail. That boot path was not changed here.
4. This patch does not export images, copy bind-mounted config, prove a restore, or authorize a security release. Those remain separate owner gates.

## Unperformed

No live reload, no compose up or down, no mode switch, no image save/load/prune, no public tunnel request, no credential or route-body read, no Messages or LaunchAgent change, and no protected merge.
