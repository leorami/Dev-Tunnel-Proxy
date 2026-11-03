# RETURNED: P0 v10 nonlive loaded-config identity

**Label:** `NONLIVE_LOADED_CONFIG_IDENTITY_VERIFIED` / `NOT_DEPLOYED`  
**Handoff:** `origin/cto/devproxy-p0-v10-loaded-config-identity-20261103@aa316d3e911efdc0dc629dfdac0c390e0c0d7e80:docs/handoffs/DEVPROXY_P0_V10_NONLIVE_LOADED_CONFIG_IDENTITY.md`  
**Base preserved:** PR #69 `5d09f28371785dfaa840e522f88d3b807598fe4f` + CTO tip `aa316d3e911efdc0dc629dfdac0c390e0c0d7e80` (modules not reimplemented)

## STARTED → VERIFYING → RETURNED

### Source composition (engineer additive only)

| Path | Role |
| --- | --- |
| `utils/rc1-v10-loaded-config-identity-nonlive.cjs` | Nonlive composition: v8 closeout + v9 `createClosureGatedHostDriver` + v10 `createReadOnlyHostViewFromLoadedFiles`; post-mutation mirror limited to `apps.generated.conf` so runtime drift on nginx/default remains visible |
| `tests/security/rc1-v10-loaded-config-identity-nonlive.test.cjs` | 10 synthetic regressions |

CTO modules left intact: `rc1-effective-nginx-config-closure.cjs`, `rc1-closure-gated-host-driver.cjs`, `rc1-loaded-nginx-file-identity.cjs` (+ five CTO suites). Original v6/v8 HMAC/fence code unchanged. Live API unwired; `allowConfigEdit:false`. Every synthetic success path returns **`NOT_RUNTIME_ATTESTED`**.

### Test evidence (Mac Node)

| Suite | Result |
| --- | --- |
| Five CTO v9/v10 regressions | **59/59** pass |
| Engineer v10 composition | **10/10** pass |
| Full `tests/security/*.test.cjs` (`--test-concurrency=1`) | **292/292** pass (exit 0) |
| `./smart-build.sh test:unit` | exit **0** |

**Mac vs CTO note:** CTO reported Linux Node22.16 **129/129** on a focused fixture set. This Mac run of the handoff-required `tests/security/*.test.cjs` glob is **292/292** (prior tip 282 + 10 engineer). No failures observed.

### Evidence class

| Class | Status |
| --- | --- |
| Synthetic (this return) | **used** — disposable fixtures, fake fixed-action callbacks, in-process worker |
| Mac read-only include inventory | **preserved** from PR #69; **not repeated** per handoff |
| Owner-runtime attestation | **not claimed** (`NOT_RUNTIME_ATTESTED`) |

Live IDs untouched: proxy `1932725ad746`, API `51bbafd0cf14`, ngrok `178b23cbdb9d`.

### Origin five

| Field | Value |
| --- | --- |
| `SOURCE_CURRENT` | **UNKNOWN** ≠ PASS |
| `SINGLE_RUNTIME` | **UNKNOWN** ≠ PASS |
| `NO_SHADOW_APPS` | **UNKNOWN** ≠ PASS |
| `REAL_APP_VERIFIED` | **UNKNOWN** ≠ PASS |
| `OWNER_WORK_PRESERVED` | **UNKNOWN** ≠ PASS |

### What trusted operator RO evidence would still need (identified, not collected)

1. Exact loaded nginx file hashes inside the running proxy matching the approved three-file set **and** an enumerated `conf.d` / `sites-enabled` directory listing with no extras.
2. Container image IDs + mount identities (path, ro/rw, source) for nginx.conf, default.conf, sites-enabled, and proof `/etc/nginx/conf.d` cannot accept an unbound sibling.
3. Complete include graph beyond the three files (at least `mime.types` and any image-supplied modules) — helpers explicitly set `effectiveNginxConfigComplete:false`.
4. Separately authorized host-process mediator with content-bound nginx-test/reload — these helpers do **not** authorize that worker.

### Remaining security blockers

1. **Post-fence / outer-settle TOCTOU** still open after v7 fence clear before outer v8/v5 re-hash (no cross-process content lease).
2. No Mac runtime loaded-config attestation; composition is synthetic only.
3. Live API spool unwired; privileged host worker not approved; Mac shared-bind ACL/UID pending.
4. Origin five unknown; consumed GO not reused; no protected merge/deploy.

### Truth table

| Claim | Status |
| --- | --- |
| Live mutated | **no** |
| v8 / #69 preserved | **yes** |
| CTO modules reimplemented | **no** |
| Production authorized | **no** |
| Runtime attested | **no** (`NOT_RUNTIME_ATTESTED`) |
| Owner UAT | **no** |
