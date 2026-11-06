# V107 isolated CTO research — static nginx upstream and API-only replacement

## Scope and provenance

This is a **nonblocking independent research lane**, not a replacement for the sole primary's authorized V106 implementation. Started from genuine V105 RETURNED `engineer/devproxy-rc2-controlled-release-20261104@150d0e792bfca886a1509d07618aa2c5eedd5500`. V106 primary genuinely STARTED at PR #79 comment **6673622918**; do not interrupt, reassign, mutate V106-owned files or change the accepted owner grant. No owner Mac access, Docker, tunnel, private state or production operation was used for this research.

## Repo source observation

`config/nginx.production.conf` in the deployed source defines static `config_api_upstream` and `notifications_api_upstream`, each pointing to `dev-proxy-config-api` port 3001/3002, without an upstream `zone`, `resolve` or `resolver`. The reviewed production Compose candidate places both services on external `devproxy` with no fixed API IP. An API-only recreate may give the API a different Docker network IP while the running nginx process retains its original resolved upstream IP. This is a concrete **possibility**, not a determination that the live Docker IP will change.

Nginx documentation confirms `server ... resolve` and an appropriate resolver/shared upstream zone are needed for automatic upstream DNS address updates; simply using a hostname in a static `upstream server` line is insufficient. Current nginx config does not enable that behavior. Docker Compose documents `up --no-deps` as preventing linked services from starting but does NOT guarantee that the replacement keeps its prior IP. Docker supports static IP attachment subject to network/IPAM restrictions, which is a potential **private disposable research choice**, not a demonstrated safe or owner-authorized production procedure.

- https://nginx.org/en/docs/http/ngx_http_upstream_module.html
- https://docs.docker.com/reference/cli/docker/compose/up/
- https://docs.docker.com/reference/cli/docker/network/connect/
- https://docs.docker.com/reference/compose-file/services/

## Executed local repro (NOT the owner Mac)

On an isolated Linux environment with nginx 1.26.3, a disposable fixture bound one simulated API to `127.0.0.1` on a random high port, with a private nginx subprocess using a static upstream to that address. That backend was removed and a new simulated API started at `127.0.0.2` with the same TCP port; no nginx reload/restart occurred.

| Observation | Result |
| --- | --- |
| Initial nginx → old backend | HTTP **200** |
| Direct new backend at different loopback IP | HTTP **200** |
| Unchanged nginx → old static address | HTTP **502** |
| Restore old backend at original IP, without touching nginx | HTTP **200** |
| Nginx process stayed alive through fixture | **true** |

Experiment code is preserved at `tests/research/rc2-nginx-static-upstream-repro.py`. It binds only high-port loopback HTTP fixtures, never touches /etc/hosts or a real service, and cleans up child processes. The executed original local script had equivalent logic; the checked-in variant has **not been rerun on the owner Mac**. It proves only the generic stale-address failure mode, not Docker Desktop's replacement allocation or the current V106 result.

## CTO consequence for the owner-authorized change

The current explicit owner authorization recorded at PR #79 #6672650274 permits one API-only recreation with an exact approved HTTPS Origin addition; it explicitly excludes proxy recreate/restart/reload and a worker repin. **Do not infer authorization from an HMAC worker's technical ability to perform nginx reload.** Do not mark `apiDnsMatchesProxyUpstream:true` merely because the Docker service alias resolves or `--no-deps` is used; independently establish that the running nginx backends resolve/route to the new API, including notifications on 3002, and that an API-only rollback restores connectivity with no proxy-side intervention.

Safe dispositions at the primary's natural coordination boundary:
1. If private preflight proves old backend address retention or another fully bounded no-proxy-change recovery with verified rollback, proceed **only within the existing exact grant**.
2. If not, STOP **before** the API replacement and report `API_ONLY_UPSTREAM_DNS_RECOVERY_NOT_PROVEN` and the minimum missing authorization. Any explicit permission for a bounded nginx reload of the same container would be a **new owner decision**, not covered by A or #6672650274. Keep unaffected source verification moving while blocked.

**No new owner intervention is requested by this independent research.** It does not override the exact pinned V106 handoff, add a required test to V106, or claim a runtime observation of the Mac.
