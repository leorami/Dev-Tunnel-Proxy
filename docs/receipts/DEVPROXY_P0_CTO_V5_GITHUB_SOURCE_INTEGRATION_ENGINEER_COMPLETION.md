# DEVPROXY P0 CTO v5 GitHub-source integration — disposable verified

**Return label:** `DISPOSABLE_ROUTE_ACTIVATION_VERIFIED` / `NOT_DEPLOYED`  
**Not:** production recreate · protected merge · reuse of GO `6595948888` · docker.sock on web API

## Lifecycle
`STARTED → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO handoff | `origin/cto/devproxy-p0-v5-source-first-20261103@e31d9b031af300b93e663e547439386bf04e7ab8` / PR #58 |
| Prior Engineer #57 | `78a3f94a2c4e68e64dc061d0833cf3ec596227aa` (source unavailable) — not repeated |
| Approved product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Approved API blob | `2eb02328ab892add8a07648890c0047daafa3fc2` |
| CTO preview blob | `74fb1cd3e0985df05ce89bc8a2ededf025933052` |
| Disposable proxy image | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Consumed GO | Issue #10 `6595948888` |
| This receipt tip |  |

Companion evidence under `docs/receipts/evidence/DEVPROXY_P0_CTO_V5_GITHUB_SOURCE_*`.

## STARTED
Verified CTO tip `e31d9b03…`, preview/codemod blob match, live IDs (proxy `1932725ad746…`, api `51bbafd0cf14…`, ngrok `178b23cbdb9d…`). No live mutation.

## VERIFYING
### Fixture / unit
| Suite | Result |
| --- | --- |
| `TMPDIR=/private/tmp/… node --test cto/route-activation-v5/tests/*.test.cjs` | **125/125**, exit **0** (Node v22.19.0) |
| `./smart-build.sh test:unit` | exit **0** |
| Codemod `--preview-nonlive` vs committed preview | **byte-identical** blob `74fb1cd3…` |
| `node --check` integrated API | exit **0** |

### Disposable Mac Docker (`dpv5act`, torn down)
RO `/app` + RO `.env`; RW apps/overrides/config/sites-enabled/artifacts; **no** docker.sock on API. Host mediator = non-API sidecar with HMAC Unix socket on shared Linux volume; docker.sock **only** on broker sidecar (Mac host↔container Unix sockets unavailable). Lock dir on Docker volume (Mac bind-mount `fd.close` EIO).

| Check | Result |
| --- | --- |
| Login + session + trusted-origin CSRF deny | **200 / 403** |
| 17 synthetic routes preserved | **true** |
| Install + nginx active route | **HTTP 200**, curl **200** `v5act2-live` |
| Promote | **HTTP 200** |
| Config edit (`config/default.production.conf`) | **HTTP 200** |
| Regenerate no-reload / reload | **200 / 200** |
| Invalid nginx candidate | **HTTP 422** + file/bundle restored |
| Host quarantine / durable route marker | **HTTP 503** then **ROUTE_STATE_QUARANTINED** |
| Rename | deferred **503** `transactional_rename_not_integrated` |
| Production IDs unchanged | **true** |

## Deferred (not complete feature parity)
Transactional rename and destructive cleanup remain fail-closed per CTO codemod; not silently re-enabled.

## RETURNED
**`DISPOSABLE_ROUTE_ACTIVATION_VERIFIED` / `NOT_DEPLOYED`.**

**Specialists:** none. **Production mutate:** none.
