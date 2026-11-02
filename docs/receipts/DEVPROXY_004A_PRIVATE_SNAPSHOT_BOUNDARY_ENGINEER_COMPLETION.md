# DEVPROXY-004A — Engineer completion receipt (source/test only)

**Status:** RETURNED — integrated, RED-first proven, GREEN on Node 22 + canonical `test:unit`.  
**Not deployed. Not merged to protected master. Live production containers untouched.**

## Pins

| Item | SHA / ref |
| --- | --- |
| Handoff contract | `origin/cto/devproxy-004a-private-snapshot-boundary-20261101@4cc0017d1723a5d845cbfadd9614543a9a21ee77:docs/architecture/DEVPROXY_004A_PRIVATE_CODE_SNAPSHOT_BOUNDARY.md` |
| Remaining-only scope | Issue #10 comment `6582343966` |
| Accepted product base | `d89c962fb31a962a518f331bae458e63708e7e86` (not master) |
| CTO proposal tip (PR #16) | `4cc0017d1723a5d845cbfadd9614543a9a21ee77` |
| Protected master (unchanged) | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Engineer tip |  |

## Integration scope (exact)

Brought onto product base **only** PR #16’s five paths:

1. `docs/architecture/DEVPROXY_004A_PRIVATE_CODE_SNAPSHOT_BOUNDARY.md`
2. `tests/security/calliope-snapshot-boundary.test.mjs`
3. `utils/calliopeHealing.js`
4. `utils/snapshot-copy.js`
5. `utils/snapshotSecurity.cjs`

Plus the Issue #10-required wire of the focused suite into `./smart-build.sh test:unit` (existing hooks preserved).

**Byte match vs CTO tip:** `snapshotSecurity.cjs`, `snapshot-copy.js`, `calliopeHealing.js`, and the architecture doc match `4cc0017…` exactly.  
**Test harness delta (macOS):** fixture dirs use `fs.realpathSync(os.tmpdir())` so `authorizeHostSnapshot`’s `resolve===realpath` policy is exercised without false RED from macOS `/var`→`/private/var` aliases. Policy itself unchanged.

## RED-first

| Step | Command | Exit | Result |
| --- | --- | --- | --- |
| Historical first RED on product baseline (no impl) | `node22 --test` with only `8baeef0` test file; missing `snapshotSecurity.cjs` | 1 | `# pass 0 # fail 1` (`MODULE_NOT_FOUND`) |
| Evidence | `/private/tmp/devproxy-004a-evidence/red-node22-first-commit.log` | | |

CTO tip itself was never natively GREEN on this Mac without a realpath-stable fixture base (same 2/4 fail under default `os.tmpdir()`).

## GREEN

| Step | Command | Exit | Result |
| --- | --- | --- | --- |
| Node | `/Users/leorami/.nvm/versions/node/v22.19.0/bin/node` → **v22.19.0** | | |
| Focused | `node --test tests/security/calliope-snapshot-boundary.test.mjs` | 0 | 4/4 pass |
| Canonical | `./smart-build.sh test:unit` | 0 | all prior RC1 unit gates + new Calliope snapshot boundary |
| Evidence | `/private/tmp/devproxy-004a-evidence/green-focused-node22.log`, `smart-build-test-unit.log` | | |

## Fixture-only Docker (isolated names, no live services)

```text
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v <fixture-src>:/src:ro -v <fixture-out>:/out -v utils/snapshot-copy.js:/copier.js:ro \
  node:22-alpine node /copier.js /src /out
```

- Exit 0; copied `README.md` + `src/app.ts` only; fixture `.env` absent from output.
- Evidence: `/private/tmp/devproxy-004a-evidence/docker-copier.log`
- No owner/Calliope project paths; disposable tree under `/private/tmp/devproxy-004a-docker-fixture`.

## Production preservation

Pre/post container IDs identical for `dev-proxy`, `dev-proxy-config-api`, `dev-ngrok` (recorded in `/private/tmp/devproxy-004a-live-ids-pre.txt`). No compose recreate, no image retag, no tunnel/credential changes.

## Behavior tradeoff (owner UAT later)

- Host source snapshots: **default deny** until `CALLIOPE_CODE_SNAPSHOT_ENABLED=1` and exact `CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS`.
- New output: `.private/calliope/snapshots` (0700 / 0600); gitignored; not nginx-mounted.
- Container source snapshot: **fail-closed** `CONTAINER_SNAPSHOT_DISABLED` (unsafe `docker exec … tar` removed).
- Copier is **not** a content-level secret scanner; unresolved classification risk remains.
- Broader DEVPROXY-004 (root web API + host Docker socket) is **out of scope** for 004A.

## Rollback

Reset/delete engineer branch; product tip remains `d89c962…`. Live services never switched.

## Independent specialist (read-only)

Coordinated one optional specialist; **no writes** to primary files. Confirmed default-deny, private `.private` output, argv-only host Docker, `CONTAINER_SNAPSHOT_DISABLED`, O_NOFOLLOW/`wx` copier, and that `.private` is not nginx-mounted.

**Residual (not expanded in this remaining-only slice):** copier does not exclude *directories* named `secrets`/`credentials`/`private` (only sensitive *filenames*); Docker run lacks `--pull never` / digest / `--user` / resource caps; content-level secrets in allowed extensions remain possible; broader root+docker.sock privilege elsewhere in `calliopeHealing.js` is DEVPROXY-004, not 004A. Specialist predicted macOS `os.tmpdir()` RED; primary fixed that with realpath-stable fixtures and proved GREEN on Node 22.
