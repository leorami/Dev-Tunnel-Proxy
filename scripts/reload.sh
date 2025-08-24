#!/usr/bin/env bash
set -euo pipefail
docker exec -it dev-proxy nginx -t
docker exec -it dev-proxy nginx -s reload
