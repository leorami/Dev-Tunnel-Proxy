# Dev Proxy Connectivity Report

Generated: 2025-09-01T21:09:56.027Z
Ngrok URL: https://ramileo.ngrok.app

| Route | Upstream | Localhost | Ngrok |
|---|---|---:|---:|
| /api/ | http://encast-api:8000 | 200 (200) | 200 (200) |
| /impact/ | http://encast-impact:3000 | fail (500) | fail (500) |
| /inspire/ | http://encast-inspire:3001 | fail (502) | fail (502) |
| /sdk/ | http://encast-sdk:6006 | fail (404) | fail (404) |
| /admin/ | http://encast-api:8000/admin | fail (404) | fail (404) |
| /payment/ | http://encast-payment:5454 | fail (404) | fail (404) |
| /mxtk/ | http://dashboard-dev:2000/$1 | 200 (200) | 200 (200) |

## Auto-corrections and Recommendations
- Impact: Added ^~ matcher and strip-prefix rewrite; upstream set to encast-impact (Docker DNS). Ensure CRA is path-prefix aware or assets are relative.
- MXTK: Disabled root-level /api block to avoid intercepting other apps. Keep MXTK under /mxtk to prevent route conflicts.
- MXTK: Broadened default negative-lookahead allowlist to include other app prefixes (impact, api, etc.)

## Notes
- Localhost checks target http://localhost:8080.
- Ngrok checks use the discovered public URL and send ngrok-skip-browser-warning header.
- Only app routes discovered from Nginx app configs are tested.