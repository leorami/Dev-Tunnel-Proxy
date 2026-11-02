# DEVPROXY-RC1 owner release evidence receipt

Engineer-I execution of `docs/handoffs/DEVPROXY_RC1_OWNER_RELEASE_EVIDENCE_ONLY.md` at the pinned SHA. This is a redacted decision record. It is not a deployment, and a passing classifier is not permission to install anything.

**Recommendation: NO-GO.** The readiness CLI exited 2. Release authority stays with the owner. Deployment performed: no.

## Source identity

| Item | Value |
| --- | --- |
| Repository | `leorami/Dev-Tunnel-Proxy` |
| Branch | `cto/devproxy-rc1-rollback-readiness-20261101` |
| Tested CTO SHA | `20fe6d10f61b61a84027c3bd5857e48af7578f32` |
| Resulting SHA | the commit that adds this receipt on the assignment branch |
| Parent preflight | `54cb4c78ba40ac2e71e7123af9a91bacf36de815`, draft PR #18, CTO conditional package acceptance, owner NO-GO |
| Protected baseline | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Draft review | PR #20 |
| Coordination | issue #19 |
| Node | v22.19.0 |
| Owner checkout | stayed `master` with untracked `.cursor/` only |
| Commit author | `User <user@example.com>` (sandbox git identity; git config was not changed) |

No product file needed a further change. Draft PRs #2, #3, #5, #7, #11, #12, #13, #15, #16, and #18 were not edited.

## Commands and exits

| Command | Result | Exit |
| --- | --- | --- |
| Node 22 test of `c594b20048e935635d128f0e36a6111a1393b5c8` | 0 pass, 1 fail. `utils/release-decision.cjs` was missing. | 1 |
| Node 22 `node --test tests/security/release-decision-readonly.test.mjs` | 10 pass, 0 fail | 0 |
| `./smart-build.sh test:unit` | prior six security suites plus this decision file | 0 |
| `./smart-build.sh test:all` | not run. It still calls live port 3001. | not run |
| Decision CLI with the evidence states below | `Recommendation: NO_GO`, `Release authority: OWNER_ONLY`, `Deployment performed: NO` | 2 |
| Decision CLI with non-JSON input containing a private marker, a URL, and a fake digest | `NO_GO`, every gate `NOT_RUN`. The marker, URL, and digest were not printed. | 2 |

`ADMIN_PASSWORD` for the unit run was process-only and was not printed. No worktree `.env` remained.

## Evidence states fed to the classifier

| Gate | State | Why |
| --- | --- | --- |
| sourceTests | PASS | This unit gate, exit 0 |
| productionCompose | PASS | Preflight receipt: Compose-built image `sha256:693d99872b2a263caf5a611165a1b7c62e11b055d49a0806934adeb14ae57cb7`, disposable only |
| node18Parity | PASS | Preflight receipt: `node:18-alpine` reported v18.20.8 |
| fixtureBrowser | PASS | Preflight headless login stayed on the local origin |
| macBridgeMock | PASS | RC1 mocked bridge, no live Messages or LaunchAgent change |
| currentImageIdentified | PASS | Metadata below |
| rollbackArchiveVerified | NOT_RUN | No image was saved, hashed as an archive, or restored |
| routeBaselineRecorded | NOT_RUN | File counts only. Live route health was not collected |
| publicIngressPlanReviewed | NOT_RUN | No tunnel query |
| ownerStagingUat | NOT_RUN | The owner has not signed in on a staged package |
| macBridgeOwnerPlan | NOT_RUN | The live bridge was not paired or restarted |
| ownerExplicitApproval | NOT_RUN | This assignment does not grant it |

All-PASS evidence still cannot set `releaseAuthorized` or `installed`. That case is covered by the unit test and returns `READY_FOR_OWNER_DECISION` with both flags false. Today's evidence is not that case.

## Installed identifiers

Read with `docker inspect` format strings for name, status, image reference, and image id only. Environment, labels, mounts, and command lines were not printed.

| Container | Status | Image reference | Image id |
| --- | --- | --- | --- |
| dev-proxy | running | `dev-tunnel-proxy-proxy` | `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| dev-proxy-config-api | running | `node:18-alpine` | `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` |
| dev-ngrok | running | `ngrok/ngrok:latest` | `sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa` |

Image sizes from `docker image inspect` size field: proxy 20,387,290 bytes, API base 44,929,293 bytes, ngrok 74,779,628 bytes. Together about 134 MiB. These ids are not a backup. `docker system df` did not return and was stopped; it was not used. Root volume `df` reported about 60 GiB available. That is enough room for a later private export. The export was not run.

Live node pid 3760 was still the listener on `127.0.0.1:17888`. The LaunchAgent label count was 2. Neither plist nor token was read.

## Route fingerprint, not a baseline

On the owner checkout, without printing names:

| Directory | File count | SHA-256 prefix of the sorted relative names |
| --- | --- | --- |
| apps | 27 | `4f17904278565a14` |
| overrides | 1 | `c8d85ec3eeac3831` |
| build/sites-enabled | 1 | `d20ec6edf13722d8` |

No `/.artifacts` body was requested. No public URL was queried. This fingerprint is not `routeBaselineRecorded: PASS` because live health and route status were not collected.

## Private rollback proposal, not performed

Do this only after a separate owner instruction that names the archive path. Do not commit the archive. Do not prune images before or after.

1. Create an owner-private directory outside the repo, mode `0700`.
2. `docker image save` the three ids above into one archive in that directory, mode `0600`.
3. Record `shasum -a 256` of the archive in a private note, not in git.
4. Confirm the running containers still report the same ids.
5. Leave at least several GiB free. The observed root volume had about 60 GiB free and the three images are about 134 MiB; Docker Desktop's own disk limit was not queried because `docker system df` hung.
6. Restore, only after a failed rollout, with `docker image load` from that archive, then start the previous image ids. Do not use `docker image prune` as the rollback.

If that archive does not exist, rollback of a replaced proxy image is unproven. Today it does not exist.

## Rollback checklist

| Piece | Keep | Unproven |
| --- | --- | --- |
| Proxy image | `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` | No offline copy |
| API image | `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` | No offline copy |
| ngrok image | `sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa` | `latest` can move; the id above is the running one |
| Compose mode | Do not run `scripts/switch-to-production.sh` | A switch would rewrite config and restart containers |
| Mac bridge | Leave pid 3760 and the two LaunchAgent labels | No tested bootout/bootstrap plan and no owner pairing rehearsal |

## Owner staging UAT, not performed

When a later staged copy exists, the owner personally checks: sign-in and sign-out, tunnel and local modes, app routes, health, dashboard, one safe Calliope read, anonymous denial of management routes, and per-tab Mac pairing with the owner's own token. This sprint did not open the owner's browser, did not send Messages, and did not use the bridge token.

## Next single decision

Authorize, or decline, a private offline export of the three running image ids. Until that archive is hashed and the owner completes staging UAT, deployment stays NO-GO. No further feature sprint is required for this decision.

## Unperformed

No compose up or down, no mode switch, no nginx or ngrok reload, no `docker image save`, load, or prune, no public tunnel request, no credential read, and no LaunchAgent change.
