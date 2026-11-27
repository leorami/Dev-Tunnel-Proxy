# V215 — one release-ready Status, Health, and Reports frontend

Source only. Nothing in this record was installed, served, merged, restarted, or activated. Code-ready is not production-ready.

## Where this stands

Issue #271 comment 7228088257 asked for one coherent Status, Health, and Reports frontend, starting from the V214 engineer tip. STARTED is #271 comment 7228483815. The V214 grant that replaced one live Status document is already consumed. This sprint does not use it again.

Protected `main` at the start of this return was `590bcf2a980b434f533ddacac43a24a777a933e7`. The engineer branch is `engineer/devproxy-v215-release-frontend-20261127`, opened from `d646eba26cd3b5bbf4657ce3e79d834c30247203`. Draft pull request [#289](https://github.com/leorami/Dev-Tunnel-Proxy/pull/289) targets that V214 branch. Do not merge it.

The evidence branch is `evidence/devproxy-v215-release-frontend-visuals-20261127`. Draft pull request [#290](https://github.com/leorami/Dev-Tunnel-Proxy/pull/290) is never-merge. The frames below are a synthetic preview, not live user acceptance testing.

The owner checkout at `/Users/leorami/Development/dev-tunnel-proxy` was not edited. Its `status/` files were only re-read so the hash table below is current.

## Manifest

`status` tree on the engineer tip, unchanged by the later test-fixture commit and by this document: `f1c1693ae4fd9c2e406b639406727985892fef43`.

Git blob is the Git object id. SHA-256 is the hash of the file bytes. The versioned names use the first 12 hex digits of that SHA-256.

| File | Owner checkout, still served | V214 tip `d646eba` | V215 candidate |
| --- | --- | --- | --- |
| `status/common.js` | blob `33d757a78f2d65edcaad93d543fa955010a7e069`, sha256 `c967d51b384982abb52c3f83015081b3fa0ceb98c598a095a0deebcc1f4b9932`. Does not export `registerHeaderRefresh`. | blob `121ea9440a357fb79b8e896b5ae9cbef4f69acb3`, sha256 `25f646c3ddd4c2ec1b710649b9921f4abd0c8f9af82bf8463575efb0b3e510b8` | unchanged from `d646eba` |
| `status/common.css` | blob `28f006befdc02bc93f460abf04d2241a7a05ef4b`, sha256 `07c995ce8d3f24279c1c87ac01944c30d1db2823a4c47e5b22cad7861175ab97` | blob `e2da6231d921893311bda441be3a0161454bd72a`, sha256 `42c0928ec30a12de732d3cf8d9469de001046d44d8fa107e6d66393139237b80` | unchanged from `d646eba` |
| `status/config.js` | blob `bd858c04942a6756dd43180830120463fe5eea5c`, sha256 `d3047ea4229bd0788c0007d77b84d8710aa7bb04cf0961b4f1c1af5f55972b1b` | same blob and sha256 | unchanged |
| `status/health.html` | blob `dd58d4b9fbde72dd2be06fd54682366a0aae9e04`, sha256 `9c30e78b7b2eea1ae34d34269ab3b08094d87855f6dec43276b6bec7fa5d6643` | blob `cdc245be0ddbef49d5171f8d15a89bfdce6c4bef`, sha256 `8cc165db3234bccf7b40233907b78d39b200cab73527912607f672911c40c2c5` | blob `6b2bd77795fe6e3ca4d2750ad61b24bcd83e166a`, sha256 `b4f34fb4e1d2cf8db6020167123d43d75cbb8f225d9205df462954b4da3d02c6` |
| `status/reports.html` | blob `42aebbec2626703a8b2d9ee671ff387e637e5546`, sha256 `484b34d71ce558af0470cb5903f02bdfadb58c6f200d9bb8b5473ea88fbf4c9c` | blob `08e84d0398894b3b7f11520b9e3b7fd10d207d07`, sha256 `29ad2f528dfd0bfb36e49603db04c1f702c00fb0b36d2144b75a5bae2e2467d9` | blob `22c0d26af6bdbc7cedee6fe82e0b543ab267a777`, sha256 `a3fa732011feff8513ccda233e86147772cd093ed40443743f1fc73c07d909ad` |
| `status/status.html` | blob `1728475984c35569b5b45caac0bed944ca7535a9`, sha256 `f5c8e539c52ca7df782924f9bc6ce7e2f2e377f9ce52f5ea5ebba97513fbe5d4` | blob `765584fef92244a02e8d919d89ca2eb86f05c520`, sha256 `664b3b73c40b293eb35b240e2016f248b65c4244db335a6efa8d7fd8c7a030cb` | blob `928ef41dfbb3d160862a38f22f36ce1543df72d1`, sha256 `8ead4bbf3437c6364517a3f9834b732b7776fe7f60069c2eaa4a926255b43d35` |
| `status/common.v215-42c0928ec30a.css` | not present | not present | same bytes as V214 `common.css`. blob `e2da6231d921893311bda441be3a0161454bd72a`, sha256 `42c0928ec30a12de732d3cf8d9469de001046d44d8fa107e6d66393139237b80` |
| `status/common.v215-dfd52e64df59.js` | not present | not present | blob `a3cb96da695e81382737a7c63796c4cba76d149f`, sha256 `dfd52e64df59644e9f52562b745bdf5ce6334b3203677d14090d50548d3b7eda` |

The three V214 document preimages are stored at `tests/security/fixtures/v215-v214-documents/` so the install proof does not need the ancestor commit. A hosted checkout is shallow, and the first Node and secure runs failed on `git show d646eba:status/health.html` for that reason. Those saved bytes hash to the V214 blobs above.

## What the candidate changes

Health accepts a conflict count only when it is a safe whole number of zero or more. Anything else is "Unknown" and is not green. The scan time comes only from `routes.generatedAt`. A missing, invalid, or failed routes document is never a green success. A health body that loads but has the wrong shape is malformed. The page does not say "Health re-read" when a read failed. Proxy and target values are labeled historical. `/health.json` is labeled "Proxy responding", which means the proxy answered, not that an upstream or an application is healthy. "Reachable" and "report available" stay separate facts. Each Health read has a generation, so a slower older read cannot paint over a newer one.

Reports tells a real empty catalog (`ok: true`, no items, total 0) apart from a malformed success (`{}`, `ok` without items, or a total that is not a safe whole number), an empty page past the last page, and a failed request. Refresh and pagination ignore a stale response. An out-of-range page recovers once, back to page 1, and then stops. A malformed page is not reported as "No reports found".

The three new documents load only `common.v215-42c0928ec30a.css` and `common.v215-dfd52e64df59.js`. The versioned script looks for `link[data-dtp-shared-style]` and, if that marker is missing, injects the versioned stylesheet. It does not inject `/status/common.css`. The old `common.js` and `common.css` are byte-for-byte the V214 files, so a tab that already has them keeps working.

No nginx rule, listener, or framework was added. `location ^~ /status` already serves a new file name in that folder, still behind `/admin/check`.

## Compatibility

| Pair | Result |
| --- | --- |
| Old document plus old `common.js` / `common.css` | Unchanged bytes. An open tab that still has the old script keeps using it. |
| New document plus versioned CSS and JS | The only pair the new documents reference. |
| New document plus the unversioned stylesheet | The versioned script does not inject it. A browser test counts one shared stylesheet, and that stylesheet is the versioned file. |
| Mid-install, after the two assets and before a document | The old document still points at `common.js` and `common.css`. |
| After rollback of the three documents | The documents match the V214 preimage. The versioned files may remain. Nothing references them. |
| `/health.json` 200 or 503 | Proxy liveness only. It is not the historical report, and it is not upstream health. |
| Reports list body | Still `{ ok, items, pagination.total }`. No new endpoint. |
| Auth | `/status`, `/health`, and `/reports` stay behind the existing auth request. Anonymous `/status/health.html` is 401 in the fixture. Anonymous `/health.json` stays the small liveness body. |

`config.js` is the same blob on the owner checkout, on `d646eba`, and on this candidate. The owner `common.js` is a different, older blob and does not export `registerHeaderRefresh`. Copying a new document onto that older script would throw. The versioned script is how a new document avoids that.

## Install and rollback

These steps were proved on a temporary copy and in an isolated `nginx:1.26.3-alpine` container. They were not run against the owner tree. The installer refuses a target that is not under the temporary directory, and it refuses a target that sits inside a git checkout. Each step is one same-directory temp file, fsync, and rename. Several files are not replaced atomically. Stopping after any step is a valid state.

Before a new asset is added, an existing different byte string or a symlink is drift and the file is left untouched. Before a document is replaced, the current bytes must match the expected SHA-256, the inode must be a regular file, and the mode bits are copied onto the replacement. A mismatch or a symlink throws and leaves the target as it was.

1. Add `status/common.v215-42c0928ec30a.css`.
2. Add `status/common.v215-dfd52e64df59.js`.
3. Replace `status/health.html`.
4. Replace `status/reports.html`.
5. Replace `status/status.html`.

Rollback walks the document journal in reverse: `status.html`, then `reports.html`, then `health.html`. A document is restored only when its current bytes still match the hash that was installed. The versioned assets are not deleted. `common.js`, `vendor/lucide.min.js`, and an unrelated `owner-note.txt` stayed byte-for-byte in the fixture. The nginx fixture also checked that a cached old `common.js` was still served after the new Health document was in place, and that deleting the historical report file turns `/health.json` from `{"status":"ok"}` into `{"status":"unavailable"}` without changing the Health document.

## Release gates

Passed on engineer `1238912de95c6b262fdbd82b8da9f7c342d2d460`, draft #289:

- Supported Node source gate, run [46073532443](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073532443). Node 22 job `140755837239` and Node 24 job `140755836888` both succeeded.
- Secure release candidate, run [46073532434](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073532434). Runner contract job `140755837001` and full current contract job `140755943302` both succeeded.
- Auth-prefix workflow, run [46073532505](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073532505), succeeded.

The first push failed those same gates. Node run [46073084254](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073084254) and secure run [46073084351](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073084351) both died in `git show` because the hosted checkout does not contain the ancestor. The fixture commit is the fix. Those red runs are not a pass.

Local checks before the push, on the engineer worktree: the V215 intercepted browser file plus the two V214 browser files, 30 tests passed; the versioned-stylesheet browser check passed; the Node lane files in the supported-Node workflow, 81 passed; the nginx install fixture, 1 passed.

This document does not change `status/` or the tests those gates run. The Node workflow's path filter does not include this handoff, so that gate stays the `1238912` run. The secure workflow has no path filter and will run again for this commit. A docs commit is not a new product claim.

## The broad suite is still not green

The hosted secure gate above is the release gate. It is not the whole repository.

A local run of `tests/security/*.test.cjs` and `tests/security/*.test.mjs` as one process on this worktree finished 1499 tests, 1398 pass, 95 fail, 3 cancelled, 3 skipped, in 242378 ms. The log is not a hosted result. The three skips are the named native-nginx DNS cases: a static missing hostname, a resolved hostname whose process is stopped, and an absent or delayed backend. None of the failures are in a Status, Health, Reports, `common.js`, `common.css`, or V215 file.

The carried historical gate is still 79 failed, 2 cancelled, and 3 skipped. This re-run is higher because the files shared one process, so quarantine markers leak, and because it counts tests the earlier receipt grouped differently. It is not evidence that the historical 79 got worse or better under Origin.

The failing files are the rc1 host-settlement, nginx-closure, and quarantine family; the rc2 private-candidate, worker-closure, and verify-config family; `v192-libsignal-two-peers`, `v194-signal-signed-descriptor`, `v199-signal-endpoint-restart`, and `v201-request-binding`; and `v209-notification-pinned-runtime`. What they are hitting: closure checks want `STATIC_CONFIG_CLOSURE_VERIFIED` and get `UNBOUND_NGINX_CONFIG_FILE`; host quarantine fails or hits the 120 second timeout because this Mac is not the attested host; the rc2 files expect host-private inputs; libsignal and request binding fail outside their hosted lanes; v209 expects the pinned Node path.

Safe planned fix, with no blanket exclusion and no skipped-test hiding: keep each of those files on a hosted non-live fixture, and do not point them at the owner tree. The hosted Node and libsignal lanes already cover the contracts they own. No Status failure in this set needed a product change.

## Evidence

Visual workflow run [46073671941](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073671941) on evidence `6f8a1dab26c691271b767227ac5a18c60bc704b0` succeeded. Artifact `devproxy-v215-status-ux-originals`, id `15234630604`, size 1544759 bytes. The downloaded zip SHA-256 is `2ab28e83b1a654f07634c62547a073a3b022467cdd61c5a9fc1ec1b3cf0de5f9`, which matches the Actions digest.

The published Origin verifier, blob `7c8bdde23062482627f37d2a78560bfb37b4031c` on `leorami/project-template`, accepted all 16 PNGs. `testedSourceSha` and `servedSha` in the manifest are both `6f8a1dab26c691271b767227ac5a18c60bc704b0`. That commit's `status` tree is the same `f1c1693` as the engineer candidate. `inline_markdown` then stopped with `not_a_conversation_sandbox_file` because this machine has no `/mnt/data`. That is a path check after the byte check. It is not a digest failure, and it is not owner acceptance.

An earlier visual run, [46073213158](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/46073213158), rendered nothing. The browser tests passed, and the capture still waited for the old word "Responding". The page now says "Proxy responding". The evidence commit updates that wait. The frames from the green run show proxy liveness in green only when `/health.json` answered, "Unavailable" when the reads were missing, "No reports found" for a real empty catalog, and "Could not load reports" for a failure. Status still says the scan is historical and not live health.

The intercepted browser tests, locally and on that visual run, walked Health, Reports, Status, and the Dashboard header. No IDE browser tab was resized, and the owner's tab was not touched.

## Still blocked

- No file was copied into the served `status/` directory. The owner files in the table are still the served bytes.
- No merge, deploy, restart, prune, or credential change.
- The broad suite above is not green, and this record does not say the whole repository passed.
- Pixel markup cannot be inlined from this machine until a sandbox path exists. The zip and the 16 verified PNG digests are the transport.
- Source-ready is not production-ready. Nothing was activated.
