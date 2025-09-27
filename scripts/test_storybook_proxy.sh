#!/usr/bin/env bash
set -euo pipefail

echo "[check] nginx sanity for vite blocks"
docker exec dev-proxy sh -lc \
"nginx -T | sed -n '/location \\^~ \/\\@id\//,/^}/p;/location \\^~ \/\\@vite\//,/^}/p' | grep -q 'proxy_pass http://storybook_sdk'"

echo "[smoke] sdk iframe"
curl -s -o /dev/null -w 'proxy_iframe:%{http_code}\n' \
  'http://localhost:8080/sdk/iframe.html'

echo "[smoke] vite client"
curl -s -o /dev/null -w 'proxy_vite_client:%{http_code}\n' \
  'http://localhost:8080/@vite/client'

echo "[smoke] vite id ok"
curl -s -o /dev/null -w 'proxy_vite_id_ok:%{http_code}\n' \
  'http://localhost:8080/sdk/@id/__x00__virtual:/@storybook/builder-vite/vite-app.js'

echo "[smoke] vite id malformed collapse"
curl -s -o /dev/null -w 'proxy_vite_id_malformed:%{http_code}\n' \
  'http://localhost:8080/sdk/@id/__x00__/@id/__x00__virtual:/foo.js'

echo "[done]"


