#!/bin/bash
# Run all tests for dev-tunnel-proxy with iterative support
# Usage: ./test/run-all-tests.sh [:fast-10]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$ROOT_DIR/test/run-iterative.js" "$@"
