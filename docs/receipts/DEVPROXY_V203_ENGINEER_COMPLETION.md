# V203 engineer completion — supported Node candidate, owner runtime not switched

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/268#issuecomment-7150859629
CTO pin: `origin/cto/devproxy-v203-supported-node-runtime-20261124@6c56419c033855944cf402d199ecdf85bae1577d`
No protected merge, production deploy, Compose launch, or owner-stack image change.

## Inventory

| Surface | Classification | Evidence |
| --- | --- | --- |
| GitHub default `main` | authoritative published branch | `590bcf2a980b434f533ddacac43a24a777a933e7` |
| Stale `master` | not the default branch | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Dirty local checkout | not used | `master@150d0e792bfca886a1509d07618aa2c5eedd5500`, ahead 210 / behind 192 of `origin/master`, uncommitted dashboard/status/compose edits |
| Ordinary candidate | supported source, not loaded | this engineer branch on the frozen V203 pin |
| `dev-proxy-config-api` | historical loaded runtime, blocked for silent upgrade | image `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`, tag `node:18-alpine`, process Node v18.20.8, npm 10.8.2. Read-only product mount `/Users/leorami/Library/Application Support/devproxy-rc2-durable/stage/product`. Same process starts `utils/notificationsAPI.js` and `utils/proxyConfigAPI.js`. |
| `dev-proxy` | running nginx, not a Node runtime | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` (`rc1cutoverdisp-proxy:latest`) |
| `devproxy-calliope-hosted-1` | separate supported Node 22 container, not the Dev Proxy API | `node:22-alpine` `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`, Node v22.23.2, read-only mount `/Users/leorami/Development/calliope` |
| Dashboard container | not running | no dashboard container |
| Host shell Node | blocked as an ordinary runtime | `/opt/homebrew/bin/node` v25.9.0. That current line is not an LTS and was not used for the proof. |
| Developer Node used for this proof | supported patch | nvm `v24.22.3` / npm 11.19.1. Alias file remains `lts/*`. Homebrew Node was not replaced. |
| Official `node:24-alpine` | supported container candidate | Node v24.22.3, npm 11.19.1, `linux/arm64`, `sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5` |
| Current security patches from nodejs.org index | reference only | 22.23.5, 24.22.3, 26.13.1. Node 26 was not qualified for ordinary Dev Proxy use. |
| Historical recovery binding | historical-only | `utils/recovery-image-binding.cjs` still records `node:18-alpine` / `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`. Receipts, RC1 handoffs, and `docs/archive/SECURITY.md` were not rewritten. `test/CALLIOPE_FIX_SUMMARY.md` remains a past note. |

Loaded `utils/proxyConfigAPI.js` sha256 `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3` (154706 bytes) does not match this candidate `eb212da9fd5878e07130177170a0b149a947b194337504b3e7231392d43f93c6` (153484 bytes). The old Node 18 process is not this branch.

## Source completed

Ordinary launchers and templates that still named Node 18 or 20 now name `node:24-alpine`: the visual-test script, its manual steps, the Next overlay and README, the integration-guide installer example, the architecture service labels, and the current Trivy example. Active setup-node jobs take `check-latest`. Jobs that were pinned to 24.18.1 now use `24.x`. Node 22 jobs stay on 22 with `check-latest`. The libsignal 0.106.0 historical install pins in the V192 and V194 workflows were not changed. The management-perimeter test now requires the `^~` prefixes already present in both Nginx configs, so the stronger locations satisfy the auth assertion.

## Proof

- Node v24.22.3 and `node:24-alpine`: `node --test tests/security/v203-supported-node-runtime.test.cjs tests/security/recovery-image-tag-binding.test.mjs` — 8 pass, 0 fail, 0 skip, on both the Mac binary and the Alpine image.
- `bash -n smart-build.sh`, `node --check utils/calliopeHealing.js`, `node --check utils/proxyConfigAPI.js`.
- `npm ci --no-audit --no-fund` on v24.22.3 added 111 packages. Puppeteer's postinstall stayed unapproved by the npm script policy. `npm --workspace site-auditor-debug run build` (`tsc`) exited 0. UI workspace is Playwright and was not launched against the owner app.
- `./smart-build.sh test:unit` on v24.22.3 exited 0. A disposable worktree `.env` created by the doc test was removed. The owner checkout `.env` was not that file.
- Official `@signalapp/libsignal-client@0.108.7` (`AGPL-3.0-only`) matched GitHub `v0.108.7`. Installed only under `/private/tmp/devproxy-v203-libsignal`. The existing latest-compat test list: 37 pass, 0 fail, 0 skip. No live Signal enrollment.

## Activation blocker

The canonical owner API is the RC2 durable stage on the historical image above, with a read-only product tree that is not this source, plus writable mounts from the dirty Dev Proxy checkout (`apps`, `overrides`, `.artifacts`, `build/sites-enabled`) and read-only `.env`. Nginx also mounts that checkout's `status` and `dashboard/public`. Source and runtime do not map, so the upgrade is fail-closed. Rollback preimage is the three running image IDs above; they were still running at the end. Production was not touched.

No UI change, no new screenshot, and no owner UAT. Private Room pixel HOLD remains.

## Other projects and Origin

Trajectory #90 last RETURNED/STOPPED #7148146903 at `2ab81a97eda3f64b1e439e20b4c4c275812361d9`. Later #7150501054 is CTO READY, not an Engineer STARTED. Logan #233 last RETURNED/STOPPED #7148879966 at `a7d85b9b8f3b2744e01bc505c068b6e7d319e50a`. Neither tree was edited. Origin `leorami/project-template@3e7a87624faf4be7503a2829e24d5bdf493762f3`. `governance/consumers.json` still omits `leorami/Dev-Tunnel-Proxy`. Registration request remains #29/7147271428. Issue #155 is an unpublished floor proposal. No new poller. Specialists: `NOT_SPAWNED`.
