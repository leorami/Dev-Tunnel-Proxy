# DEVPROXY P0 — disposable-bypass RED correction (Engineer)

**Labels:** `P0_SOURCE_REVIEW_READY` / `P0_RUNTIME_STILL_DRIFTED` / `P0_RELEASE_NOT_AUTHORIZED`

## Pins
| Item | Ref |
| --- | --- |
| Handoff | `origin/cto/devproxy-p0-disposable-bypass-red-20261102@0d6cdf2726da386e6df9d9c8d7fa1f264d596b63:docs/handoffs/DEVPROXY_P0_DISPOSABLE_BYPASS_RED_CORRECTION.md` |
| Prior Engineer tip (PR #39) | `240f692b4174c8d84541b4c068dd811016730242` |
| This correction tip | draft PR #39 head (see push) |

## Scope vs `240f692…` only
Removed env-only disposable authorization from `runPremutationGuard`. Integrated CTO RED test. Corrected prior guard tests that expected `DISPOSABLE_STACK_ALLOWED`. Wired RED suite into `test:unit`. Updated CLI messaging. No live restore.

## Proof
- Historical RED: CTO test 5/5 fail against `240f692` (bypass still present).
- GREEN: focused 19/19; `bash -n smart-build.sh`; `./smart-build.sh test:unit` exit 0.
- Probe: disposable envs + `liveContainersPresent:false` never yield `mutationAllowed:true`.
- Live: `./smart-build.sh restart` still exits 2; container IDs unchanged.

## Explicit non-claims
Does **not** protect installed owner checkout against direct `docker compose`, OS reboot, or currently exposed drifted live service. PLAN_ONLY restoration boundary preserved.
