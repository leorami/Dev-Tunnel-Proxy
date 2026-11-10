# DEVPROXY RC2 Owner-A controlled cutover — **DEPLOYED** (bounded)

**Return label:** `DEPLOYED_OWNER_A_TWO_SERVICE`  
**Scope:** proxy + proxy-config-api only · local-docs Ask + ticketed `/_next/` heal surface  
**Disabled:** external-model chat · embeddings/reindex · docker.sock / inline-Docker auto-heal  
**Not:** master merge · ngrok config change · bridge change · credential rotation · git clean

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer tip | `cf510f922432ebff60a2314bcbe777423bebc3c7` |
| Owner decision | **A** (direct + PR comment `6669428522`) |
| STARTED cutover | `6669452851` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |

## BEFORE → AFTER

| Item | BEFORE | AFTER |
| --- | --- | --- |
| Proxy ID | `1932725ad746…` | `d5b71dc13699…` |
| Proxy image | `sha256:9b2ae98f…` | `sha256:9b2ae98f…` (same digest) |
| API ID | `51bbafd0cf14…` | `b93e19d7ea9d…` (recreate after trusted-origins) |
| API image | `sha256:8d6421d6…` | `sha256:8d6421d6…` |
| API user | `root` | **`504:20`** |
| API read-only rootfs | no | **true** |
| Health | 200 | **200** |
| `ai/health` mode | (legacy/unavailable) | **`local_documentation`** |
| Signed-in Ask | — | **200** `local_reviewed_heal_explain` |
| Apps conf | 17 | **17** |
| Ngrok container | `178b23cbdb9d…` Exited(255) ~22h | same ID **restarted** (no config/cred change) |

## IMPLEMENTING notes
1. Rendered production two-service candidate (loopback ports, no docker.sock, deny inline Docker, HMAC spool parent).
2. Source = engineer tip (Ask/heal code); routes/env/artifacts/certs/status/dashboard = owner Development tree; nginx overlay configs preserved.
3. Proxy first-start race: nginx required `dev-proxy-config-api` DNS before API joined — restarted proxy after API up; `nginx -t` ok.
4. Appended missing `DEVPROXY_TRUSTED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080` to owner `.env` so CSRF cookie login works (was empty → Origin denied).
5. Did **not** `--remove-orphans`; did **not** mutate ngrok static domain/auth; dirty tracked files otherwise untouched.

## Origin-five AFTER (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PARTIAL** (engineer tip mounted; not claiming formal clean Git) |
| `realAppVerified` | **PARTIAL** (17 conf + generated locations; not full browser UAT matrix) |

## Residuals (not silent GO for heal apply)
1. **Live Mac host worker pin/serve not installed** against the new proxy ID — ticketed heal **propose/UI** path exists; HMAC apply settlement needs operator host-worker pin for `d5b71dc13699…`.
2. Proxy has `RestartPolicy=no`; cold reboot ordering may need “start API then proxy” until depends/healthgate improved.
3. Owner UAT still required for browser dashboard confirmation.

## RETURNED
**`DEPLOYED_OWNER_A_TWO_SERVICE`.** External AI/docker.sock heal remain disabled by policy. Specialists: none.
