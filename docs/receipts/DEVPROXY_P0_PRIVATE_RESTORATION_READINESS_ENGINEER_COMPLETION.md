# DEVPROXY P0 private restoration readiness — Engineer-I completion

**Return label:** `P0_RECOVERY_BLOCKED` / `RUNTIME_STILL_DRIFTED` / `NOT_DEPLOYED`  
**Not:** READY / GO / DEPLOYED / OWNER_DECISION_REQUIRED (evidence helper blocked before owner gate)

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Exact SHAs
| Role | Full SHA |
| --- | --- |
| Handoff executed | `df3d74881920abd0ef8c51c8b5f0e21a1f55091a` (`origin/cto/devproxy-p0-private-restoration-readiness-20261102`) |
| Source base (PR #39 tip) | `6a1b5a51386e0db0a2fd2db0fa5822374aa48404` |
| This engineer branch tip | `0a3e92e4cc5f612c0c64fcbaa8b533190fc77fb4` on `engineer/devproxy-p0-private-restoration-readiness-20261102` |
| Accepted RC1 product pin | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Reused cutover helpers from | `67c098d0dbf2240ba3021b944587ffb45ac8c46a` |
| Protected master (untouched) | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Candidate proxy image (local) | `sha256:9b2ae98f11d8…4636f0b1` (`rc1cutoverdisp-proxy:latest`) |
| Pre-RC1 proxy image (local + archive member) | `sha256:bfc92bd8e308…fac41634` |

## Status / source gate
- Draft PR #39 head still `6a1b5a51386e0db0a2fd2db0fa5822374aa48404` at start; disposable-bypass RETURNED Issue #10 `6591037350`; CTO acceptance referenced in handoff.
- No other primary engineer executing this restoration-readiness branch.
- Live IDs **unchanged** entire sprint: proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`.

## Tests (Node v22.19.0)
| Step | Result |
| --- | --- |
| Historical RED (helper absent) | fail (exit 1) |
| Focused GREEN `p0-restoration-evidence.test.cjs` | **8/8** |
| RC1 cutover preflight/parity/mount (imported) | **23/23** |
| `./smart-build.sh test:unit` (wired new suites) | **exit 0** |
| `test:all` | **not run** (live API risk) |

## Private plan inspection (redacted only)
- Private rollback root mode `700`; image archive sha256 `017d97d2…` (~140MB, 51 members) includes pre-RC1 `bfc92bd8…` + live API base `8d6421d6…`; config archive sha256 `6df93e4b…` (76 files); operator report mode `600`.
- Shared approved `default.production.conf` digest `0c9bd6e23f603d13c0afeded627b9ac135574c8826adc55fe9b6eed3e3adc408` (product `d89c962` == engineer tip == disposable nginx↔API).
- Owner `.env` mode `644`; **no** `DEVPROXY_TRUSTED_ORIGINS` key; `NGROK_STATIC_DOMAIN` key present (value never read into receipts).
- **No** persistent host `0600` trusted-origin overlay with `DEVPROXY_TRUSTED_ORIGINS` found under private support root.
- Live API `DEVPROXY_TRUSTED_ORIGINS=UNSET`; live `/health.json` len **1704** (regressed vs minimal 15).
- Owner apps non-backup `.conf` count **17**.
- Plan overlay `docker compose config --quiet` exit **0** for proxy+api services only — but env used **placeholder** origins (not owner-attested) ⇒ not exact.

## Disposable verification (`COMPOSE_PROJECT_NAME`/name `p0rrdisp`)
Isolated networks; no prod container names; host publish `127.0.0.1:18080` only; API 3001/3002 **unpublished**; no ngrok; no docker.sock; synthetic password/origins; synthetic 17 routes.

| Check | Result |
| --- | --- |
| `/health.json` present | 200 body `{"status":"ok"}` len 15 |
| `/health.json` missing file | 503 `{"status":"unavailable"}` |
| Anon `/routes.json` `/status.json` | 302 → login |
| `/.artifacts/` | 404 |
| `nginx -t` | ok |
| Shared config digest nginx↔API | match `0c9bd6e23f…` |
| Direct `:3001` `ai/chat-history` | 302 login (denied) |
| Untrusted net → `:3002` POST | **TIMEOUT** (unreachable) |
| Internal `:3002` POST control | http 200 |
| CSRF wrong Origin | 403 `Origin denied` |
| CSRF trusted Origin login | 200 |
| Authed `/routes.json` | 200 |
| Rollback pre↔candidate images | **3s** total (`budget_120s=true`) |
| Live IDs after disposable down | unchanged |

## Evidence reconcile
```
evaluateP0RestorationEvidence → status=BLOCKED
  blockers: exactResolvedComposeOverlayVerified, trustedOriginsPrivate
  productionChangeAuthorized=false deployed=false performedActions=false

assessCutoverPreflight → status=BLOCKED
  blockers: controlledReleaseOwnerAuthorized, exactSourceDiffReviewed,
            trustedBrowserOriginsValidatedPrivately
```

## Precise missing facts (why BLOCKED, not OWNER_DECISION_REQUIRED)
1. **No owner-attested private `0600` `DEVPROXY_TRUSTED_ORIGINS` overlay** currently on disk for live restoration; live API origins unset; cannot re-derive/print owner origin values in this sprint.
2. **Exact live Compose overlay not verified** with owner-attested origins (dry-run used placeholders only).
3. **Prior controlled-release GO must not be reused** after unexplained regression — needs a new explicit owner decision after CTO source review.
4. Live runtime remains drifted (full health JSON, all-interface 3001/3002, owner `/app` RW + docker.sock RW per R0).

## ONE owner decision recommendation (ask once)
When (1)–(3) above are closed and CTO accepts this source diff:

- **Do:** scoped `proxy` + `proxy-config-api` only recreate using absolute private-state binds + candidate image `9b2ae98f11d8` / product `d89c962` + shared release-config digest `0c9bd6e23f…` + new private `0600` origins env-file (owner `.env` not replaced); loopback-only 3001/3002; no project `compose down`, no `switch-to-production.sh`, no ngrok/bridge/master mutation.
- **Rollback ≤120s:** force-recreate proxy to pre-image `bfc92bd8e308…` (present on daemon and in private image archive); private config archive available; disposable drill restored candidate in **3s**.
- **Preserve:** macOS bridge/LaunchAgent, ngrok container `178b23cb…`, owner checkout/master.
- **Risk if leave live as-is:** anonymous detailed health (len 1704), all-interface direct API/notification ports, unauthenticated surface from R0 still exposed.

**Specialists launched this sprint:** none.

## Forbidden actions confirmed not done
No production compose up/down/stop/restart/recreate; no admin mutation on live; no image pull/prune/load on owner daemon beyond using already-local tags; no firewall/LaunchAgent/ngrok/bridge changes; no secret publish; no owner `.env` overwrite; no master merge; no 004A deploy; no `scripts/switch-to-production.sh`.
