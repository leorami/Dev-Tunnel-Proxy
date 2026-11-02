# Dev Tunnel Proxy — source-of-truth documentation index

This index makes durable product and security decisions discoverable across chat, Cursor and GitHub. **The security release candidate below is a proposal; the live proxy and host macOS bridge remain on existing installed code.** Status comes from the exact source SHA and GitHub Engineer receipts, never a previous chat's forecast.

## Core / product

- [Product outcomes](PRODUCT.md)
- [Architecture](ARCHITECTURE.md)
- [API contract](API.md)
- [User guide](USER_GUIDE.md)
- [Configuration](CONFIGURATION.md)
- [Production mode](PRODUCTION_MODE.md)
- [Tests and quality](TESTING_SECURITY_AND_QUALITY.md)
- [Ten consequential priorities](roadmaps/DEVPROXY_NEXT_TEN_CONSEQUENTIAL_PLANS_V1.md)

## Security implementation and acceptance

- **Integrated security release candidate RC1:** [one owner-governed source contract](architecture/DEVPROXY_SECURITY_RC1_INTEGRATED_CANON_V1.md) and [staged release/rollback gates](release/DEVPROXY_SECURITY_STAGED_ROLLOUT_GATES_V1.md). The RC1 integration includes DEVPROXY-002 (perimeter) + DEVPROXY-003A (sessions) + P0 Mac notifications guard + 003B signed-in redirect defense. This is NOT the full DEVPROXY-003 CSRF/rate-limit/identity program.
- [Public management and private artifact perimeter](architecture/DEVPROXY_SECURITY_PERIMETER_V1.md) — draft PR #7, returned Engineer-I issue #6, no protected merge.
- [Admin login, cookie and private session foundation](architecture/DEVPROXY_003A_ADMIN_SESSION_FOUNDATION_V1.md) — draft PR #12, returned Engineer-I issue #9, no protected merge.
- [macOS Notifications Bridge owner pairing](architecture/DEVPROXY_P0_MACOS_BRIDGE_PAIRING_SECURITY_V1.md) — draft PR #11, returned Engineer-I issue #8; host bridge NOT restarted.
- [Signed-in same-origin return policy](architecture/DEVPROXY_003B_LOGIN_RETURN_SECURITY.md) — CTO draft PR #13, source proof only; no Engineer browser evidence until RC1.
- [Original DEVPROXY-002 bounded Engineer handoff](handoffs/DEVPROXY_002_PUBLIC_SECURITY_PERIMETER_HANDOFF.md), [original 003A handoff](handoffs/DEVPROXY_003A_OWNER_LOGIN_SESSION_FOUNDATION.md), corresponding immutable [002 receipt](receipts/DEVPROXY_002_SECURITY_CONTAINMENT_ENGINEER_COMPLETION.md) and [003A receipt](receipts/DEVPROXY_003A_ADMIN_LOGIN_SESSION_ENGINEER_COMPLETION.md). P0 Mac receipt and original handoff are preserved on PR #11 and issue #8, not silently copied into this branch.
- Five safe source/contract suites: `tests/security/management-perimeter.test.mjs`, `admin-session-foundation.test.mjs`, `notification-bridge-authorization.test.mjs`, `login-redirect-same-origin.test.mjs`, `security-release-integration.test.mjs`. Run under **canonical** `./smart-build.sh test:unit` in a disposable environment. Do NOT run historical live-mutating `test:all` against owner services.

## Origin governance gap (tracked for DEVPROXY-010)

DevProxy still has no root `CORE_COLLABORATION_PROTOCOL.md`, `CORE_PROTOCOL_LOCK.json`, `AGENTS.md` or CI workflow on protected `master`. Origin canonical master is `leorami/project-template` `main@89bb015d42604108d630ed60843f5327ab97cf70` at review with lock version `2026-10-15.5`. Origin PR #98 and stacked draft #102 are **unmerged**; do not assume those standards are already in effect on master or silently overwrite current stricter `.cursorrules`. A later bounded Origin-consumer PR should pin exact reviewed Origin master commit/blob and propose updates for owner review, with no auto-merge/deploy.

## Evidence language

Use **SOURCE PREPARED / ENGINEER STARTED / VERIFYING / RETURNED / CTO REVIEWED / OWNER ACCEPTED / DEPLOYED** only when proven. Tests in isolated dev stacks do not establish that nginx on the public tunnel or Messages.app on the Mac has been updated. An issue comment or draft PR does not launch a Cursor agent. One primary Engineer owns each implementation assignment; existing owner files and running services are protected by default.
