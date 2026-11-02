# DEVPROXY P0 — RC1 live drift recovery plan (**PLAN_ONLY**)

**Status:** `PLAN_ONLY` — **not** `READY`, **not** owner-authorized, **not** a deploy grant.  
**productionChangeAuthorized:** false  
**mutationAllowed:** false

## Intent
Restore accepted RC1 confidentiality and mount continuity after the unverified post-#19 recreation that left live on owner/master binds (`bfc92bd8…` proxy image, anonymous full health/routes, API ports all-interfaces, docker.sock RW).

## Reuse (from Issue #19 tested cutover — do not invent new secrets)
1. **Product source:** `d89c962fb31a962a518f331bae458e63708e7e86` (minimal `/health.json`, `auth_request` on routes/status JSON).
2. **Private trusted origins:** inject via private 0600 env overlay — **do not overwrite owner `.env`**.
3. **Shared nginx/API config bytes:** single approved `default.production.conf` root visible to both proxy and API (Issue #19 / PR #34 pattern).
4. **Owner state continuity:** absolute binds for apps, `.artifacts`, `build/sites-enabled`, certs, status — preserve sessions and private route overrides.
5. **Scope:** proxy + API recreate only; **ngrok/bridge/master untouched** when a later owner-authorized cutover runs.
6. **Rollback:** keep prior image IDs / private rollback tags available; ≤120s restore target as in RC1 cutover discipline.

## Explicit non-goals for this document
- No live restoration in the Engineer P0 source assignment.
- No `scripts/switch-to-production.sh`.
- No PR #37 / 004A install (snapshot copier symlink race still open).
- No expanding the prior one-time RC1 cutover approval into silent re-deploy consent.

## Gate to flip PLAN_ONLY → READY (owner + CTO later)
- [ ] CTO reviews engineer source diff for pre-mutation guard
- [ ] Disposable fixture proves guard blocks R0-shaped drift and allows only disposable project IDs
- [ ] Private preflight attests mounts/config/origins/image without logging secrets
- [ ] Owner explicitly authorizes a new cutover after unexplained rollback
- [ ] Rollback path rehearsed on disposable stack

Until then: ordinary `./smart-build.sh up|restart|apply` against the live project **must fail closed** (`P0_DRIFT_BLOCKED` / `OWNER_GATE_REQUIRED` / `EVIDENCE_INCOMPLETE`).
