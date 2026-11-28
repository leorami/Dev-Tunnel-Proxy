# V212 Engineer completion

## Lifecycle

STARTED #271/7166201227. CTO pin `origin/cto/devproxy-v212-secure-release-gate-20261125@e02e18eaad8c786e488834eb6c5fed7aa58f8b45`. Handoff `docs/handoffs/DEVPROXY_V212_SECURE_RELEASE_GATE.md`, blob `2aaf62dacb5a001cac8c44486826d481691fad34`. Parent READY / NOT STARTED is #271/7165922334. No V212 STARTED comment and no `engineer/devproxy-v212-*` branch existed at start. Engineer branch `engineer/devproxy-v212-secure-release-gate-20261125`. Draft PR #284. Base is the frozen CTO branch. Draft #283 and draft #282 were not edited. Protected `main` remained `590bcf2a980b434f533ddacac43a24a777a933e7`. V211 remains RETURNED/STOPPED #271/7165726328 at `5ba786d23140d7b7be07a6f22b5c358ea484ec35`.

Work was done in an isolated checkout at the frozen pin. The dirty owner checkout was not switched and its unrelated local edits were not modified. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`. No owner-host `test:all`, disposable nginx fixture, live service, Status replacement, second observation, API/route/config edit, notification, bridge, archive, or protected merge.

The code under test is `9a3c1d76bfc8833d70d8b463ed1ad1de087f6453`. This receipt is the only later commit, and it changes documentation only. Hosted checkout merge `fea3b2541d6e29288cb4737c6cf56f3e4cf36d35` has parents `e02e18eaad8c786e488834eb6c5fed7aa58f8b45` and `9a3c1d76bfc8833d70d8b463ed1ad1de087f6453`, and its tree equals that code commit (`b0a7a131f089a4ebb760ff1ab8696634b5546642`).

## Original RED and GREEN

Read from job logs, not badges.

| Run | SHA | Result |
| --- | --- | --- |
| 45637875073 | `642fe031b97a2bcada9ab5aad8820566fc2cf34c` | Runner contract 0 pass / 5 fail |
| 45638066374 | `1d7d0cd2bb8618bb2c8993a07a1e73fe1e276aa6` | Runner contract 5/5, fail 0 |
| 45638090815 | `c27a802462d036de967f00893f222be9fe4accd7` | Full gate failed. Private-config snapshot 15/15 `ENOENT` on `/private/tmp`. Secure contract 49 pass / 2 fail on stale source assertions |
| 45638252795 | `9759089d4b65ee7680254ce9df6c44c1880676ce` | Strict-summary RED: runner 6 pass / 1 fail. Omitted fail count was accepted. Full lane skipped |
| 45638410897 | `ef63a16d2c0a8d5895425540ae8963e3e5a8679c` | Runner job 7/7. Full lane: nginx fixture 6/6, secure contract 51/51, unit stopped at `nginx-readonly-startup` 0 pass / 2 fail, `ENOENT` `mkdtemp '/private/tmp/devproxy-nginx-ro-'` |
| 45638564324 | `e02e18eaad8c786e488834eb6c5fed7aa58f8b45` | Same full-lane failure on the frozen pin. Runner job 7/7 |
| 45638410850 and 45638564708 | `ef63a16d2c0a8d5895425540ae8963e3e5a8679c` and the pin | Supported Node source gate, not re-run here |

Local RED, before the fix, Node v24.22.3: the two new runner assertions failed and the previous seven passed (7 pass / 2 fail). That RED was not a separate hosted run. The pull request did not exist until the fix was already pushed. The hosted defect remains run 45638564324.

## Fix

No production source, route, config, or security assertion changed.

- `b30da5f73a68482de8a44fdffd26b995313b9828` adds the two failing runner assertions.
- `9a3c1d76bfc8833d70d8b463ed1ad1de087f6453` points `nginx-readonly-startup.test.mjs` (1 root) and `restore-route-precedence.test.mjs` (4 roots) at `fs.realpathSync(os.tmpdir())`, and widens `.github/workflows/devproxy-v212-secure-release.yml` so a test-only change reruns the gate. Paths: `tests/**`, `test/**`, `scripts/**`, `utils/**`, `utils/proxyConfigAPI.js`, `config/**`, plus the runner and the workflow file.

`/private/tmp` string literals that are denied-path inputs, not `mkdtemp` roots, were left unchanged.

Native check, isolated checkout only, explicit Node v24.22.3, those two files plus the runner contract: 15 tests, 15 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. This was not `test:all` and did not start nginx.

## Hosted candidate gate

Run 45641280522 on head `9a3c1d76bfc8833d70d8b463ed1ad1de087f6453`. `ubuntu-24.04`, Node v24.22.3. Both jobs success.

- Runner contract, job 139300277361: 9 tests, 9 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo.
- Full current contract, job 139300543985: 56 groups, 700 tests, 700 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. `ALL TESTS PASSED (15s)`.
  - Unit lane: 54 groups, 643 pass. Includes the previously unreached groups after the read-only nginx fixture, through the durable-mount group. Read-only nginx startup 2/2. Route precedence 4/4. The Linux tar round-trip met the existing mtime assertion. No assertion was weakened.
  - Native nginx fixture: 6 pass (V171 and V190). Image `nginx:1.26.3-alpine` was pulled inside that job.
  - Secure contract: 51 pass, including the production handler test.

Every summary group in that log had tests, pass, fail, cancelled, skipped, and todo, and the strict parser accepted them. No `DRY_RUN`, skipped fixture, or timeout-as-success.

The completed Node source lane was not requalified. Engineer commits do not touch its path filter. Last green run 45638564708 at the pin: Node v22.23.5 and v24.22.3, each 64 pass / 64, 0 fail, 0 cancelled, 0 skipped, 0 todo.

## Coverage disposition

Historical entrypoints are present and byte-identical to the pin:

| File | Blob |
| --- | --- |
| `test/calliope-simple-test.js` | `91ec025c069fdaed1b869d633336f784b0fbb906` |
| `test/test-incremental-thoughts.sh` | `af61684327cd7c9ee0be630d03a963f42ad2a4f3` |
| `test/site-auditor-test.js` | `71d5f983d1d471fd2cfc7ff5e1a5a134aa6c6c44` |
| `test/browser-console-test.js` | `f487715b273abb41750c1760ad083ab1fecbb980` |
| `test/mixed-content-test.js` | `0b09d1aa3a53b8de4dd8d705067ae25f32720a43` |

`test:thoughts` and `test:calliope` now run the current secure contract and do not invoke those files. `test:auditor`, `test:browser`, and `test:mixed-content` refuse ordinary execution. Autonomous repair, real streaming, external-model diagnosis, and browser audit remain unverified and are not current secure-mode functionality. Superseded for this gate by the 51-test secure contract: protected minimal health, authenticated local Ask, empty thoughts stub, legacy heal denial, bounded HEAD observation, route and auth denials, and the current source/UI contracts already in that list.

Runner guard: `require_isolated_release_ci` is executed by the runner test on a normal host and must return `RELEASE_FIXTURE_REQUIRES_ISOLATED_HOSTED_CI`. It is an environment misuse guard, not authorization. Strict-count tests reject a missing field, a nonzero fail/cancelled/skipped/todo, a short pass count, and a failing process.

Handler fixture `tests/security/v212-secure-release-api.test.cjs`: test-owned copy of `utils/`, synthetic password and session, in-process `handle()`. Child-process methods, `fetch`, and `https` are mocked to fail the test if called. The only injected transport is HEAD to `dev-proxy:80`. No `listen`. It checks public health, 401 without a session, foreign-origin 403, unauthenticated Ask, empty thoughts including `?since=`, local documented Ask, injected approval 400, legacy `audit-and-heal` 503 `LEGACY_UNSETTLED_MANAGEMENT_BLOCKED`, invalid audit destination 400 with zero probes, safe audit and scan counts, and unchanged diagnostics and session bytes.

Missing transport and denial cases also run inside the 51: `LOCAL_HTTP_PROBE_UNAVAILABLE`, `READONLY_HTTP_SCAN_UNAVAILABLE`, `SELF_CHECK_HTTP_PROBE_UNAVAILABLE`, and the bounded network-exception case. `rc2-secure-http-audit.test.cjs` still opens a loopback listener inside this hosted job only. It was not run on the owner host.

`tests/security/rc2-secure-self-check-fail-closed.test.cjs` is on disk and was not deleted. `smart-build.sh` has never referenced it (`git log -S` is empty). It is not a V212 removal. The required heal denial is exercised by the handler test and by `rc2-self-check-api-contract.test.cjs` / `rc2-secure-self-check.test.cjs`. The extra file remains unused by this candidate gate.

Inside `cmd_test_unit`, a failing group still skips later groups. The V160 group is not behind that check. This successful run did not skip a group. That short-circuit was not changed.

## Limits

This run does not prove the owner runtime, the served Status document, or the old browser, streaming, external-AI, or autonomous-heal behavior. No current UI mutation. No private original-byte transport was available without a new listener or an owner data transfer. Visual result: `BLOCKED_VISIBLE_PIXEL_TRANSPORT`. No screenshot was manufactured. The V211 observation was not repeated. Its grant stays consumed.

## Origin

`leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2`. `CORE_PROTOCOL_LOCK.json` blob on that commit is `1a13179679ce9cf1172ac1506f2d37019a4b021d`, which matches the V211 receipt. Blob `5194ef29f3b5b3fe20c6afca817723440e43f699` is not in that repository and first appears as text in the V210 receipt. History was not rewritten. No Cursor Origin namespace was visible in this session, so this reconciliation is the GitHub published master, not a second policy source. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` does not name Dev Proxy. Registration pending. No confidential material was added.

## Next activation

Do not activate from this receipt. The reviewed V210 document blob `1728475984c35569b5b45caac0bed944ca7535a9` is unchanged and was not deployed. The served document remains the pre-V210 blob recorded by V211. Independent CTO acceptance of this candidate gate is required before any Status activation. This pass is not a waiver of the owner-runtime or original-pixel gates, and it is not a protected merge.
