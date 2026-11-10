# DEVPROXY V124 — Deployment and UAT Checklist

## Context
V124 single-flight chat mechanisms integrated and tests green, but source not deployed. Before production rollout, manual deployment and browser UAT required.

## Deployment Steps
1. **Backup current live status.html** (if not already versioned)
2. **Deploy integrated source**:
   ```bash
   # Copy from engineer worktree to live status/ directory
   # OR restart/rebuild the status page serving process
   ```
3. **Verify deployment**:
   ```bash
   curl -sS 'https://127.0.0.1/status/status.html' -k | git hash-object --stdin
   # Should match: fa4a84aeecb8fcf14a0162c593cd309ed0995fc5
   ```

## Browser UAT (post-deployment)
### Single-flight Ask behavior
- [ ] Type question, press Enter → one request, one terminal reply
- [ ] Rapid Enter / second Enter during pending → no duplicate requests
- [ ] Click Ask button during pending → coalesced (no second request)
- [ ] Clear chat during pending Ask → spinner cleared, no stale reply appears

### Self-Check behavior
- [ ] Click Self-Check once → one request, one terminal result
- [ ] Click Self-Check repeatedly during pending → coalesced (no duplicate requests)
- [ ] Clear chat during pending Self-Check → no stale result after Clear

### Per-route Diagnose behavior
- [ ] Click route Diagnose once → one request, one terminal diagnosis
- [ ] Click same route Diagnose repeatedly → coalesced
- [ ] Click different route Diagnose → new request (per-route gating)
- [ ] Clear chat during pending Diagnose → no stale diagnosis after Clear

### Spinner and terminal state
- [ ] Spinner always cleared after response or error
- [ ] No lingering "Thinking..." after Clear
- [ ] Terminal reply appears exactly once (no duplicates)

### Responsive layout (from V124 narrow improvements)
- [ ] 375px (mobile): chat visible, composer not clipped, no horizontal overflow
- [ ] 768px (tablet): chat drawer/overlay correct
- [ ] 1024px (laptop): full layout, no clipped actions
- [ ] 1440px (desktop): optimal spacing

### Theme and accessibility
- [ ] Light/dark theme toggle works
- [ ] Keyboard focus visible
- [ ] Auto-Scan toggle persists state

### Protected observation
- [ ] Diagnosis uses read-only evidence (no unauthorized heal/write)
- [ ] 200/404/503 status codes classified honestly
- [ ] Timeout or unavailable service reported truthfully

## Rollback Plan
If deployment causes issues:
1. Restore previous `status.html` from backup
2. Restart serving process if needed
3. Report specific failure to engineering

## Success Criteria
All UAT checklist items pass → V124 behavioral acceptance complete.
