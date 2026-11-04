# RETURNED: P0 v11 nonlive host mount attestation composed

**Label:** `NONLIVE_HOST_MOUNT_ATTESTATION_COMPOSED` / `NOT_DEPLOYED`  
**Handoff:** `origin/cto/devproxy-p0-v11-host-mount-locked-docker-20261103@3a172f51f5f050173cfcb3e72de92b1b55fa5099:docs/handoffs/DEVPROXY_P0_V11_HOST_MOUNT_TRUST_NONLIVE.md`  
**Base preserved:** PR #71 `c20c1eeb1f2c87297a37e04e0eac46777f8a66a5` + CTO tip `3a172f51f5f050173cfcb3e72de92b1b55fa5099` (CTO modules not reimplemented)

## STARTED → VERIFYING → RETURNED

### Source composition (engineer additive only)

| Path | Role |
| --- | --- |
| `utils/rc1-v11-host-mount-attestation-nonlive.cjs` | Nonlive composition: real CTO `createMountLockedHostDockerDriver` (fake `execFile`) → preserved v10 `createClosureGatedHostDriver` + loaded identity + v8 signed spool/fence mutation; `allowConfigEdit:false`; `ownerAuthorizationEstablished:false` |
| `tests/security/rc1-v11-host-mount-attestation-nonlive.test.cjs` | 11 synthetic regressions (17 synth routes, mount/privilege/pin denials, cancel-after-test, post-reload drift, no private Source leak) |

CTO modules left intact: `rc1-host-mount-locked-docker-driver.cjs`, `host-execfile-adapter.cjs`, v9/v10 closure + identity helpers (+ CTO 36 focused tests). Live API unwired. Every synthetic success path returns **`NOT_RUNTIME_ATTESTED`**.

### Test evidence (Mac Node)

| Suite | Result |
| --- | --- |
| CTO v11 driver + closure-gate integration | **36/36** pass |
| Engineer v10 composition (preserved) | **10/10** pass |
| Engineer v11 composition | **11/11** pass |
| Focused combined (above) | **57/57** pass |
| Full `tests/security/*.test.cjs` (`--test-concurrency=1`, `TMPDIR` realpath) | **339/339** pass (exit 0) |
| `./smart-build.sh test:unit` | exit **0** |

**Mac note:** Fixture roots must use realpath’d tmp (`/var` → `/private/var`) so `realpath(root)===root` identity checks hold. This is an environment path alias issue, not a product change.

### Evidence class

| Class | Status |
| --- | --- |
| Synthetic (this return) | **used** — disposable fixtures, fake execFile, in-process worker |
| Mac read-only Docker inspect | **optional observation only** — Destination/RW/Type/Privileged/Id/Image/Running for existing proxy; **Sources never printed**; **not** claimed as attestation |
| Owner-runtime attestation | **not claimed** (`NOT_RUNTIME_ATTESTED`) |

Live IDs untouched (no exec/reload): proxy `1932725ad746`, API `51bbafd0cf14`, ngrok `178b23cbdb9d`. RO observe: proxy `Privileged=false`; nginx.conf/default.conf/sites-enabled binds `RW=false`; `.artifacts` `RW=true`. No owner route bodies or credentials read. No private expected-mount Source allowlist was available for equality, so this RO pass is **not** `actualHostAttested`.

### Origin five

| Field | Value |
| --- | --- |
| `SOURCE_CURRENT` | **UNKNOWN** ≠ PASS |
| `SINGLE_RUNTIME` | **UNKNOWN** ≠ PASS |
| `NO_SHADOW_APPS` | **UNKNOWN** ≠ PASS |
| `REAL_APP_VERIFIED` | **UNKNOWN** ≠ PASS |
| `OWNER_WORK_PRESERVED` | **UNKNOWN** ≠ PASS |

### Remaining security blockers (explicit NON-GO)

1. **mime.types / image-supplied modules** still outside three-file identity + mount inventory (`effectiveNginxConfigComplete:false`).
2. **v7 fence-clear / v8 outer-settle TOCTOU** still open; no cross-process content lease.
3. Synthetic fake execFile ≠ Mac host Docker attestation. Trusted operator must still supply private full ID, image digest, exact Source allowlist, and a separately authorized host callback.
4. Live API spool unwired; privileged host worker not approved; Origin five unknown; consumed GO not reused; no protected merge/deploy.

### Truth table

| Claim | Status |
| --- | --- |
| Live mutated | **no** |
| v10 / #71 preserved | **yes** |
| CTO modules reimplemented | **no** |
| Production authorized | **no** |
| Runtime attested | **no** (`NOT_RUNTIME_ATTESTED`) |
| Owner UAT | **no** |
