# DEVPROXY V121 — P0 notification bridge, LIVE READ-ONLY authorization proof

## Starting truth and scope
Sole primary Engineer-I V120 genuinely RETURNED on PR #79 #6714253018 at engineer/devproxy-rc2-controlled-release-20261104@7da2026a9b1bfd1cd2dacecc335bfaecb6788f62. CTO reviewed its one-commit six-path diff and Mac receipts, accepted the cutover with a recorded generated-bundle restoration exception (PR #79 #6715139259), and closed source drift issue #121. **The V120 worker release is finished. Do NOT repeat it.** Original proxy/API/ngrok, worker, HMAC, routes and private rollback belong to the completed transaction. Owner UAT remains separate.

## Consequential, previously unclosed P0
Issue #8: the owner Mac previously ran a local notifications bridge on 127.0.0.1:17888 able to send Messages and manage a LaunchAgent. A source-only authorization fix was accepted in old PR #11, but the old live process was never proven to load it. Current V120 GitHub source has patched macos/notifications-bridge.js Git blob 6bf5a1a973d6806e9ddbd05c932ef9cedee424c6 and macos/notifications-bridge-auth.cjs blob b7bf100ab54d97b21057f1b630906483a188c103. The current Mac listener and its actual policy are **UNKNOWN**, not a proven live exploit and not proof of secure deployment.

## CTO implementation to integrate (FOUR additive paths)
- tests/security/notification-bridge-readonly-policy-probe.test.cjs
- utils/notification-bridge-readonly-policy-probe.cjs
- docs/architecture/DEVPROXY_V121_NOTIFICATION_BRIDGE_LIVE_AUTH_EVIDENCE.md
- this docs/handoffs/DEVPROXY_V121_NOTIFICATION_BRIDGE_LIVE_READONLY_PROBE.md

The immutable diagnostic issues only four GETs to **fixed loopback** 127.0.0.1:17888: health without auth, privileged status without auth, hostile-Origin privileged status, forged-Host health. No POST, credentials, secrets, Messages, shell/launchctl, bridge install/start/stop, other host/port or response-body retention. Its result is frozen/read-only, never permission to deploy. Source/test exact GitHub blobs 50c383e807b53ea45cb5cf3c039c99f9c895e9bf and de7538c521302fccf4bbdab85cb84801670abd86 match CTO's independently native-tested Linux Node22 files: 5/5 unit GREEN, syntax GREEN, disposable isolated loopback wire PASS. Native Mac integration remains with primary.

## Exactly ONE primary implementation assignment
1. Freshly read real PR #79 primary lifecycle and full branch SHA before acting. If a V121 primary is already active or returned, do not launch or repeat it. Preserve owner checkout, existing product and all in-progress work. Post one genuine STARTED after actual primary starts, not when this handoff is merely read.
2. Import only the four CTO paths, wire one focused test into canonical ./smart-build.sh test:unit and run native Node focused, syntax check and full canonical unit suite. Any test failure is a STOP before local probing; make only an in-scope diagnostic correction, no production source changes.
3. On the actual owner Mac perform **read-only** listener and process inspection to discover whether 127.0.0.1:17888 is listening, when its process began, and whether executable/cwd/staged source and auth module match independently reviewed Git blobs. Do NOT read the bridge pairing token, include private paths/arguments in GitHub, or infer process-loaded-code identity from disk bytes.
4. If a listener exists, run the supplied four-GET status-only probe **once**. Never call /test, /service/install, /service/uninstall, POST/PUT/DELETE or any Messages/LaunchAgent effect. No Authorization header; discard all response bodies. No new authenticated owner session.
5. Report one of four results, preserving uncertainty:
   - BRIDGE_NOT_RUNNING: no listener; do not start it or invent a patch. STOP.
   - BRIDGE_POLICY_OBSERVED_SOURCE_UNVERIFIED: 200/401/403/403; authorization behavior observed, not proof of loaded source or owner UAT. STOP.
   - BRIDGE_POTENTIAL_UNAUTHENTICATED_CONTROL: privileged/hostile origin/forged Host returns 200. Treat as P0 security exposure, preserve evidence, STOP; provide one scoped owner-only decision for separate bridge containment or corrected-source deployment. Do not self-stop or deploy.
   - BRIDGE_POLICY_UNVERIFIED: timeout/mixed/unknown; retain P0 open without false safety claim. STOP.
6. Return ONE consolidated STARTED→VERIFYING→RETURNED primary receipt on PR #79, full 40-char Engineer SHA, actual changed paths, tests and status-only Mac evidence, specialist execution identities or truthful NOT_SPAWNED, all excluded actions unperformed. Do not invent a second primary or owner intervention while only read-only evidence is needed.

## Authorization boundary
Owner's single V120 worker cutover grant was consumed and does not authorize **any** notification bridge/LaunchAgent cutover. No live Messages send, service install/uninstall, osascript, bridge process stop/restart, new pairing token, worker/HMAC/ngrok/Docker/API/proxy/route change, protected master merge, secret disclosure or owner application mutation. Follow repository Git-write policy. A GitHub comment is coordination evidence, not a Cursor launch or owner grant. If P0 actually exposed, request one separately scoped owner decision; otherwise do not manufacture remediation. Owner UAT of the working Dev Proxy remains independent.
