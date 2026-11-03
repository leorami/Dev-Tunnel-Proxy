# Dev Proxy P0 — exact loaded-file identity candidate (CTO, nonlive)

## Source-grounded actual state

Engineer-I RETURNED PR #69 at `5d09f28371785dfaa840e522f88d3b807598fe4f`. Its read-only Mac evidence confirms the currently running nginx conf.d globs show precisely `default.conf` and `sites-enabled/apps.generated.conf`. The 3-file v6 signature would not detect a newly loaded `.conf` sibling. Nothing has been deployed from v6-v10, and no owner release authorization is inferred.

## CTO implementation

`utils/rc1-loaded-nginx-file-identity.cjs` performs a read-only, source-to-loaded-file comparison for three specific nginx files. It checks a controlled candidate include graph, exact runtime directory names, no symlinks, no hardlinked files, bounded stable file reads, and SHA-256 equality of each loaded file with its candidate. No raw nginx text, owner paths, credentials, or route contents are returned. The permission preflight also rejects group/other writable candidate sources, runtime files, and every traversed directory before accepting a match (four additional RED-first regressions). It also provides a **test-owned** `hostView` adapter that can be injected into the existing v9 host wrapper, checking loaded bytes before each nginx-test/reload action. Failure to match blocks the wrapped action.

This module DOES NOT know or verify the actual Docker daemon, image digest, private owner host paths, mounted running container identity, mime.types contents, other image-shipped config/module files, or operating permissions. Its only positive status is `FIXED_NGINX_FILES_MATCH_REPORTED` with `effectiveNginxConfigComplete:false` and `actualHostAttested:false`. An injected test-owned path cannot stand in for trusted Mac process evidence. Do not attach a production authorization meaning to this status.

## Coverage and release boundary

CTO v9 source: 33 RED-first tests. CTO v10 fixed-file identity and bridge: 26 new RED-first tests. Combined unchanged CTO v8 tests and new v9+v10: **129/129 passing on Node 22.16.0 (single-process test concurrency)**. These results cover synthetic test data only.

The runtime loaded file set can still change after these checks, and v8 remains vulnerable to a post-fence / pre-transaction-settle mutation window. Closing those requires an approved cross-process immutable content snapshot or lease with independently attested host execution, not repeated synthetic tests. Owner API `/app:rw` deviation remains a separate production issue. Preserve all 17 owner routes, credentials and sessions. No UI files changed; CTO visual review is not claimed.
