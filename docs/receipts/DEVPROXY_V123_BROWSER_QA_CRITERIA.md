# DEVPROXY V123 — Browser QA Criteria (pre-production checklist)

## Context
V123 source-only trust remediation integrated vendored UI dependencies and escaped dynamic HTML sinks. Before production deployment, manual browser QA should verify visual/functional parity and security boundary.

## Local Test Setup
```bash
# Serve status page locally (no pairing, no bridge)
cd status
python3 -m http.server 18765
# Open http://127.0.0.1:18765/status.html in browser
```

## Functional Verification
1. **Page loads OFFLINE**: Status page displays "OFFLINE" or "not paired" state
2. **Route icons**: Lucide icons render correctly (check chevrons, bar charts, settings icons)
3. **Config cards**: Group headers show proper text (not HTML fragments)
4. **Theme toggle**: Light/dark mode switch works
5. **Notifications UI**:
   - Open notification settings for a route
   - Title shows escaped route/source (no `<script>` if route name were malicious)
   - Add/edit notification wizard renders
6. **Chat/AI drawer**: If present, markdown rendering works (DOMPurify should sanitize)
7. **No JavaScript errors**: Browser console clean (no missing remote script errors)

## Security Verification
1. **Network tab**: No outbound requests to `unpkg.com` or `cdn.jsdelivr.net`
2. **Vendor scripts**: Confirm `/status/vendor/lucide.min.js`, `/status/vendor/marked.min.js`, `/status/vendor/purify.min.js` load successfully
3. **LocalStorage**: No paired bearer token present (check Application > LocalStorage)
4. **HTML inspection**: View source → vendor scripts have local paths, no remote CDN URLs
5. **XSS probe**: If you manually edit route names in `config.js` to include `<script>alert(1)</script>`, the status page should NOT execute it (should escape)

## Visual Regression
Compare to prior production status page for:
- Layout/grid intact
- Icons/chips/badges same appearance
- Colors/theme consistent
- Modal/drawer positioning
- Mobile responsive (optional: test at 390px width)

## UAT Gate
This is **source-only** acceptance. A separate owner decision is required for production UI rollout. Do not deploy without explicit approval.
