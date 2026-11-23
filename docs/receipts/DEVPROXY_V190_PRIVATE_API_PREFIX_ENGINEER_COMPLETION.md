# V190 Engineer completion — private API Nginx `^~` source review (NO LIVE DEPLOY)

**Handoff:** `origin/cto/devproxy-v190-private-api-json-auth-precedence-20261122@1ca51879ffe90c04604e473b931ae3054c9bc637:docs/handoffs/DEVPROXY_V190_PRIVATE_API_PREFIX_SOURCE.md`  
**STARTED:** Issue #228 comment after authentic Cursor launch.  
**Scope:** SOURCE ONLY. No live nginx `-T`/reload, Compose, API/worker/proxy/ngrok, protected-main merge, or owner-host writes.

## Independent source audit

| Check | Result |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| CTO tip audited | `1ca51879ffe90c04604e473b931ae3054c9bc637` |
| Preimage blobs | `default.conf` `03fc40e9…`; `default.production.conf` `d3d64a9c…` (match frozen test) |
| Corrected blobs | `default.conf` `9fea4de4febd079d51e31cb298ab8242454e4b27`; `default.production.conf` `ba7772c19d8834baa92d45d598b0e04159b99dd8` |
| Nginx source delta | **Exactly 16** `location` → `location ^~` lines (8 per file); no other Nginx source bytes |
| Prefixes | `/devproxy/api/settings/auto-scan`, `/promotions`, `/ai/`, `/config/`, `/overrides/`, `/reports/`, `/resolve-conflict`, `/rename-route` |
| Intact per block | `auth_request /admin/check`; `error_page 401 = @login_redirect`; `proxy_pass http…` |
| Preserved | public `=/health.json`, `=/devproxy/api/ai/health`; exact protected `=/status.json`, `=/routes.json`; `/status/assets/`; four UI `^~`; private `^~ /devproxy/api/apps/`; late `~* \.(json)$` |

No additional Nginx location-precedence gap requiring a new RED was established beyond the CTO-frozen suite.

## Tests actually run (Mac worktree)

Commands:

```bash
docker pull nginx:1.26.3-alpine
node --test \
  tests/security/v190-private-api-regex-auth-precedence.test.cjs \
  tests/security/v190-eight-api-native-nginx.test.cjs \
  tests/security/v179-production-auth-prefix-parity.test.cjs \
  tests/security/v171-four-auth-prefix-nginx.test.cjs
# additional related
node --test tests/security/calliope-disposable-nginx-syntax.test.cjs
```

| Suite | Result |
|---|---|
| Focused V190 + V179 + V171 (workflow set) | **12/12 PASS, 0 FAIL, 0 SKIP** |
| `calliope-disposable-nginx-syntax` | **2/2 PASS** |

Native fixture (`nginx:1.26.3-alpine`) demonstrated ordinary-prefix anonymous JSON success (vulnerable model) and all eight `^~`-guarded prefixes **401 anonymous / 200 owner**, with public `/health.json` and `/devproxy/api/ai/health` unaffected and exact `/status.json` / `/routes.json` still auth-gated.

## Expected current → future route behavior (source candidate only)

Once a **separate** owner GO activates these reviewed configs on the live proxy (out of scope here):

- Nested `*.json` under the eight private API prefixes must select the `^~` auth locations instead of the late generic JSON regex.
- Public health exceptions and status assets remain public; exact protected JSON and four UI `^~` paths remain as today.
- This receipt is **not** loaded-config attestation. Future activation still needs exact source-vs-effective `nginx -T`, bounded one-reload/rollback, and independent protected/public functional parity.

## Explicit non-claims

- **NO LIVE DEPLOY** performed or authorized by this return.
- No claim of a current exploited path or leaked private data (source-latent hazard only).
- No V189 screenshot UAT / CTO visual acceptance claimed.
- No specialist launched; single coupled config change already on CTO tip.

## Engineer PR

This completion doc is the only Engineer addition atop the audited CTO tip. Nginx application source remains the CTO 16-substitution candidate.
