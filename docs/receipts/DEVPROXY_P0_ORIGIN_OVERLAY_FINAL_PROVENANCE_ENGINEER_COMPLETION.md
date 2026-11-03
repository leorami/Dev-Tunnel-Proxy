# DEVPROXY P0 origin overlay final provenance — Engineer-I completion

**Return label:** `P0_RECOVERY_BLOCKED` / `BLOCKED_ORIGIN_OWNER_ATTESTATION` / `RUNTIME_STILL_DRIFTED` / `NOT_DEPLOYED`  
**Not:** OWNER_DECISION_REQUIRED / READY / GO / DEPLOYED

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Exact SHAs
| Role | Full SHA |
| --- | --- |
| Handoff executed | `ef68bed4921e2007030c7fb36d96102615832923` (`origin/cto/devproxy-p0-private-origin-provenance-20261102`) |
| Source base (PR #42 tip) | `f25a70dd36285a561e00908b8523b7c58b533bc3` |
| This engineer branch tip | recorded as draft PR head after push |
| Accepted RC1 product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master (untouched) | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Candidate proxy image | `sha256:9b2ae98f11d8…4636f0b1` (local) |
| Pre-RC1 proxy image | `sha256:bfc92bd8e308…fac41634` (local + private archive member) |

## Status gate
- Issue #10 RETURNED `6591334573` / tip pin `6591336059` rechecked; PR #42 tip matches base.
- CTO PR #43 / handoff @ `ef68bed…` rechecked before work.
- No competing engineer branch for this provenance assignment.
- Live IDs **unchanged**: proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`.

## Tests (Node v22.19.0) — existing suites only, no new validators
| Suite | Result |
| --- | --- |
| Focused: trusted-origin CSRF + compose-gate + rc1 parity/mount/preflight + p0 evidence + security-release-integration | **43/43** |
| `security-release-integration` asserts `/admin/show-password` removed from API + nginx `return 404` | covered (preserved) |
| `./smart-build.sh test:unit` | **exit 0** |
| `test:all` | not run |

## Private provenance recovery (redacted)
| Fact | Result |
| --- | --- |
| Prior private `0600` `DEVPROXY_TRUSTED_ORIGINS` overlay on disk | **not found** |
| Private rollback archives contain `DEVPROXY_TRUSTED_ORIGINS` key | **no** |
| Owner `.env` mode | `644` |
| Owner `.env` has `DEVPROXY_TRUSTED_ORIGINS` | **no** |
| Owner `.env` has `NGROK_STATIC_DOMAIN` key | **yes** (value never printed) |
| Live ngrok `NGROK_STATIC_DOMAIN` | **SET** (value never printed) |
| Live API `DEVPROXY_TRUSTED_ORIGINS` | **UNSET** |
| Public cutover receipt documented origin **count** | **3** |
| Public cutover documented loopback Origin | `http://127.0.0.1:8080` |
| Public/exact **HTTPS** browser Origin string documented | **false** |
| `NGROK_STATIC_DOMAIN` alone treated as owner browser trust | **no** (per handoff) |
| Separate owner authorization to create private staging env file | **absent** |
| Staging env file created this sprint | **NO** |

**One precise block:** `BLOCKED_ORIGIN_OWNER_ATTESTATION` — cannot reconstruct/write an owner-attested exact Origin set without (a) documented exact HTTPS browser Origin(s) corroborated beyond the domain key alone, and (b) separate owner authorization to create the private `0600` staging env file. No invented surrogate, no Host/X-Forwarded inference, no secret print, no owner `.env` edit.

## Exact Compose overlay
Not attested. Handoff forbids counting placeholder domains as proof; without the attested `0600` origins file, `docker compose … config` with real origins was not run. Prior placeholder dry-run from readiness sprint remains non-authoritative.

## Evidence reconcile
```
evaluateP0RestorationEvidence → BLOCKED
  blockers: exactResolvedComposeOverlayVerified, trustedOriginsPrivate
  productionChangeAuthorized=false deployed=false performedActions=false

assessCutoverPreflight → BLOCKED
  blockers: controlledReleaseOwnerAuthorized, exactSourceDiffReviewed,
            trustedBrowserOriginsValidatedPrivately, liveComposeDryRunOnly
```

## Owner decision needed (ask once)
To clear this technical block only (still not a live cutover GO):

1. Attest the exact trusted browser Origin set (HTTPS static-domain Origin + any genuine loopbacks such as the previously proved `http://127.0.0.1:8080`), without pasting secrets into chat if preferred via a private local path you authorize.
2. Explicitly authorize creation of a **new** private `0700` root + `0600` staging env file (not owner `.env`, not Git, not web-served, not mounted into live API).
3. After that file exists, a follow-on sprint can dry-run the exact service-scoped RC1 Compose overlay and re-evaluate evidence → possible `OWNER_DECISION_REQUIRED / PLAN_ONLY` for a **separate** second controlled cutover GO.

Live remains drifted (detailed anonymous health, all-interface 3001/3002, master-like API with legacy show-password risk per CTO note `6591346867`). No live mutation this sprint.

## Forbidden actions confirmed not done
No production compose up/down/restart/apply; no staging env write; no owner `.env` edit; no secret/path publish; no image pull/prune/load; no ngrok/bridge/master change; no `switch-to-production.sh`; no new origin-normalization framework; no duplicate show-password test.

**Specialists:** none.
