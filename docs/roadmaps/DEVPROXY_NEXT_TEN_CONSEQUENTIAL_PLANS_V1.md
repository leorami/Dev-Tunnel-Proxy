# Dev Tunnel Proxy — ten consequential plans (Origin-style product/engineering program)

**Owner direction:** execute the next consequential milestones under CTO-first, GitHub-native, one primary Cursor Engineer-I; source/trust boundaries and owner UAT outrank speed. This is the **priority roadmap**, not authorization to merge, restart live infrastructure, install credentials, publish a package, expose ngrok or spend money.

## Actual starting truth

- DEVPROXY-001, issue #4, returned: `cto/first-real-local-mcp-proof-20261101@3abb397181d5ee7886e4b6eafebf5f42d47c6319` has a single receipt; tested product SHA `83da0ccdf55ca0073edc32c721a271e8f003cba7`. Engineer reports 30/30 Node22 MCP tests and independent two-test-app loopback reads. **No remote ChatGPT, sensitive data or live product app was exercised.** Draft PR #5 is not approved/merged.
- Master source baseline for independent security hardening: `62a4d7babae986ade1feb0fd6dbe7dd32532523a`. The security source branch is separate to avoid running current proxy and avoid making Plan002 depend on an unmerged MCP prototype.
- No authoritative root `CORE_COLLABORATION_PROTOCOL.md`/`CORE_PROTOCOL_LOCK.json`/`AGENTS.md` or GitHub CI workflow exists yet in this repository. Origin protocol itself and its pending PRs must be checked at the precise next adoption gate (Plan010), not assumed merged.

| Priority | Boundary | Product consequence | Quality/acceptance gate | Dependency |
| --- | --- | --- | --- | --- |
| **002** | **Public Security Perimeter** | Anonymous access cannot expose private artifacts, admin password, route inventory or privileged management endpoints; host management ports loopback only. | RED tests, isolated nginx + API anonymous/auth matrix, no service disruption, source evidence and rollback instructions. | Start from current master; urgent before widening exposure. |
| **003** | **Authentication and Authorization** | Real admin sessions and user rights: consistent actor identity, session expiry/revocation, CSRF and Origin protection, secure cookies on HTTPS, login throttling and notifications isolation. | Expired/replayed/wrong-origin and cross-route tests; no credential leakage; owner-approved rotation only. | 002 reviewed; can investigate read-only earlier. |
| **004** | **Least-Privilege Infrastructure** | A compromised dashboard/AI subsystem cannot use unrestricted Docker socket/root host control; isolate service principals and mounts. | Threat-modelled allowed operations, constrained mediator commands, container isolation and escape negatives, Docker-test evidence. | 002/003 controls; keep existing builds working. |
| **005** | **Transactional Route Management** | Route installs, changes, conflict promotions and rollbacks cannot interrupt healthy apps or create partial state. | deterministic precedence; candidate config dry-run and nginx -t; atomic promote/rollback; concurrency and restart evidence. | 002; coordinate with 004 Docker restrictions. |
| **006** | **Safe Calliope Self-Healing** | Diagnosis and evidence are default; proposed fixes show precise diffs and require scoped authorization before applying/reloading. | action provenance, adversarial intent safety, undo and audited before/after, verified no accidental writes. | 003/005. |
| **007** | **Universal Local MCP Adapters** | Secure discovery/status/read of two distinct real *opted-in* local dev apps via the one shared package; no host shell. | app-scoped resource identity, two-app isolation, failures/timeouts, version/transport interoperability, owner-visible discovery. | DEVPROXY-001 accepted; 003/004 for sensitive data. |
| **008** | **Secure ChatGPT Connectivity** | One authenticated Cloud ChatGPT → explicitly consented local test app read with genuine existing trusted tunnel. | verify real MCP client and auth, revoke/disconnect, safe fallback, never public-forward loopback or fabricate cloud connection. | 007 + owner tunnel authorization; not a credential request by default. |
| **009** | **Authorized Actions and Audit** | Narrow per-app reversible mutation with server-verified user/grant, exact args, idempotency and audit/replay protection. | live app-owned persistence transaction tests, least privilege, one-use approval and uncertain outcome review; owner UAT. | 003/004/006/007/008. |
| **010** | **Origin Governance and CI** | Projects receive versioned Origin standard changes by scoped reviewable PRs and deterministic CI gates; no silent merge. | protocol lock, provenance, test scopes, no git without authority, branch protections/review, safe E2E, exact SHAs. | Read-only origin comparison now; executable adoption at a noninterfering boundary. |
| **011** | **Unified Owner Dashboard** | One coherent interface for active apps, routes, tunnel status, safety posture, pending approvals and operation results. | accessible desktop/mobile visuals, genuine data/stale indicators, owner workflows, no sensitive logs. | trustworthy API from 003–009. |

## Sequencing decision

Recommended executable order: **002 → 003 → 004 → 005 → 006**, while **010** may advance as *read-only* governance research and deterministic test design in an isolated lane. Once base trust is demonstrably satisfied, **007 → 008 → 009**, and then owner-facing **011**. If 002 live exposure is confirmed, prepare a short owner decision on safe containment/rotation before implementing other feature work. Do not claim remote GPT readiness from local-only unit tests.

An engineering handoff is exactly **one** pinned branch + complete SHA + plan path and one primary Engineer. Preserve owner checkout, active assignments and UAT gates. No speculative specialist launches; research parallelism only where state ownership does not overlap.

## Visibility and status language

Use **PLANNED / CTO SOURCE PREPARED / ENGINEER STARTED / IMPLEMENTING / VERIFYING / RETURNED / CTO REVIEWED / OWNER ACCEPTED** with observed GitHub evidence. GitHub issue creation is not an agent launch. Every successful plan must identify what the owner can actually use, and what remains BLOCKED or unauthorized. Dependent plans are never dispatched from unaccepted implementation source.
