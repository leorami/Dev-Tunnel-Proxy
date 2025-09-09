#!/usr/bin/env bash
# Back-compat shim: forward to new root script
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/smart-build.sh" "$@"
