# DEVPROXY RC2 V106 — owner-approved API-only correction — **RETURNED**

**Return label:** `API_ONLY_UPSTREAM_DNS_RECOVERY_NOT_PROVEN`  
**Owner action gate:** `GRANTED / BLOCKED`  
**Live apply:** **not** performed  
**Not:** API recreate · proxy reload/restart/recreate · worker rekey · ngrok/bridge/master/credential change · live `.env` write · false UAT/Origin PASS

## Lifecycle
`STARTED` (#6673622918) → `IMPLEMENTING` → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v106-approved-api-only-live-apply-20261105@790ab6d1124aaac2df57ae6b0c9c3e192f60dd16` |
| Owner grant | PR #79 comment **6672650274** |
| Parent V105 RETURNED | `150d0e792bfca886a1509d07618aa2c5eedd5500` (#6672331087) |
| Import | **only** V106 additive paths (postcheck, 11 tests, smart-build hook, architecture note, handoff, this receipt) |
| Protected master | untouched |

## Source change (imported, not live-applied)
- `utils/rc2-approved-api-only-postcheck.cjs`
- `tests/security/rc2-approved-api-only-postcheck.test.cjs` (11)
- `smart-build.sh` hook for API-only postcheck
- `docs/architecture/DEVPROXY_RC2_V106_APPROVED_API_ONLY_STATIC_UPSTREAM_ROLLBACK.md`
- `docs/handoffs/DEVPROXY_RC2_V106_OWNER_APPROVED_API_ONLY_CORRECTION.md`

## Native verification
| Gate | Result |
| --- | --- |
| V106 postcheck | **11/11** |
| V103 seven focused files | **93/93** |
| V105 four focused files | **53/53** |
| `./smart-build.sh test:unit` | **exit 0** (includes V106 hook) |

## BEFORE live observation (redacted; private backup retained off-GitHub)
| Item | Evidence |
| --- | --- |
| Proxy | `d5b71dc13699…` **Exited(0)**; RestartPolicy=**no**; `:8080` refused |
| API | `b93e19d7ea9d…` **Exited(137)**; user was `504:20`; RestartPolicy=**no** |
| Trusted origins (API env) | **2** entries (loopbacks only; HTTPS origin **not** yet appended) — matches pre-grant residual |
| Ngrok | exited |
| Host worker | **not running**; lease dir missing |
| Private cutover stage | `/private/tmp/devproxy-rc2-live-cutover-A` **missing** (activation.secret + host-share binds broken) |
| Proxy overlay binds | `/private/tmp/devproxy-p0-origin-exact-overlay…` and `…/devproxy-p0-restore-disp-product…` **missing** |
| Route data | `apps.generated.conf` still lists **17** apps on owner Development mount |
| Compose working_dir label | still points at deleted cutover stage |
| Actions taken on live | **none** (no start/stop/recreate/reload/env write) |

## Isolated Mac Docker static-upstream DNS proof
Disposable network (not live `devproxy`). Static `upstream { server dev-proxy-config-api:80; }` (mirrors production pattern).

| Case | Result |
| --- | --- |
| Baseline through proxy | HTTP **200** |
| API recreate with **changed IP**, no proxy reload | HTTP **502** |
| API rollback to **same prior IP**, no proxy reload | HTTP **200** |
| Unapproved `nginx -s reload` control after changed IP | HTTP **200** (proves reload would fix; **not** authorized for live) |

**Conclusion:** `API_ONLY_UPSTREAM_DNS_RECOVERY_NOT_PROVEN` for the authorized API-only recreate path when Docker assigns a new IP. Same-IP-only recovery is insufficient to guarantee live safety; live IPs omitted from GitHub.

## Why live API-only apply stopped
1. Hard gate failed: changed-IP recovery without proxy reload/restart is **not** proven.
2. Live stack already down; private HMAC stage + proxy nginx overlay bind sources are gone — cannot safely recreate API while preserving spool/HMAC/identity under the current grant.
3. Grant forbids proxy restart/reload/recreation as part of this correction.

## Exact new owner decision needed (singular)
Authorize a **scoped production-recovery + V106 retry** that explicitly covers:

1. **Restore private cutover stage** (activation.secret, host-share/spool, worker.pin, compose working dir) from owner-held material — or a bounded re-provision that preserves HMAC continuity; and restore missing proxy overlay bind sources (or re-pin equivalent reviewed nginx/entrypoint bytes to durable paths).
2. **Start existing same IDs** `d5b71dc13699` (proxy) and then `b93e19d7ea9d` (API) **or** an explicitly approved recreate pair — stating whether same-ID start is allowed when binds are restored.
3. **V106 API-only retry condition:** either  
   - (A) approve a **same-IP API replacement** technique that keeps nginx’s cached upstream address valid **without** proxy reload, with measured proof on the restored live pair; or  
   - (B) approve a **proxy reload or recreate** (new scoped grant) so static upstream DNS can be refreshed after API recreate; then append exact approved HTTPS origin + load V103 privacy envelope as originally granted in **6672650274**.

Do **not** treat this receipt as merge/deploy permission. No second Owner-A cutover prompt beyond the above scoped recovery decision.

## Origin-five (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **FAIL** (proxy/API/ngrok/worker down; no healthy single runtime) |
| `noShadowApps` | **PASS** (no alternate live proxy started by this assignment) |
| `ownerWorkPreserved` | **PASS** (owner Development mounts untouched; no credential/master mutation) |
| `sourceCurrent` | **PASS** (V106 additive source imported on engineer tip; live not applied) |
| `realAppVerified` | **PARTIAL** / unavailable through proxy (stack down) |

## RETURNED
**`API_ONLY_UPSTREAM_DNS_RECOVERY_NOT_PROVEN`.** Owner gate **`GRANTED / BLOCKED`**. Native source GREEN. Live API-only correction **not executed**. Production remains stopped as found; engineer made no live mutations. Awaiting the exact new scoped owner decision above before any further live touch.
