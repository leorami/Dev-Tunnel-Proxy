# Dev Proxy V175 — Observer pre-deployment security and usability gates

**Authority:** owner requested CTO-led meaningful independent engineering and working mandatory read-only CTO visual access. No automatic production deployment, credentials, or protected branch merge. **State: Engineer-I V175 source repair candidate (draft PR); formerly RED gates GREEN without assertion softening; NOT live-deployed; ChatGPT PNG transport still blocked.**

## Verified immutable predecessor

- Actual Engineer-I V174 #182: STARTED #7050299989 → RETURNED #7050469669; outcome `V174_SOURCE_WIRED_MAIN_DEFAULT_SET_TRANSPORT_BLOCKED`.
- Default repo branch now `main`; `main@952aa2625990f8da60784a8c6a63759b47b43569` with server-reported protection enabled.
- Engineer unmerged source: PR #183 `engineer/devproxy-v174-mandatory-cto-visual-bridge-20261120@edb362d56eee9bb9a12b0945b1f59a258435412e`; reported 19/19 isolated security unit tests. The source is NOT deployed or visually accepted.
- Earlier V172 #179 had already verified four `^~` UI auth prefixes in the running Nginx overlay. Do not regress them.
- CTO review #6001046701 filed on PR #183; independent source read found a real regression and trust/usability gaps. **No change to Engineer-I's returned source branch.**

## Highest-consequence findings to correct before source acceptance

**P0-A — PROD AUTH PRECEDENCE REGRESSION:** PR #183 changes both Nginx configs to dual `/admin/visual-access-check` but its `config/default.production.conf` still declares `location /status`, `/reports`, `/health`, `/dashboard` rather than the four `location ^~` prefixes already installed at V172. The late generic `~* \\.(json)$` static handler may regain precedence for nested JSON. The plain `config/default.conf` retains strong prefixes. Any deployment candidate must preserve all four strong prefixes in BOTH configs. Native Nginx routing proof must include anonymous nested JSON (should require login), admin access, no dashboard/static break, intentional exact protected JSON, and public `/health.json`/assets.

**P0-B — AUTH SUBREQUEST ORIGIN:** `location = /admin/visual-access-check` is missing Nginx `internal;` in both candidates. It must be limited to internal auth_request, not public probing. Keep direct auth endpoints private and do not accidentally allow observer credentials to escalate.

**P0-C — ORIGINAL TARGET MUST BE PROVEN:** In `utils/cto-observer-http.cjs`, `originalPathname` defaults to `/status` if no trusted original URI is supplied. This can authorize an invented harmless page for an otherwise unknown target and is not fail-closed. Reject absent, ambiguous, malformed, encoded/overlong or untrusted original-target signals.

**P1-D — SOURCE ATTESTATION:** `/admin/cto-observer/grants` currently accepts a well-formed owner-supplied `body.sourceSha` even when it differs from the API's actual loaded source. A grant is valid only when matched to server-attested current source; do not ask owner to type a source SHA as trust evidence. Confirm how Docker/host actually supplies the attested source SHA; environment may not be configured. Unknown current source -> refuse issuance, not silently pin an arbitrary value.

**P1-E — A COMPLETE OBSERVER JOURNEY, NOT JUST TOKEN TESTS:** Backend implements `/admin/cto-observer/projection/:page` but Nginx includes no route forwarding this URL family. Real Status/Health/Reports/Dashboard pages fetch admin-only APIs that an observer must *never* receive. Even with a valid observation session the interface may render empty, not faithfully show real safe content. Add ONLY field-allowlisted projections with integrated observer-safe rendering and read-only affordances; demonstrate no admin credentials, cookies, status metadata, private paths, route names, healing, notifications, or commands in observer data.

**P1-F — GENUINE OWNER CONSENT AND OBSERVER IDENTITY:** Consent form currently asks user to invent a CSRF token and manually enter source SHA, while printing redemptionToken in DOM. A body/header self-match alone is not a server-issued, owner-session-bound CSRF token. Observer principal is only an unverified client-entered label and does not prove an authenticated external ChatGPT observer. Bind issuance to an existing owner session, validated trusted origin and server-bound CSRF; bind redemption to a demonstrated trusted observer identity. No token in ChatGPT, GitHub, URL, browser screenshot, logs or telemetry.

## Required source and evidence

The CTO supplies `tests/security/v175-observer-predeploy-red-gates.test.cjs` **RED-first**, based on exact PR #183 SHA, covering the five objective regressions above (actual run on Engineer workspace required). These failing tests are *not* a production-ready code patch. Primary Cursor Engineer-I integrates the smallest correction on one isolated branch and revises tests for server-bound CSRF and observer transport; no stage-A repetition.

No changes to Nginx live config, macOS worker, Docker, ngrok, published UI, production session material, private mount or owner checkout. Run `./smart-build.sh test:unit`, source-true native Nginx fixture (zero security skips) and actual owner-browser visual UAT **if trusted browser access exists**. The mandatory ChatGPT Work/browser/plugin original PNG channel remains **UNPROVEN** in this conversation; do not invent its existence. Source acceptance only after full committed diff review, no regression, and correct green tests. **UI approval requires actual original pixel bytes visible inline to CTO and owner; otherwise mark transport BLOCKED.**

One primary implementation agent; no unnecessary parallel specialist or owner questions. Return one consolidated lifecycle receipt with exact source and test evidence and permissions not used. Separate explicit owner runtime GO still required before observer activation.
