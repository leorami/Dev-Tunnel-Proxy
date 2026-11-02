# DEVPROXY-RC1 recovery verification receipt

Engineer-I execution of [Issue #26](https://github.com/leorami/Dev-Tunnel-Proxy/issues/26) from pinned `6193565cbd2f39f3ecad990ba5fec433475d870f`. Existing private image and config archives were **preserved** and not recreated.

**ALREADY_BACKED_UP.** **VERIFIED** for the three Issue #26 checks below. **NOT_DEPLOYED.** **NO_LIVE_RELOAD.**

## Source identity

| Item | Value |
| --- | --- |
| Branch | `cto/devproxy-rc1-private-config-snapshot-20261101` |
| Tested start SHA | `6193565cbd2f39f3ecad990ba5fec433475d870f` |
| Resulting SHA | the commit that adds this receipt |
| Parent recovery | Issue #19 RETURNED / draft PR #25 |
| Coordination | Issue #26 |
| Node | v22.19.0 |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |
| Commit author | `User <user@example.com>` |

## Evidence split

| Label | Meaning |
| --- | --- |
| ALREADY_BACKED_UP | Private ~140MB image tar and 76-file config tar already on the owner Mac from the prior sprint |
| VERIFIED | Named tag binding in disposable dind; exact route order after mtime restore; fail-closed read-only nginx startup |
| BLOCKED | Live cutover, public ingress UAT, Mac bridge host plan, protected merge |
| NOT_DEPLOYED | Host proxy/image IDs unchanged; no compose restart |

## RED / GREEN

| Gate | Result | Exit |
| --- | --- | --- |
| Old `nginx-entrypoint.sh` vs new read-only test | 1 pass / 1 fail (ignored `mv` failure and claimed apps disabled) | 1 |
| Mac `tar` 10ms vs 60ms mtimes | Round-trip collapses to a tie (RED for precedence) | observed |
| New suites together | 9 pass / 0 fail | 0 |
| `./smart-build.sh test:unit` | prior suites plus read-only startup, mtime restore, tag binding | 0 |

## 1) Named image restore → immutable IDs

OCI `docker load` materializes **config digests**, while the recorded recovery IDs are **index digests** in `index.json`. Mapping from the preserved archive:

| Compose ref | Original immutable ID | Loaded ID after dind `docker load` | `docker image inspect <ref>` |
| --- | --- | --- | --- |
| `dev-tunnel-proxy-proxy:latest` | `sha256:bfc92bd8…fac41634` | `sha256:345bd478…f3167f` | same loaded ID |
| `node:18-alpine` | `sha256:8d6421d6…a09d9e` | `sha256:c5914b9d…97b1c17` | same loaded ID |
| `ngrok/ngrok:latest` | `sha256:141f5645…bf2bfa` | `sha256:664248f8…c2e1e1c` | same loaded ID |

Disposable `docker:27-dind` only: load → tag → inspect. Host daemon was not loaded or retagged. dind removed afterward. Pure helper: `utils/recovery-image-binding.cjs`.

## 2) Exact route precedence

Native macOS `bsdtar` 3.5.3 collapses some sub-second mtimes (10ms vs 60ms became equal). Against the **existing** private config archive: 21 of 76 files differed from manifest `mtimeMs` after plain extract; `utils/restore-manifest-mtimes.cjs` reapplied exact times with hash/mode/symlink/traversal guards; **0 mismatches** afterward; full `apps/*.conf` newest-first order matched the manifest (17 files). No same-basename conflict group exists in the current apps tree; order equality still proves generateAppsBundle sorting inputs.

## 3) Fail-closed read-only nginx startup

`scripts/nginx-entrypoint.sh` no longer ignores a failed `mv` of `apps.generated.conf`. On read-only `sites-enabled` it exits nonzero and does not print “App routes are disabled”. Fixture test + disposable `nginx:1.25-alpine` with `:ro` mount: exit 1, bundle preserved. Writable path may still disable and retry once.

## Live system

Proxy still `running` on `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634`. Private archives untouched aside from reading. LaunchAgent / bridge not modified.

## Remaining before deploy

Owner staging UAT, public ingress plan, Mac bridge plan, explicit GO, and any live recreate that would retag or replace the owner daemon — still separate approvals.
