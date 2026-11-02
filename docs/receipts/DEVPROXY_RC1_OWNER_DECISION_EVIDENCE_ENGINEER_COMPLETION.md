# DEVPROXY-RC1 owner decision evidence receipt

Engineer-I execution of [Issue #19 comment 6570920867](https://github.com/leorami/Dev-Tunnel-Proxy/issues/19#issuecomment-6570920867).

**Recommendation: NO-GO.** **BLOCKED_OWNER_UAT** for cutover. **NOT_DEPLOYED.** No feature sprint. Staging and private backups preserved.

## Source identity

| Item | Value |
| --- | --- |
| Start SHA | `031de0d0e8d4f87e9badbdd2853d6506577e8b0e` (`cto/devproxy-rc1-trusted-origin-compose-gate-20261102`) |
| Branch | `cto/devproxy-rc1-owner-decision-evidence-20261102` |
| Resulting SHA | this commit |
| Coordination | Issue #19 |
| Node | v22.19.0 |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |
| Worktree | `/private/tmp/devproxy-owner-decision` |

## Reconciled prior returns (not re-executed)

| Work | Citation | Use in packet |
| --- | --- | --- |
| Private image+config backup | Issue #19 / PR #25 recovery receipt | archive exists on owner Mac (`0700` tree) |
| Offline restore verification | Issue #26 @ `62b1846…` | `rollbackArchiveVerified` **PASS** |
| Signed-in loopback staging | PR #27 @ `f9c3ef…` | staging UAT route preserved; `ownerStagingUat` still **NOT_RUN** |
| Trusted-origin Compose gate | PR #28 @ `031de0d…` (CTO accepted) | deploy lockout prevented when origins unset |

Obsolete `rollbackArchiveVerified: NOT_RUN` language in the prior GO/NO-GO packet was corrected. No archive bytes, manifests, private paths, domains, or secrets were copied into GitHub.

## Read-only live fingerprint (redacted)

| Check | Result |
| --- | --- |
| Proxy | running, image `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| API | running, image `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` |
| ngrok | running, image `sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa` |
| Bridge `127.0.0.1:17888` | LISTEN (unchanged) |
| Loopback `/health.json` | HTTP 200 (body not published) |
| Owner `apps/*.conf` count | 17 (names not listed) |
| Private rollbacks dir | exists, mode `0700`, 3 top entries / 6 files (contents not listed) |
| Staging `127.0.0.1:18090/admin/login` | HTTP 200; stack left running |

No public tunnel probe. No host image load. No env/secret reads.

## Public ingress plan review

Completed **source-only** review of `config/ngrok.dynamic.yml`, `scripts/ngrok-entrypoint.sh` (static vs dynamic), nginx `Host`/`X-Forwarded-*`/`auth_request`, and Compose-mandated `DEVPROXY_TRUSTED_ORIGINS`. Documented in `docs/release/DEVPROXY_RC1_OWNER_GO_NO_GO_V1.md`. Gate: `publicIngressPlanReviewed` **PASS** (plan only — not live ingress verification).

## Classifier input and result

Evidence JSON (gate states only) fed to `node scripts/release-decision-readonly.mjs` via STDIN:

```json
{
  "sourceTests": "PASS",
  "productionCompose": "PASS",
  "node18Parity": "PASS",
  "fixtureBrowser": "PASS",
  "macBridgeMock": "PASS",
  "currentImageIdentified": "PASS",
  "rollbackArchiveVerified": "PASS",
  "routeBaselineRecorded": "PASS",
  "publicIngressPlanReviewed": "PASS",
  "ownerStagingUat": "NOT_RUN",
  "macBridgeOwnerPlan": "NOT_RUN",
  "ownerExplicitApproval": "NOT_RUN"
}
```

Expected: `Recommendation: NO_GO`; blockers include `ownerStagingUat`, `macBridgeOwnerPlan`, `ownerExplicitApproval`; `releaseAuthorized`/`installed` remain false (exit 2).

Actual CLI stdout:

```
DevProxy RC1 owner release evidence
Recommendation: NO_GO
sourceTests: PASS
productionCompose: PASS
node18Parity: PASS
fixtureBrowser: PASS
macBridgeMock: PASS
currentImageIdentified: PASS
rollbackArchiveVerified: PASS
routeBaselineRecorded: PASS
publicIngressPlanReviewed: PASS
ownerStagingUat: NOT_RUN
macBridgeOwnerPlan: NOT_RUN
ownerExplicitApproval: NOT_RUN
Release authority: OWNER_ONLY
Deployment performed: NO
```

## Tests

| Command | Exit |
| --- | --- |
| `node --test tests/security/release-decision-readonly.test.mjs` | 10 pass / 0 fail, exit **0** |
| `node scripts/release-decision-readonly.mjs` (evidence above) | **NO_GO**, exit **2** |
| `./smart-build.sh test:unit` | exit **0** |
| `test:all` | **BLOCKED** (live `:3001`) |

## Changed files (this sprint)

- `docs/release/DEVPROXY_RC1_OWNER_GO_NO_GO_V1.md` — reconciled NO-GO packet
- `docs/receipts/DEVPROXY_RC1_OWNER_DECISION_EVIDENCE_ENGINEER_COMPLETION.md` — this receipt

No product/feature source changes. PR #27 staging and private backups untouched.

## Stop

For independent CTO committed-diff review and **owner UAT/GO**. No merge, live restart, public exposure, credential operation, or deployment.
