# DevProxy owner login return is same-origin — 003B precursor

**CTO independently authored, isolated, NOT DEPLOYED, NOT ENGINEER-VERIFIED.** Active primary Engineer-I is implementing DEVPROXY-003A on its separate, pinned branch. This security slice is not a new engineering assignment or replacement for that work.

## Source finding

On the DEVPROXY-002 returned source `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d`, `status/login.html` obtains `redirectUrl` directly from the attacker-controlled `?redirect=` query parameter and navigates using `window.location.href=redirectUrl` after successful authentication or if already authenticated. Absolute `https://other-host`, protocol-relative `//other-host`, or `javascript:` values are never validated. This is an **open redirect / phishing / navigation trust** source defect, independent of whether any session credential actually leaked. The admin cookie is host-only, so do not claim it is automatically transmitted to an attacker domain.

## Proposed bounded repair

- `tests/security/login-redirect-same-origin.test.mjs` authored **before** source implementation, covering valid local paths/query/hash and malicious absolute, protocol-relative, backslash, control-character, encoded separator, oversize and nonstring values. Test also asserts live HTML wiring, rather than only a disconnected pure helper.
- `status/assets/login-redirect-policy.js` is a pure browser-and-Node policy. Only slash-prefixed normalized same-origin paths survive. URL authority strings, path-encoded controls/authority separators and normalized protocol-relative results fail closed to `/status`. Query string data remains allowed, so normal selected tab/context can return. No app data read or network action.
- `status/login.html` loads this policy through the already exposed `/assets/` static nginx alias and uses the **same validated destination** for both successful login and already-signed-in users.
- `./smart-build.sh test:unit` includes the source-only regression (no live app calls). It is intentionally based on returned DEVPROXY-002 and **not stacked onto current active 003A**, to avoid touching that frozen assignment; eventual integration must combine both test hooks explicitly.
- CTO validated the EXACT GitHub blob for the standalone policy (`0de4a0f6a53743d0c8f88ecc4355473cfb7626ba`, byte-identical) with Node v22.16.0 in a local disposable sandbox: 6 permitted return cases and 22 invalid cases all behaved as expected. **This was a 28-case independent behavior smoke, not a canonical project suite or browser test**. The pure admin session helper from ongoing 003A was separately byte-verified (`f263fdf790fa465eedcf6ba370702db09ada51ce`) and passed four local standalone test groups (password inputs, exact cookie, host cookie, 0600/symlink session file). No user/owner data was used.

## Remaining acceptance and release gates

1. In later single-primary-engineer 003B or release integration, run the exact repository `node --test tests/security/login-redirect-same-origin.test.mjs` and canonical `./smart-build.sh test:unit`, prove authentic nginx-served `/admin/login?redirect=` returns only same-origin pages from a disposable signed-in UI. Use fixture secrets and screenshots with no token/credential.
2. Add cross-browser checks for older Safari support of new URL and security headers. Verify no 404 for the new `/assets/login-redirect-policy.js` on both nginx dev/prod configs.
3. Audit server redirect responses separately for open redirect, and address browser CSRF/Origin and authenticated mutating endpoints in broader DEVPROXY-003B. This small patch is **not** full CSRF mitigation.
4. Treat PR #7 (perimeter), PR #11 (macOS bridge) and PR #12 (active admin session) as separate, unmerged dependencies. No protected merge, tunnel or nginx restart, credential rotation, live owner browser session or Mac interaction from this branch.

**Stop:** the login page must fail closed if the new asset cannot load; this is an intentional safety failure rather than accepting an unchecked query destination. Owner UAT/rollout is a separate decision after actual integration.
