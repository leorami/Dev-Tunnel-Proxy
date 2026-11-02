# DevProxy RC1 — P0 public health confidentiality, fail-closed behavior

## CTO source-first handoff

**Pinned parent:** `leorami/Dev-Tunnel-Proxy:cto/devproxy-rc1-owner-decision-evidence-20261102@85a20e3b3e221601f8f1a2ef6a4df4dcf8e97207` (draft PR #29). CTO isolated source branch `cto/devproxy-rc1-health-confidentiality-20261102` (see PR head SHA); do not touch protected `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, any owner-live checkout, or the existing owner UAT staging on loopback `:18090`.

**Confirmed source-level P0:** Both nginx configs previously served the detailed report file `/.artifacts/reports/health-latest.json` anonymously at `/health.json`, while protecting the *same file* behind `/status.json` and blocking `/.artifacts/`. The report producer writes `{generatedAt,ngrok,results}` and may include internal URLs. This is source evidence, **not verified live data disclosure**. Never probe the public tunnel to look for sensitive details.

**CTO completed FIRST (GitHub source changes on this branch):**
- Added `tests/security/public-health-privacy.test.mjs` as an independent RED-first source contract.
- Both `config/default.conf` and `config/default.production.conf`: `/health.json` never serves the report body; it returns `503 {"status":"unavailable"}` if the report file is missing, otherwise `200 {"status":"ok"}`, with `Cache-Control: no-store`. `/status.json` stays behind `auth_request /admin/check`. This preserves the old nginx/Docker report-file-existence check; constant 200 without existence guard was rejected by CTO.
- Added the new source-only test to `./smart-build.sh test:unit`.
- Isolated local Node22.16.0 reconstructed-source fixture test: original source 1 pass / 2 fail; corrected 3/3 pass. Isolated nginx 1.26.3 HTTP fixture: 4/4 pass (missing 503, private report present 200 minimal, removed report reverts to 503, anonymous detailed status 401). **These fixtures are not native Mac or actual production Brotli image proof.** The full project canonical build was NOT run by CTO.
- No host Docker, owner Mac file, public tunnel, credentials, bridge, staging or live port touched by CTO.

## One primary Engineer-I assignment and contract

At dispatch, verify actual primary Cursor agent is idle and all latest Issue #19 and PR #29/30 branch receipts are fresh. GitHub coordination does **not** start Cursor. If another primary is active, stop dispatch; do not issue a duplicate.

**Goal:** verify the committed minimal P0 source correction without feature creep; return one SHA-pinned completion and stop for CTO+owner gates.

1. Re-run the exact new committed source test on parent `85a20e3...` and demonstrate RED (2 failing configs) before validating GREEN on this CTO branch (3/3). Run `./smart-build.sh test:unit` under native Node22; do not run broad network-sensitive `test:all` on the owner.
2. In disposable independent nginx process/container only, prove `GET /health.json` with no underlying report gives 503 minimal JSON; with a synthetic sensitive fixture report gives 200 minimal JSON and no leakage; deleting the report returns 503; authenticated `/status.json` still serves detailed report and unauthenticated access is 401 or protected login redirect. Ensure the same behavior in the **actual production Brotli image** (don't substitute stock nginx and claim production parity). Confirm compose healthcheck remains on `/health.json`.
3. Check the already-running signed-in owner UAT stack `:18090` only if read-only and authorized; do not recreate, stop or alter that stack. Do not expose staging publicly. Preserve the owner-private image/config archives from issues #19/#26 and existing authenticated UI functionality.
4. Inspect Nginx module/format safety for both modes. If a fixture reveals that the report-file check does not work under production nginx permissions or context, fix only that bounded P0 and demonstrate RED/GREEN; do not weaken healthcheck to an unconditional 200 or remove authentication from detailed reports.
5. Record exact parent+result SHA, commits/diff, native test exits, zero leaked synthetic fixture values, any fixture-only claims vs real image, private backup/staging preservation and production `NO_GO` in **one consolidated committed Engineer-I receipt**. Publish a genuine `VERIFYING` and `RETURNED` for the *same* original primary. Stop for CTO actual diff review and owner UAT. No second sprint.

**Authority:** no protected merge, live nginx/Compose/ngrok reload or restart, Mac bridge modification, owner credential use, public probe, rollout, token rotation or private backups re-export. Owner staging UAT, release authority and any separate Mac Bridge pairing remain owner's decisions. The source change is not evidence of deployment.
