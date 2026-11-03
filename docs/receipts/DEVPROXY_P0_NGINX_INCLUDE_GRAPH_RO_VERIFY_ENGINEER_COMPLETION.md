# RETURNED: P0 nginx include-graph read-only verify

**Label:** `NGINX_INCLUDE_GRAPH_SIGNATURE_GAP_CONFIRMED` / `NOT_DEPLOYED`  
**Base tip (preserved v8):** `5e07f72097069efcc332f927003f56f6d2284753` (PR #67)  
**Scope:** read-only verification of the existing nginx configuration include graph against the v6/v8 three-file configuration signature. No live remount, no worker install, no config edit, no deploy, no v9 integration.

## STARTED → VERIFYING → RETURNED

### Three-file signature (source at pinned SHA)

`utils/rc1-route-candidate-manifest.cjs` `CANDIDATE_PATHS` / `DEVPROXY_CONFIG_SET_V2`:

1. `build/sites-enabled/apps.generated.conf`
2. `config/default.production.conf`
3. `config/nginx.production.conf`

### Include graph (path directives only)

From live bind-identical release configs and in-container nginx:

| File | Include directive |
| --- | --- |
| `/etc/nginx/nginx.conf` (← `nginx.production.conf`) | `include /etc/nginx/conf.d/*.conf;` |
| `/etc/nginx/conf.d/default.conf` (← `default.production.conf`) | `include /etc/nginx/conf.d/sites-enabled/*.conf;` |
| `/etc/nginx/conf.d/sites-enabled/apps.generated.conf` | no nested `include` lines observed |

Nginx `*.conf` globs are non-recursive: the `sites-enabled` directory entry under `conf.d/` is not itself matched by `conf.d/*.conf`; it is loaded only via the explicit sites-enabled include inside `default.conf`.

### Live inventory (filenames / hashes / mount identity only)

| Container | Short ID | Role |
| --- | --- | --- |
| `dev-proxy` | `1932725ad746` | proxy |
| `dev-proxy-config-api` | `51bbafd0cf14` | API |
| `dev-ngrok` | `178b23cbdb9d` | ngrok |

Proxy mounts (from `docker inspect` + `/proc/self/mountinfo`; all three config binds **ro**):

| Destination | Host source (path retained for operator continuity) | Mount |
| --- | --- | --- |
| `/etc/nginx/nginx.conf` | `…/release-config/nginx.production.conf` | `ro` virtiofs |
| `/etc/nginx/conf.d/default.conf` | `…/release-config/default.production.conf` | `ro` virtiofs |
| `/etc/nginx/conf.d/sites-enabled` | owner `build/sites-enabled` directory bind | `ro` virtiofs |

Observed names under globs **right now**:

- `/etc/nginx/conf.d/*.conf` → only `default.conf`
- `/etc/nginx/conf.d/sites-enabled/*.conf` → only `apps.generated.conf`

Content SHA-256 (container == host bind source):

| Path | sha256 | bytes |
| --- | --- | --- |
| `/etc/nginx/nginx.conf` | `a868c0313cee2c522e663184b55def512d2c2cd06210773aed9ef58373c0aa97` | 4170 |
| `/etc/nginx/conf.d/default.conf` | `0c9bd6e23f603d13c0afeded627b9ac135574c8826adc55fe9b6eed3e3adc408` | 18996 |
| `/etc/nginx/conf.d/sites-enabled/apps.generated.conf` | `d1e36aaf689313a774e6a2b5821573afeac49509fb04ac00eadaf57150604fb7` | 31839 |

`/etc/nginx/conf.d` parent directory is **not** a directory bind; it is container rootfs. Mode-bit `test -w` is inconclusive; mountinfo is authoritative for the three signed binds (`ro`).

### Finding

**Yes — additional `.conf` files can be loaded without changing the three-file signature.**

1. **`/etc/nginx/conf.d/*.conf`:** any extra `*.conf` beside the bind-mounted `default.conf` (container rootfs write, image layer, or remount) is loaded by `nginx.conf` while `nginx.production.conf` and `default.production.conf` hashes stay unchanged.
2. **`/etc/nginx/conf.d/sites-enabled/*.conf`:** any extra sibling `*.conf` on the host directory bind beside `apps.generated.conf` is loaded by `default.conf` while `apps.generated.conf` content (and therefore `DEVPROXY_CONFIG_SET_V2`) stays unchanged.

Disposable proof (temp tree, not live): after writing `build/sites-enabled/unbound.conf`, `createCandidateManifest` digest remained
`a40d4eb095162152a2f316abd8b7f72703d4350693856b658e49f051edc727cf` (before == after).

No private route bodies or credentials were read or disclosed. Live services were not started, restarted, edited, or deployed. Completed v8 work at `5e07f72…` was not rewritten. CTO branch `cto/devproxy-p0-v9-effective-nginx-include-closure-20261103@a83f12b4…` was **not** treated as an executable integration handoff.

### Test evidence

| Suite | Result |
| --- | --- |
| `tests/security/rc1-route-candidate-manifest.test.cjs` | **12/12** pass |
| Disposable sibling-`unbound.conf` digest invariance | **unchanged digest** (exit 0) |
| `tests/security/rc1-nginx-include-graph-signature-gap.test.cjs` | committed gap regression (see PR) |

### Origin five (canonical app runtime)

| Field | Value |
| --- | --- |
| `SOURCE_CURRENT` | **UNKNOWN** ≠ PASS |
| `SINGLE_RUNTIME` | **UNKNOWN** ≠ PASS |
| `NO_SHADOW_APPS` | **UNKNOWN** ≠ PASS |
| `REAL_APP_VERIFIED` | **UNKNOWN** ≠ PASS |
| `OWNER_WORK_PRESERVED` | **UNKNOWN** ≠ PASS |

This assignment did not perform owner UI / Origin canonical-app attestation.

### Remaining security blockers

1. Three-file HMAC/digest is **not** an effective-config closure over nginx glob includes.
2. No runtime include-inventory / host callback attestation of the loaded `.conf` set.
3. Prior open items remain: post-fence / pre-settle candidate race; Mac shared-bind ACL/UID; live API spool unwired; privileged host worker not approved; Origin five unknown; no fresh owner GO for live remount; no protected merge/deploy.
4. Incomplete CTO v9 include-closure branch is **not** an executable engineer handoff (partial remote tip; remaining artifacts not branch-complete).

### Truth table

| Claim | Status |
| --- | --- |
| Live mutated | **no** |
| v8 tip preserved | **yes** (`5e07f72…`) |
| v9 integrated | **no** |
| Signature covers all glob-loadable `.conf` | **no** (gap confirmed) |
| Currently-present unbound live `.conf` | **none observed** under either glob |
| Deployed / owner UAT | **no** |
