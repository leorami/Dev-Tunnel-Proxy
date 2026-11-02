# DEVPROXY-RC1 P0 `/health.json` confidentiality receipt

Engineer-I execution of [PR #29 comment 6571063160](https://github.com/leorami/Dev-Tunnel-Proxy/pull/29#issuecomment-6571063160) incorporating the CTO existence-guard refinement [6571229031](https://github.com/leorami/Dev-Tunnel-Proxy/pull/29#issuecomment-6571229031).

**NOT_DEPLOYED.** **NO_LIVE_RELOAD.** Staging `127.0.0.1:18090` and private backups preserved. Stop for independent CTO committed-diff review.

## Source identity

| Item | Value |
| --- | --- |
| Start SHA | `85a20e3b3e221601f8f1a2ef6a4df4dcf8e97207` |
| Branch | `cto/devproxy-rc1-health-json-confidentiality-20261102` |
| Resulting SHA | this commit |
| Parent evidence | draft PR #29 owner-decision packet |
| Node | v22.19.0 |
| Worktree | `/private/tmp/devproxy-health-p0` |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |

## Defect

Both `config/default.conf` and `config/default.production.conf` anonymously `alias`ed `/health.json` to `.artifacts/reports/health-latest.json` (detailed `{generatedAt, ngrok, results}`), while `/status.json` required `auth_request`. Public Docker healthchecks therefore bypassed the private report boundary.

## Fix (both nginx modes)

```nginx
location = /health.json {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    if (!-f /usr/share/nginx/html/.artifacts/reports/health-latest.json) {
        return 503 '{"status":"unavailable"}';
    }
    return 200 '{"status":"ok"}';
}
```

- Confidentiality: never serves report bytes on `/health.json`.
- Missing-report semantics preserved: **503** `{"status":"unavailable"}` when the file is absent (Compose `wget` healthcheck still fails closed).
- Present report: **200** `{"status":"ok"}` (healthcheck succeeds).
- `/status.json` unchanged: `auth_request` + alias to detailed `health-latest.json`.

## RED → GREEN

| Tree | Result |
| --- | --- |
| Parent `85a20e3…` configs + new contract test | **0 pass / 2 fail**, exit 1 |
| Patched both modes | **2 pass / 0 fail**, exit 0 |
| `./smart-build.sh test:unit` | exit **0** (includes Public `/health.json` confidentiality 2/2) |

## Disposable nginx / Brotli

| Proof | Result |
| --- | --- |
| `nginx:1.26.3-alpine` + extracted location includes | health present **200** `{"status":"ok"}` (no secret markers); absent **503** `unavailable`; anon `/status.json` **401** |
| Auth stub **200** + same includes | health still minimal **200**; `/status.json` returns detailed fixture including secret marker |
| `devproxy-rc1-nginx:disposable` (Brotli modules present) | same 200/503/401 behavior; brotli filter/static `.so` listed |

No public tunnel probe. No live proxy restart.

## Signed-in status-page regression

Existing loopback staging left running (not restarted onto this nginx patch):

- Headless login → authenticated → `/status` UI shows Status Overview / configured-apps chrome.
- Screenshot: `docs/receipts/health-p0-browser/signed-in-status.png`
- Staging has no mounted `health-latest.json` (authenticated `/status.json` **404** there); detailed authenticated JSON proven only in disposable nginx above.

## Changed files

- `config/default.conf`
- `config/default.production.conf`
- `tests/security/health-json-confidentiality.test.mjs`
- `smart-build.sh` (unit hook)
- `docs/receipts/DEVPROXY_RC1_HEALTH_JSON_CONFIDENTIALITY_ENGINEER_COMPLETION.md`
- `docs/receipts/health-p0-browser/signed-in-status.png`

## Preservation

| Check | Evidence |
| --- | --- |
| Staging `18090` | HTTP 200 login page; containers left up |
| Live proxy `:8080` | still `sha256:bfc92bd8…fac41634` |
| Private rollbacks | `0700` tree untouched |

## Gates / authority

Source P0 fix only. Does **not** grant merge, live reload, public ingress cutover, owner UAT acceptance, or deployment. Owner UAT/GO remain separate.
