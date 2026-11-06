# DEVPROXY RC2 V110 — key-loss / NEW HMAC epoch durable recovery — **RETURNED**

**Return label:** `OWNER_APPROVED_NEW_HMAC_EPOCH`  
**Owner action gate (NEW HMAC):** `GRANTED / EXECUTED` (PR #79 **6674322106**)  
**Prior grants used:** durable recovery **6673992882**; HTTPS/privacy **6672650274**  
**Not:** authentic original-key restore · old settlement/heal replay · ngrok domain/credential change · master/dirty rewrite · docker.sock · P2 #109 debug

## Lifecycle
`STARTED` (#6674333983) → `IMPLEMENTING` (#6674374075) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v110-key-loss-recovery-20261106@ed938c0e2294d7dd983ec2bd8d8aa51e38f670a5` |
| Parent V108 RETURNED | `de001e1d4f665f1bdc41241db826cb5010c55a54` (#6674108648) |
| Import | **only** 4 V110 additive paths (continuity util + 11 tests + architecture + handoff); **smart-build unchanged** |
| Epoch | deliberate **REKEY** — `notAuthenticOriginalKey: true` |

## Source change
- `utils/rc2-recovered-activation-secret-continuity.cjs` (read-only copy compare; never claims provenance/deploy)
- `tests/security/rc2-recovered-activation-secret-continuity.test.cjs` (11)
- `docs/architecture/DEVPROXY_RC2_V110_MISSING_ORIGINAL_HMAC_DECISION.md`
- `docs/handoffs/DEVPROXY_RC2_V110_KEY_LOSS_RECOVERY_CONDITIONAL.md`

## Native verification
| Gate | Result |
| --- | --- |
| V110 continuity | **11/11** |
| `./smart-build.sh test:unit` | **exit 0** (V108 durable hook still present; no V110 smart-build alter) |
| Provision script review | `rc2-provision-private-host-worker.cjs` CSPRNG = initial/rekey only; **not** used as “original restore” |

## Live AFTER (redacted)
| Item | Result |
| --- | --- |
| API | new ID `c2e669397470…`; `504:20`; read-only; no docker.sock; `restart=unless-stopped`; spool child API-owned; **durable product bind** (not `/private/tmp`) |
| Proxy | new ID `3506d7fe0b81…`; `restart=unless-stopped`; durable nginx/default/entrypoint binds (**zero** ephemeral `/private/tmp` binds) |
| Ngrok | same container `178b23cb…` **started** same-config; domain/credentials unchanged |
| Worker | supervised `--serve` running; exclusive singleton lock; pin tied to **new** proxy ID/image/mounts |
| Rollback | old `dev-proxy-v108-rollback` + `dev-proxy-config-api-v108-rollback` retained stopped; images preserved |
| Trusted origins | loopbacks + exact approved HTTPS origin (**3**); no wildcard |
| Public `ai/health` | **200**; five minimized fields; `Cache-Control: no-store` / `Pragma: no-cache` |
| Login CSRF | localhost neg-password **401**; foreign Origin **403**; approved HTTPS Origin neg-password **401** (was 403 pre-fix) |
| Signed-in Ask | **200** `local_documentation` (`query`); `usedAI=false` |
| Routes | **17** apps listed in `apps.generated.conf` |
| Continuity claim | **none** for old HMAC; old settlements/heal tickets **invalidated**; quarantine marker written privately |

## Origin-five (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** (one proxy/API/ngrok/worker set) |
| `noShadowApps` | **PASS** (rollback containers stopped, not serving) |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** (control/auth verified; per-app backends may be down — P2 #109 deferred) |

## RETURNED
**`OWNER_APPROVED_NEW_HMAC_EPOCH`.** Durable RC2 services recovered under NEW signing epoch; HTTPS/privacy correction applied; supervised worker rebound. CTO: review before owner UAT. Not merge/deploy permission.
