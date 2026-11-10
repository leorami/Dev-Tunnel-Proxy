# DEVPROXY RC2 V117 — offline-app cold-start causal gate — **RETURNED**

**Return label:** `HYPOTHESIS_DISPROVED_OR_UNVERIFIED`  
**Owner action gate:** `NONE`  
**Live redeploy / restart / route rewrite / HMAC / LaunchAgent / master merge:** **NOT AUTHORIZED / NOT EXECUTED**  
**Tracking:** issue [#109](https://github.com/leorami/Dev-Tunnel-Proxy/issues/109) remains OPEN (observation preserved; current-stack app-offline cold-start cause **not** established)

## Lifecycle
`STARTED` (#6677821024) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v117-app-offline-coldstart-isolation-20261106@8244ceaf9d65764a86fc421c0c546f7bc3a8fe6f` |
| Parent V116 RETURNED | `10aef4fdc53593ce84e0ac1cd7645048b0326dc4` (#6677620774) |
| Import | ONLY 7 V117 paths; **no** `generateAppsBundle.js` / entrypoint / compose patch |

## Source review (no production edit)
| Path | Finding |
| --- | --- |
| `utils/generateAppsBundle.js` `hardenLocationFullText()` | Already rewrites many static `proxy_pass http://host:port` → `set $up_…` + `resolver 127.0.0.11` + variable `proxy_pass`; adds `@upstream_unavailable` **503** |
| `scripts/nginx-entrypoint.sh` | On `nginx -t` fail, attempts rename of apps bundle; **must fail closed** on read-only mount — not weakened |
| `config/nginx.production.conf` | Static `upstream` servers for API (`dev-proxy-config-api:3001/3002`) — distinct from app routes |
| Live owner apps bundle (count-only) | **`NO_OBVIOUS_STATIC_DNS_IN_SUPPLIED_TEXT`**: staticDnsReferences **0**, variableProxyReferences **37**, resolvers **38**, 17 apps listed |

## Native / disposable verification
| Gate | Result |
| --- | --- |
| Classifier + generated-bundle fixtures | **12/12** |
| Host `nginx` binary | unavailable → skipped locally |
| Disposable Docker nginx **1.26.3** + Node 22.16 | native integration **3/3 PASS** |
| `./smart-build.sh test:unit` | **exit 0** |

## Isolated Docker (reviewed live proxy image, internal net, no public binds, no owner mounts)
| State | Result |
| --- | --- |
| Variable apps offline (API present) | Proxy **starts**; `/healthz` **ok**; app route **503** |
| App delayed ready → down | App **200** then **503**; health stays **ok**; master stays up |
| Static missing hostname `nginx -t` | **FAIL** + `host not found in upstream` |
| 17 representative route entries | **preserved** in fixture |
| Static API DNS missing at start | On this image/run, proxy still reached running (not used as proof that API static upstream is harmless forever) |

## Read-only Mac correlation (redacted)
| Item | Result |
| --- | --- |
| Proxy / API IDs | unchanged `3506d7fe0b81` / `c2e669397470` |
| `nginx -t` / `-T` now | **OK**; no `host not found in upstream` in `-T` |
| Log scan (2000 lines) | startup `[emerg]` **0**; `host not found in upstream` **0**; request-time name-not-resolved **390**; connect refused **102** |
| Container restartCount | **0** (no recoverable last-failed-startup exit in this lifetime) |
| Worker | still **1** `--serve` (untouched) |

## Verdict
**`HYPOTHESIS_DISPROVED_OR_UNVERIFIED`.** For the **current** RC2 generated app bundle and reviewed proxy image, offline/absent **app** backends do **not** reproduce nginx cold-start failure: they affect request-time status (502/503 / runtime DNS) while health/proxy stay up. A **static** hostname `proxy_pass` still fails `nginx -t` (engine mechanism confirmed), but the live owner bundle has **zero** such static app references after the existing hardener.

**No RED-first source fix applied** — would be speculative. Residual gaps (not this sprint’s fix license): historical reboot-time failure not retained in current container logs; any future static-app config regression; API static-upstream boot ordering remains a separate concern from “apps down.”

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
Evidence-only. Live worker/proxy unchanged. P1 #116 LaunchAgent install still **NOT AUTHORIZED**. Owner UAT remains independent. Issue #109 stays open until a **different**, evidenced live-safe cause (if any) is separately authorized.
