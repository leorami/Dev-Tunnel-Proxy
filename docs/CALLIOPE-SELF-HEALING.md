# Calliope Advanced Self-Healing System

Calliope now includes an advanced self-healing system that can identify and fix common issues with the dev tunnel proxy.

## Architecture

The self-healing system is built on a knowledge base of known issues and their solutions. It uses pattern matching to identify issues from logs, configurations, and other signals, then applies the appropriate healing strategies.

### Components

1. **Knowledge Base**: Stored in `.artifacts/calliope/healing-kb.json`, this contains patterns of known issues and their solutions.

2. **Pattern Matching**: The system can identify issues from various signals like error messages, configuration issues, and container states.

3. **Healing Strategies**: Each pattern has one or more healing strategies, ranging from fully automated to semi-automated solutions.

4. **Feedback Loop**: The system logs healing attempts and their outcomes, allowing it to learn and improve over time.

## How It Works

1. When a self-check or self-heal is requested, the system:
   - Gathers diagnostics from the system
   - Matches signals against known patterns
   - Applies appropriate healing strategies
   - Logs the results for future improvement

2. The system uses a tiered approach to healing:
   - Tier 1: Simple fixes (reload, regenerate)
   - Tier 2: Configuration fixes (duplicate blocks, resolver directives)
   - Tier 3: Advanced recovery (container restart, symlink recreation)

## Current Capabilities

The advanced healing system can currently address these common issues:

1. **Duplicate Location Blocks**: Finds and removes duplicate location directives in nginx configs.

2. **Ngrok Discovery Failures**: Ensures ngrok URL is correctly discovered and populated in status files.

3. **Missing Symlinks**: Recreates symlinks to the latest report files.

4. **Upstream Service Readiness**: Improves resilience for services that may not be available at startup.

## API

### Using the Advanced Self-Healing

You can use the advanced healing system through:

1. **Self-Check API**:
   ```
   POST /api/ai/self-check
   {
     "heal": true,
     "advanced": true,
     "route": "/api/",  // Optional
     "hint": "duplicate location"  // Optional
   }
   ```

2. **Advanced Heal API**:
   ```
   POST /api/ai/advanced-heal
   {
     "route": "/api/",  // Optional focus
     "hint": "nginx test failed"  // Optional hint
   }
   ```

### Extending the System

The system is designed to be extended with new patterns and healing strategies:

1. Add new patterns to the knowledge base (`.artifacts/calliope/healing-kb.json`)
2. Implement new healing functions in `utils/calliopeHealing.js`

## Integration with OpenAI

Future versions can include tighter integration with OpenAI to:

1. Generate healing strategies for novel issues
2. Learn from successful human interventions
3. Explain complex issues and solutions in natural language

## Testing the Self-Healing System

You can use the cURL command below to test the advanced healing system:

```bash
curl -X POST http://localhost:8080/api/ai/advanced-heal \
  -H "Content-Type: application/json" \
  -d '{"hint": "test the healing system"}'
```

## Logs and Feedback

Healing attempts and their outcomes are logged in `.artifacts/calliope/healing-log.json`. This log can be analyzed to improve healing strategies over time.

## Proactive, Generic Healing (Guardrails)

Calliope operates with the following guardrails to keep fixes safe and generic (non app-specific):

- Always attempt automated, reversible fixes first (proxy-side rewrites, guards, reloads).
- Prefer generic patterns (e.g., subpath/static asset issues) over app-specific edits.
- Only provide suggestions when an issue cannot be resolved via automated healing.

### Generic Patterns Included

- Missing basePath for static assets under a subpath proxy (e.g., assets requested at `/icons/...` or `/art/...` while the site is mounted under `/subpath`).
  - Signals: 404s for `/icons/*` or `/art/*`, hydration mismatch warnings, `X-Forwarded-Prefix` present.
  - Healing: add generic directory guards and resilient subpath routing; set appropriate proxy headers.

### Proactive Flow

1. Run a quick audit against the requested URL.
2. If subpath/static issues are detected, apply generic directory guards and subpath-routing fixes.
3. Re-run the audit. Repeat up to a small pass limit.
4. If still not green, present concise suggestions that require app-side changes.
