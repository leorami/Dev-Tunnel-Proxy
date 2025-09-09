# [DEPRECATED] This file moved to CALLIOPE-AI-ASSISTANT.md

See `docs/CALLIOPE-AI-ASSISTANT.md` for the up-to-date assistant docs.

## Persona
- First-person, friendly, and encouraging: “I checked my circuits, upstreams, and tunnels.”
- Educational by default: concise, actionable steps, and context of why.
- Proactive and self-aware: collects data itself; no copy/paste needed.

## How to talk to me
- Speak naturally. I understand proxy health, routes, dev servers, and tunnels.
- Tell me symptoms (“/sdk is 404”, “HMR is flaky”), or ask what’s healthy right now.
- Ask me to “self-check” or “heal” if something seems off.
- I’ll gather what I need (configs, routes, status) and report back.

## Capabilities
- Self-check: I run diagnostics and summarize what’s up (and what’s not).
- Self-heal: I can regenerate my app bundle and reload Nginx safely.
- Educate: I explain fixes and why they matter; give minimal, effective steps.
- Q&A: With an API key, I answer questions using my docs + live context.
- UI Tests: I can be validated with Playwright-based tests that capture console, screenshots, and computed styles.

## Self-heal rules (growing set)
- Storybook SB9 mapping fix: if `/sb-manager/globals-runtime.js` is misrouted to `sb-addons`, I correct Nginx to point to `sb-manager` for both root and `/sdk/` paths.
- Ensure resolver for variable-based proxy_pass: inject `resolver 127.0.0.11` and `resolver_timeout 5s` when a block uses upstream variables and lacks a resolver.
- Regenerate composed app bundle and hot-reload Nginx after applying fixes.

Invoke with:
```bash
curl -s http://localhost:8080/api/ai/self-check -X POST -H 'Content-Type: application/json' -d '{"heal": true}' | jq
```

## Endpoints (served by `dev-conflict-api`)
- GET `/api/ai/health` → assistant availability and model info
- POST `/api/ai/ask` → LLM Q&A with runtime and docs context
- POST `/api/ai/diagnose` → quick local diagnostics summary
- POST `/api/ai/self-check` → run self-diagnostics and return a friendly summary

### Self-check
Request:
```json
{}
```
Optional:
```json
{ "heal": true, "hint": "anything the user wants me to look at" }
```
Response:
```json
{ "ok": true, "summary": "Hey! ...", "self": { /* detailed steps and artifacts */ } }
```

What it does:
- Refreshes route and health artifacts (leveraging existing scanners)
- Probes live endpoints (status, routes, health, api)
- Optionally self-heals: regenerate bundle and reload Nginx if config is valid
- Returns both a human-friendly summary and machine-readable details

## Surfacing Results
- `/status.json` and `/routes.json` are served by Nginx via artifacts in `.artifacts/reports`.
- The assistant writes/refreshes those artifacts so the status page stays up to date.

## Docker Healthcheck
- Uses `/health.json` for a resilient health signal.

## Environment variables
- `LOCAL_PROXY_BASE` (optional): override base used for internal probes (default `http://dev-proxy`).
- `OPENAI_API_KEY` (optional): enables `/api/ai/ask` and embedding features.
- `OPENAI_MODEL`, `OPENAI_EMBED_MODEL` (optional): model selection.

## Notes
- Self-heal only reloads Nginx after a successful config test.
- All write operations are guarded with backups and validation.
