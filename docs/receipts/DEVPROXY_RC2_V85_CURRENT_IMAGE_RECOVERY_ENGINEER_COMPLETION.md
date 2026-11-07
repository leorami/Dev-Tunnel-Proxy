# DEVPROXY RC2 V85 current-image private recovery + parity — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** live proxy/API cutover · ngrok/bridge change · credential rotation · protected master merge · insecure rollback · fabricated Origin PASS · owner UAT

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start (exact) | PR #79 @ `ad96dc666f9651a5660fce55690ccc3d0264c760` |
| Handoff (executed) | `cto/devproxy-rc2-v85-current-private-recovery-20261104@12bfb7c7ed9e5c6c6e0f8eabce9bcb442e569085` |
| Parent v84 receipt | `docs/receipts/DEVPROXY_RC2_V84_RELEASE_CLOSEOUT_ENGINEER_COMPLETION.md` / comment `6641136083` |
| Parallel CTO draft (deferred) | PR #83 @ `43a9d2c…`; PR #84 is this v85 source draft |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | `05439830ec5a1d5c60c7e56887bc8ea6350c6cee`* |

## STARTED
Sole primary: `engineer/devproxy-rc2-controlled-release-20261104` at `ad96dc6…`. Imported only the eight CTO v85 files from `12bfb7c…` (merge `c3533a7…`). Did not check out older CTO ancestry over primary. No newer STARTED primary on GitHub. Live identities unchanged throughout.

## IMPLEMENTING

### 0) Focused source verification
- CTO RED-first suites + new AI scope suite: **28/28** PASS (`rc2-current-image-export`, `rc2-readonly-image-evidence`, `rc2-readonly-config-evidence`, `rc2-ai-heal-degraded-scope`).
- Mac engineer fix (required for real export on Darwin): `utils/rc2-pinned-current-image-export.cjs` — private stage accepts `/var`→`/private/var` inode-identical realpath; `spawnSync` uses `encoding:'utf8'` (Buffer adapters still accepted).
- `./smart-build.sh test:unit` previously green on this tip (log `/private/tmp/rc2-v85-unit.log`).

### 1) Live BEFORE (read-only)
| Item | Value |
| --- | --- |
| proxy container | `1932725ad746…` healthy |
| proxy image | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` |
| API container | `51bbafd0cf14…` (root `node:18-alpine`) |
| API image | `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` |
| Docker daemon ID | pinned in private export manifest (redacted) |
| Owner routes | **17** `apps/*.conf` (backups excluded) |

### 2) Current private image export (owner-authorized protective backup)
New 0700 stage under existing `private-rollbacks/` parent (path redacted; pointer only in local `/private/tmp/devproxy-rc2-v85-stage-path.txt`).

| Step | Result |
| --- | --- |
| Pin `rc2-current-images.private.json` | protocol `DEVPROXY_RC2_PRIVATE_IMAGE_EXPORT_V1`; roles proxy+API with exact full container/image IDs; `ownerExportAuthorized=true`; mode 0600 |
| CLI once | `node scripts/rc2-export-private-images.cjs --execute --owner-approved <PRIVATE_STAGE>` |
| Export code | `RC2_PRIVATE_IMAGE_EXPORT_CREATED_RESTORE_NOT_VERIFIED` |
| `SHA256SUMS.private` | **OK** (`rollback-images.tar` ~65 MB) |
| Host daemon | **no** load / tag / prune / restart / container change |

### 3) Independent read-only archive inspect
| Artifact | Result |
| --- | --- |
| Image archive | `RC2_IMAGE_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED` |
| Config archive `config-C03xWb` | formal `RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED` (`sourceDirty:true` in private manifest) — **not** forced green |

### 4) Disposable dind restore of **exact current** images
Isolated `docker:27-dind` only; host daemon untouched; dind removed after.

| Live digest (index) | Loaded config digest after `docker load` | Tag inspect |
| --- | --- | --- |
| proxy `sha256:9b2ae98f…` (OCI index) | `sha256:3e061cd12ba7469af952168c01103f6573fa933fe9e36e6d6b9e20e4063f4ed1` | `PROXY_TAG` same |
| API `sha256:8d6421d6…` (OCI index) | `sha256:c5914b9dd279c0f596933e65906cb3c6d2da5aae71e863e819e9b963997b1c17` | `API_TAG` same |

Index→config map proved (`maps_to_loaded True`). **Current proxy is now restorable from the private archive without downgrading to historical `bfc92…`.** Old root API image remains forensic BEFORE-state only, not a secure post-RC2 rollback target.

### 5) Disposable config extraction (route/session/env)
Extract of existing `config-state.tar` to disposable `/private/tmp/devproxy-rc2-v85-config-extract` (not live):

| Check | Result |
| --- | --- |
| `apps/*.conf` excluding backups | **17** |
| vs live Development `apps/*.conf` | **names_equal True** |
| `.env` / admin session present | **yes** |
| Formal source-manifest PASS | **BLOCKED** (`sourceDirty`) — recorded honestly |

### 6) Secure NONROOT fallback
Preserved v83 disposable evidence (API-owned spool under 01770 parent, HMAC PREPARED/ACK/FINAL, MIME/Brotli) — **not redone**. Archival integrity alone is still not a live rollback install. Live host worker remains unstaged (correct until cutover).

### 7) AI heal / scan parity — corrective source
No docker.sock, root API, or unsafe self-heal reintroduced.

| Deliverable | Path |
| --- | --- |
| Inventory module | `utils/rc2-ai-heal-degraded-scope.cjs` → `OWNER_SCOPE_DECISION_REQUIRED` |
| RED-first tests | `tests/security/rc2-ai-heal-degraded-scope.test.cjs` |
| Decision-ready owner request | `docs/receipts/DEVPROXY_RC2_V85_AI_HEAL_OWNER_SCOPE_CHANGE_REQUEST.md` |

`safeReplacementStatus=NOT_IMPLEMENTED`. Owner must pick: accept degraded scope, defer cutover for host-mediated heal, or reject. Until that decision, functional parity gate is **not** GREEN.

## VERIFYING
| Gate | Result |
| --- | --- |
| Exact current proxy+API private export + checksum | **PASS** |
| Disposable dind restore + index→config tag of live digests | **PASS** |
| Config extract 17-route name parity | **PASS** (extract evidence) |
| Formal config source-manifest integrity | **BLOCKED** (`sourceDirty`) |
| AI heal transactional parity or accepted scope | **OPEN** — scope-change request filed; not accepted |
| Origin five pre-cutover | still **UNKNOWN ≠ PASS** (unchanged) |
| Live cutover / JIT production pin / AFTER | **withheld** |

Live AFTER cutover identities: **unchanged** (proxy `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`).

## Exact NO-GO (pre-cutover)
1. **`AI_HEAL_OWNER_SCOPE_UNDECIDED`** — decision-ready request landed; no owner acceptance; no safe transactional AI-heal equivalents implemented.
2. **`CONFIG_SOURCE_MANIFEST_BLOCKED`** — private config formal inspect remains BLOCKED (`sourceDirty`); extract evidence is not a substitute PASS.
3. **`ORIGIN_FIVE_UNKNOWN`** — five Origin runtime fields still UNKNOWN ≠ PASS.
4. **`LIVE_HOST_WORKER_NOT_STAGED_FOR_PRODUCTION`** / **`LIVE_AFTER_PREFLIGHT_NOT_RUN`** — correctly withheld; standing owner GO unused.

### Cleared vs V84
- **`SECURE_RECOVERY_CURRENT_PROXY_NOT_ARCHIVED`** — **cleared** by v85 current-image export + disposable restore of `9b2ae98f…`→`3e061cd1…`.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

**Specialists:** none. **Ngrok/bridge/credentials/master:** untouched. **PR #83 / #84:** not merged into production; v85 CTO bytes integrated on Engineer primary only. **Cutover:** not exercised.
