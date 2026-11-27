# V216 — release gate and safe delivery

Source only. Nothing in this record was installed, served, merged, restarted, or activated. Code-ready is not production-ready.

## Where this stands

Issue #271 comment 7229299719 asked for one source pass from the V215 return: close the Health and Reports response-contract gaps, qualify the installer, and make every required release lane strict green. STARTED is #271 comment 7229612992. The V214 live grant is already consumed. This sprint does not use it again.

Protected `main` at the start of this return was `590bcf2a980b434f533ddacac43a24a777a933e7`. The engineer branch is `engineer/devproxy-v216-release-gate-20261127`, opened from the V215 tip `e1a92c33334eb88b57333023cb5bd7dbaf33752c`. Draft pull request [#292](https://github.com/leorami/Dev-Tunnel-Proxy/pull/292) targets the V215 engineer branch. Do not merge it.

The evidence branch is `evidence/devproxy-v216-release-gate-visuals-20261127`. Draft pull request [#293](https://github.com/leorami/Dev-Tunnel-Proxy/pull/293) is never-merge. The frames below are a synthetic preview, not live user acceptance testing.

The owner checkout was not edited.

## Qualified product

The product commit is `6647b00fd2a4ab980d84ea6f9994b8cd5c71cae8`. Its `status` tree is `1696cc771f415725863617b1392ef4324e8c1149`. This document does not change that tree or the tests those gates ran.

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `status/health.html` | `014d74dd771a71c7958263cb9fd584ceb5de472c` | `11380567f1dba63faf2ce52262a6edbc0f31ea829401c5cd62dfe150bf4834ac` |
| `status/reports.html` | `1d2184b674afc7fbda6f2c6c2511685726f3e32c` | `ee545a532e43c26bf502656d74d477aa04ac9540f7e552e24f3896ffec8b399f` |
| `status/status.html` | `928ef41dfbb3d160862a38f22f36ce1543df72d1` | `8ead4bbf3437c6364517a3f9834b732b7776fe7f60069c2eaa4a926255b43d35` |
| `status/common.v215-42c0928ec30a.css` | `e2da6231d921893311bda441be3a0161454bd72a` | `42c0928ec30a12de732d3cf8d9469de001046d44d8fa107e6d66393139237b80` |
| `status/common.v215-dfd52e64df59.js` | `a3cb96da695e81382737a7c63796c4cba76d149f` | `dfd52e64df59644e9f52562b745bdf5ce6334b3203677d14090d50548d3b7eda` |

`status.html` and the versioned assets are unchanged from the V215 candidate. Health and Reports changed. The unversioned `common.js`, `common.css`, and `config.js` are not replaced. The activation procedure, the expected hashes, and the stop-if-different rule are in `docs/handoffs/DEVPROXY_V216_ACTIVATION_PACKET.md`.

## What the candidate changes

Health treats only `ok` and `unavailable` as known liveness. An HTTP 200 body whose routes value is `null` or an array is unavailable, and the page does not say "Health re-read". A missing or invalid `generatedAt` does not paint the conflict count green. An unrecognized `/health.json` status string is "Unavailable", not a successful reread. The known value `unavailable` still says "Proxy not ok".

Reports does not call a catalog populated when an item is `null`, when the page is longer than the page size, or when the window runs past the total. An empty catalog and a page past the end stay the explicit partial states they already were.

The installer is `scripts/v216-frontend-install.cjs`. It is a fixture helper. It still refuses a target outside the temporary directory and a target inside a git checkout. The journal and the preimages are written and fsynced before the first document-root change, and they live outside the nginx document root. Temporary files are created exclusively in the same directory. A file is refused unless it is a regular file with link count 1. Ownership, mode, ACL, and extended attributes are copied, and a platform that cannot read them fails closed. A child killed with `SIGKILL` is recovered by a new process from the journal. The inverse refuses byte, metadata, link, or target drift and does not write. The nginx fixture checks named assets, content types, a cached old script, the auth boundary, and that dotfiles and the journal are not served.

## Original RED

The lane workflow does not exist on the V215 tip, so there is no hosted lane run of unchanged `e1a92c3`. The first hosted lane run is the V216 commit that added the workflow.

[46081060173](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081060173) on `349bc819ad7d4f1d4f323f9aad2b19af7cdccaff` failed. libsignal-native did not see `V192_EXPECTED_LIBSIGNAL_VERSION`. The nginx install fixture did not see the hosted-CI markers. The browser lane looked for Playwright under the private `HOME`. Pure-node shard 0 failed `rc2-private-candidate-renderer` because the fixture binds were under the temp directory, which the product refuses. Shard 3 failed `v190-private-api-regex-auth-precedence` because the shallow checkout cannot `git show` protected main, and failed the three native-nginx cases because `nginx -t` could not open the package access log. Shards 1 and 2 passed on Node 22 and 24. The same SHA's secure gate [46081059936](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081059936), auth gate [46081059937](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081059937), and supported Node gate [46081060040](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081060040) passed.

The next lane run, [46081785947](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081785947) on `f5bca6d7da7cb02548b77eb3f4d9a5603245fd67`, still failed pure-node shard 3. `nginx -t` reported syntax ok and then `open() "/var/log/nginx/access.log" failed`. The other lanes on that run passed, including nginx-fixture and libsignal-native. Visual run [46081782860](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46081782860) failed one browser assertion that still expected the words "not ok" for an unrecognized health status. The capture itself uploaded. Those red runs are not a pass.

## Coverage reconciliation

`tests/release-lanes.json` maps every discovered test once. On this commit that is 175 pure-node files, 4 nginx-fixture files, 4 libsignal-native files, 7 browser files, and 42 blocked files. A security test cannot be listed as blocked. The lane runner starts each file in its own process with a private `HOME` and `TMPDIR`, and the job fails unless that file's own summary has tests greater than zero and zero failed, cancelled, skipped, and todo. The blocked lane prints the reason and does not execute the file. It is not a pass.

| File | Change | Assertion that stayed |
| --- | --- | --- |
| `rc2-private-candidate-renderer` | The fixture's host binds are durable synthetic paths. The stage directory is still a private temp directory. | The render is two services, user `504:20`, mode `0600`, and it does not deploy. A public stage is still refused. |
| `v190-private-api-regex-auth-precedence` | The protected-main config bytes are stored beside the test because a shallow checkout does not contain commit `590bcf2`. | Each file's git blob id is still the pinned id, and the worktree still differs by exactly the sixteen `^~` insertions. |
| `rc2-offline-upstream-native-nginx` | The fixture sets `error_log` and `access_log` inside its own prefix. | A missing static hostname must fail `nginx -t` with `host not found`. A numeric host must pass `nginx -t`. The delayed backend must not kill the master. All three ran. |
| `v199` and `v201` | The lane copies `V192_EXPECTED_LIBSIGNAL_VERSION` into the child. | The endpoint still rejects a missing or different pin. |
| `v216-frontend-install-nginx` | The lane copies the hosted-CI markers into the child. | The file still throws `RELEASE_FIXTURE_REQUIRES_ISOLATED_HOSTED_CI` anywhere else. |
| Health browser check | An unrecognized status is expected to read "Unavailable". | The invalid report's time, conflicts, and targets stay "Unknown". |

The 42 blocked files are the historical scripts under `test/` and the Playwright specs under `test/ui/tests/`. Each one has the same recorded reason: it is a historical manual, browser, or live-app diagnostic, it is not an isolated release test, and V216 does not run it or point it at the owner. No `tests/security` file is in that list.

## Release gates

All of these succeeded on product commit `6647b00fd2a4ab980d84ea6f9994b8cd5c71cae8`:

- Release lanes, run [46082095045](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082095045). Lane manifest, both Node 22 and Node 24 pure-node shards 0–3, nginx-fixture, libsignal-native, browser, and the blocked-capability record all succeeded.
- Secure release candidate, run [46082094989](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082094989). Runner contract and `smart-build.sh test:all` both succeeded.
- Supported Node source gate, run [46082094975](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082094975). Node 22 and Node 24 both succeeded.
- Auth-prefix workflow, run [46082094945](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082094945), succeeded.
- Private API regex-precedence workflow, run [46082094976](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082094976), succeeded.

Pushing this document starts those pull-request workflows again. The return comment names the runs for the product commit. A docs commit is not a new product claim.

## Evidence

Visual workflow run [46082091997](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46082091997) on evidence `fb9503f3894f10f9bdb411174cc69074dd5f9e96` succeeded. That commit's `status` tree is the same `1696cc771f415725863617b1392ef4324e8c1149` as the product commit. Artifact `devproxy-v216-status-ux-originals`, id `15237208294`, size 1544440 bytes. The zip SHA-256 is `be49487815638e4b03c086eb97c57ce68ffcbc44e70890fc1213fd12977da9cb`, which matches the Actions digest.

The published Origin verifier, blob `7c8bdde23062482627f37d2a78560bfb37b4031c` on `leorami/project-template`, accepted all 16 PNGs: synthetic-only manifest, `testedSourceSha` equal to `servedSha` (`fb9503f3894f10f9bdb411174cc69074dd5f9e96`), dimensions, and SHA-256. `inline_markdown` then stopped with `not_a_conversation_sandbox_file` because this machine has no `/mnt/data`. That is a path check after the byte check. It is not a digest failure, and it is not owner acceptance.

The frames show "Proxy responding" in green only when `/health.json` answered, "Unavailable" with unknown scan facts when the reads were missing, "No reports found" for an empty catalog, "Could not load reports" for a failed catalog, and one synthetic report when the catalog was populated. Status still says the scan is historical and not live health. Conflicts stay a report, not a live routing change. No IDE browser tab was resized.

## Owner-authorization decision

The required release lanes on `6647b00fd2a4ab980d84ea6f9994b8cd5c71cae8` are green. The minimal later decision, which this record does not perform, is:

Authorize one activation of status tree `1696cc771f415725863617b1392ef4324e8c1149` from that commit, and only by `docs/handoffs/DEVPROXY_V216_ACTIVATION_PACKET.md`. Stop with no write if the live preflight does not match the packet. Do not merge pull requests #292 or #293 as part of that decision.

## Still blocked

- No file was copied into the served tree.
- No merge, deploy, restart, prune, or credential change.
- The 42 historical diagnostics above were not run. They are recorded, not passed.
- Pixel markup cannot be inlined from this machine until a sandbox path exists. The zip and the manifest digests are the transport.
- Source-ready is not production-ready. Nothing was activated.
