# DEVPROXY RC2 V108 — durable production recovery — **RETURNED**

**Return label:** `UNRECOVERABLE_ORIGINAL_HMAC_MATERIAL`  
**Owner action gate:** `GRANTED / BLOCKED`  
**Live apply:** **not** performed  
**Not:** container recreate/start · secret rotation/fabrication · ngrok change · master/dirty mutation · P2 #109 debug

## Lifecycle
`STARTED` (#6674068959) → `IMPLEMENTING` (#6674072477) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v108-durable-recovery-20261105@8ab5796b779572252c1c5e6a14f69faa557adc83` |
| Owner grant | PR #79 **6673992882** (durable recovery); prior HTTPS/privacy **6672650274** remains deferred until recovery |
| Parent V106 RETURNED | `f3dd8ffc4cafd7023ecc140a6793c1eceb2a6468` (#6673725518) |
| Import | **only** V108 paths (durable mount guard + 9 tests + smart-build hook + handoff + this receipt) |
| Stop cause | Owner-confirmed **laptop reboot** (not Dev Proxy app bug); P2 #109 deferred |

## Source change
- `utils/rc2-live-durable-mount-paths.cjs`
- `tests/security/rc2-live-durable-mount-paths.test.cjs` (9)
- `smart-build.sh` hook
- `docs/handoffs/DEVPROXY_RC2_V108_DURABLE_RECOVERY_PREFLIGHT.md`

## Native verification
| Gate | Result |
| --- | --- |
| V108 durable mount paths | **9/9** |
| V106 postcheck | **11/11** |
| V103 seven files | **93/93** |
| V105 four files | **53/53** |
| `./smart-build.sh test:unit` | **exit 0** |

## Step A inventory (read-only; no live mutation)
| Item | Result |
| --- | --- |
| Proxy | `d5b71dc13699…` Exited(0); image `sha256:9b2ae98f…` **present** |
| API | `b93e19d7ea9d…` Exited(137); `504:20` RO; image `sha256:8d6421d6…` **present** |
| Ngrok | `178b23cb…` Exited(0); config/credentials **not** changed |
| Host worker | not running; lease/pin missing |
| Routes | `apps.generated.conf` still lists **17** apps |
| Ephemeral binds | cutover stage + p0 overlay sources **missing** (expected after reboot/`/private/tmp` loss) |
| Reviewed nginx/default/entrypoint bytes | **recoverable** from pinned engineer/source (`nginx.production.conf` / `default.production.conf` / `scripts/nginx-entrypoint.sh`); container bind targets empty/missing |
| HMAC `activation.secret` | **NO authentic 32-byte source found** (only empty 0-byte Development stub) |
| `worker.pin.json` / host-share spool | **missing**; no authentic backup located |
| Path review module | durable non-tmp manifest → `DURABLE_MOUNTS_SOURCE_REVIEW_ONLY`; legacy tmp manifest → `EPHEMERAL_LIVE_BIND_SOURCE`; **native disk attestation not performed** (blocked on secret) |

## Hard stop (handoff §Critical risk 1)
Essential cryptographic material has **no authentic source**. Grant forbids quiet rotation/fabrication. Stopped **before** durable stage create, service recreate, ngrok restart, worker re-pin, or HTTPS/privacy apply.

## Exact new owner decision needed (singular)
Provide **one** of:

1. **Restore authentic original** Owner-A HMAC secret bytes (and preferably pin/spool continuity artifacts) from owner-held backup into a durable non-`/tmp` stage the engineer will then bind/recreate under grant **6673992882**; or  
2. **Authorize explicit HMAC re-provision / key rotation** as a **new** scoped grant (not implied by 6673992882), accepting loss of prior settlement continuity, after which durable recovery + HTTPS/privacy (**6672650274**) may resume.

Nginx/entrypoint durable remount and image rollback material are otherwise ready; they must not proceed without authentic HMAC continuity decision.

## Origin-five (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **FAIL** (stack still down; reboot aftermath) |
| `noShadowApps` | **PASS** (no shadow stack started) |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** (V108 additive import) |
| `realAppVerified` | **PARTIAL** / unavailable |

## RETURNED
**`UNRECOVERABLE_ORIGINAL_HMAC_MATERIAL`.** Owner gate **`GRANTED / BLOCKED`**. Native source GREEN. No live mutations. Await authentic secret restore or explicit rotation grant.
