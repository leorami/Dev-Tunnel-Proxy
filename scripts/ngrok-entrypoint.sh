#!/usr/bin/env sh
set -eu

CFG="/tmp/ngrok.yml"

if [ -n "${NGROK_STATIC_DOMAIN:-}" ]; then
  cat > "$CFG" <<EOF
version: "2"
tunnels:
  proxy:
    proto: http
    addr: proxy:80
    hostname: ${NGROK_STATIC_DOMAIN}
    inspect: true
EOF
  echo "ngrok: using static domain '${NGROK_STATIC_DOMAIN}'"
else
  cp /etc/ngrok.dynamic.yml "$CFG"
  echo "ngrok: using dynamic domain"
fi

exec ngrok start --all --config "$CFG"
