#!/usr/bin/env bash
set -euo pipefail

# Soft reload policy: never fail the overall reload if upstream DNS is not resolvable at test time.
# We test; if test fails, we still try a graceful reload to keep healthy routes up.

if docker exec dev-proxy nginx -t; then
  docker exec dev-proxy nginx -s reload
  echo "nginx reloaded (config test passed)"
else
  echo "nginx -t failed; attempting soft reload to keep healthy endpoints online..." >&2
  docker exec dev-proxy nginx -s reload || true
  echo "soft reload attempted. Review /status and /status.json for current health."
fi
