# DEVPROXY P0 origin staging + exact RC1 Compose dry-run — Engineer-I completion

**Return label:** `OWNER_DECISION_REQUIRED` / `PLAN_ONLY` / `NOT_DEPLOYED` / `RUNTIME_STILL_DRIFTED`  
**Not:** READY / GO / DEPLOYED / productionChangeAuthorized

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Authority
- Resumed PR #44 tip `5fcea935705d6383ac668a77cde4a8f77a584446`
- Owner staging authorization: Issue #10 comment `6595352764` (verify HTTPS Origin of existing ngrok static domain; create new private `0700`/`0600` staging; dry-run only)
- Handoff constraint: `docs/handoffs/DEVPROXY_P0_ORIGIN_OVERLAY_FINAL_PROVENANCE.md@ef68bed4921e2007030c7fb36d96102615832923`
- **Separate owner GO for live restoration: still required (not granted)**

## Exact SHAs / images
| Role | Value |
| --- | --- |
| This receipt branch tip | full 40-SHA on draft PR head after push |
| Prior RETURNED base | `5fcea935705d6383ac668a77cde4a8f77a584446` |
| Product pin | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master (untouched) | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Candidate proxy image | `rc1cutoverdisp-proxy:latest` (`sha256:9b2ae98f11d8…`) |
| Shared `default.production.conf` digest | `0c9bd6e23f603d13c0afeded627b9ac135574c8826adc55fe9b6eed3e3adc408` |

## Private origin verification (redacted)
| Check | Result |
| --- | --- |
| Owner `NGROK_STATIC_DOMAIN` key present + hostname-shaped | yes |
| Live ngrok env domain matches owner env (values unprinted) | yes |
| HTTPS Origin built as `https://` + that hostname only | yes |
| Loopback preserved | exactly `http://127.0.0.1:8080` (count 1) |
| `normalizeTrustedOrigins` accepted count | **2** |
| CSRF helper: evil Origin denied; HTTPS + loopback allowed | yes |
| Owner `.env` modified | **no** |
| Origins/credentials/paths printed to GitHub | **no** |

## Staging file creation
| Check | Result |
| --- | --- |
| Created | **YES** |
| Parent dir mode | `0700` |
| File mode | `0600` |
| Symlink parent/file | false |
| Under private Application Support root (not git checkout / not `.artifacts`) | yes |
| Keys only | `DEVPROXY_TRUSTED_ORIGINS`, synthetic `ADMIN_PASSWORD` (not owner password) |
| Mounted/injected into live proxy/api/ngrok | **false** |
| Live API `DEVPROXY_TRUSTED_ORIGINS` | still **UNSET** |

## Exact RC1 Compose dry-run
| Check | Result |
| --- | --- |
| `docker compose … config --quiet` | exit **0** |
| Services | `proxy`, `proxy-config-api` only |
| Candidate `/app` | **read-only** |
| Shared nginx↔API default.conf same source + RO | yes; digest match above |
| API host ports 3001/3002 | **loopback only** |
| Proxy 80/443 | published (ingress) |
| API `DEVPROXY_TRUSTED_ORIGINS` present in resolved config | **true** (bool only) |
| Owner apps non-backup count | **17** |
| Any `up` / `restart` / `down` / `apply` / live recreate | **no** |

## Tests (Node v22.19.0)
| Suite | Result |
| --- | --- |
| Focused existing security suites (origins/CSRF/parity/mount/preflight/p0 evidence/show-password) | **43/43** |
| `./smart-build.sh test:unit` | **exit 0** |

## Evidence reconcile
```
evaluateP0RestorationEvidence → status=OWNER_DECISION_REQUIRED
  blockers=[]
  productionChangeAuthorized=false deployed=false performedActions=false

assessCutoverPreflight → status=BLOCKED
  blockers: controlledReleaseOwnerAuthorized, exactSourceDiffReviewed
  (expected: technical gates cleared; live GO + CTO review still open)
```

## Live runtime
IDs **unchanged**: proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`.  
Runtime remains drifted until a **separate** owner-authorized scoped cutover.

## ONE owner decision (restoration — separate from staging auth already granted)
Authorize (or deny) a **new** controlled proxy+API-only recreate using: candidate image `9b2ae98f11d8…` / product `d89c962…`, shared release-config digest `0c9bd6e23f…`, this private staging origins file (not owner `.env`), loopback 3001/3002, no project-wide compose down, no ngrok/bridge/master mutation; rollback ≤120s to `bfc92bd8…`. Stop for CTO source review before that GO.

## Forbidden actions confirmed not done
No production deploy/restart/recreate; no ngrok/bridge/LaunchAgent changes; no owner `.env` edit; no secret/path disclosure; no protected merge; no `switch-to-production.sh`.

**Specialists:** none.
