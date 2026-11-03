# DEVPROXY P0 RO code + RW route/data parity — owner GO packet

**Return label:** `RO_ROUTE_MUTATION_PARITY_READY_FOR_OWNER_GO` / `NOT_DEPLOYED`  
**Not:** live recreate · reuse of GO `6595948888` · docker.sock remount · master merge

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO handoff | `origin/cto/devproxy-p0-api-only-postcheck-20261103@4c75d7f4a7bc8cc0f227360d4c43255f552e0fae` / PR #54 |
| Prior Engineer return | PR #53 `@228bd700e9b980c2d2a948087c4ee02b6b07a566` |
| Approved product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Consumed GO | Issue #10 `6595948888` |
| This receipt tip | commit SHA after push |

Companion: `docs/receipts/evidence/DEVPROXY_P0_RO_CODE_RW_ROUTE_DATA_PARITY_20261103.json`

## STARTED
Rechecked PR #53 SHA, CTO tip `4c75d7f…`, live IDs (proxy `1932725ad746…`, api `51bbafd0cf14…`, ngrok `178b23cbdb9d…`). No live recreate / owner file probes.

## IMPLEMENTING
### Tests (Node v22.19.0)
| Suite | Result |
| --- | --- |
| Focused postcheck + empty-dotenv + nested-mount | **34/34**, exit **0** |
| `./smart-build.sh test:unit` | exit **0** (includes API-only postcheck 13 cases) |

### Disposable RO code + RW data (torn down)
Private non-Git candidate digest parity **true** before placeholders; nested mount helper staged empty `.env` / dirs. Origins-only env_file dry-check: **3** origins, no `ADMIN_PASSWORD`. Exact overlay `config --quiet` ok.

**Mount matrix (compose + runtime):**

| Target | RW |
| --- | --- |
| `/app` (code) | **false** |
| `/app/.env` | **false** |
| `/app/apps` | **true** |
| `/app/overrides` | **true** |
| `/app/config` | **true** |
| `/app/build/sites-enabled` | **true** |
| `/app/.artifacts` | **true** |

| Functional check | Result |
| --- | --- |
| Write `/app/utils` `/app/scripts` | **EROFS** |
| Host Docker socket | **absent** (`docker_bin=no`, `sock=no`) |
| Login + session | **ok** |
| 17 synth apps preserved | **true** |
| `POST .../apps/install` | file **written** to RW apps; HTTP **422** `nginx_test_failed` |
| `POST .../overrides/promote` | override **written**; HTTP **422** `nginx_test_failed` |
| `POST .../apps/regenerate` | **200**; sites bundle includes new app |
| Config dir write under `/app/config` | **ok** on RW mount |
| Unexpected writable `/app/utils` in postcheck evaluator | `WRITABLE_APP_SUBMOUNT` |
| Synthetic postcheck complete matrix | `API_ONLY_RO_POSTCHECK_PLAN_ONLY` (not live-attested) |

### Remaining CTO architectural note (not fixed here)
`nginxTestAndMaybeReload()` shells `docker exec dev-proxy nginx -t`. Without Docker CLI/socket inside API, install/promote/config HTTP finish **422** after successful RW file mutation (config HTTP reverts on failure). **Do not remount host docker.sock.** Separate decision needed for reload signaling before/with live API-only remount.

## Live passive
`/app` still **RW** on production API; proxy candidate image; 17 apps; ngrok unchanged; **no** live mutation this turn.

## RETURNED
**`RO_ROUTE_MUTATION_PARITY_READY_FOR_OWNER_GO` / `NOT_DEPLOYED`.** Route/data mutation under RO code root is verified in disposable runtime. Stop for CTO review; fresh owner GO still required for any live API-only remount.

**Specialists:** none. **Production mutate:** none.
