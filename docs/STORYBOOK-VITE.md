# Storybook (Vite) Behind the Dev Proxy Under a Subpath

Run Storybook 9 (Vite builder) behind this proxy under a path prefix (e.g., `/sdk`) and an external host (e.g., ngrok), with working module scripts and HMR.

## Storybook configuration

Create or update `.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const BASE_PATH = process.env.STORYBOOK_BASE_PATH || '/sdk/';
const TUNNEL_URL = process.env.PUBLIC_TUNNEL_URL || 'https://your-ngrok-domain.ngrok.app';

const config: StorybookConfig = {
  core: { builder: '@storybook/builder-vite' },
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  viteFinal: async (cfg) => {
    cfg.base = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
    cfg.server ??= {};
    const { hostname } = new URL(TUNNEL_URL);
    // Allow external host + HMR over WSS
    // @ts-ignore
    cfg.server.allowedHosts = [hostname];
    // @ts-ignore
    cfg.server.origin = TUNNEL_URL;
    cfg.server.host = '0.0.0.0';
    cfg.server.hmr = { protocol: 'wss', host: hostname, port: 443 };
    return cfg;
  },
};

export default config;
```

Optional env:

```bash
STORYBOOK_BASE_PATH=/sdk
PUBLIC_TUNNEL_URL=https://your-ngrok-domain.ngrok.app
```

`package.json` script:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006 --host 0.0.0.0"
  }
}
```

## Proxy example

See `examples/storybook-vite.conf` for nginx routes: base, iframe/index, manager/addons/common assets, Vite client and module resolution, `node_modules`, and WebSocket.

Adjust the prefix `/storybook/` to your path (e.g., `/sdk/`) and set your upstream container.

## Verification

Replace `YOUR_HOST` with your tunnel domain.

```bash
# Base HTML + preview
curl -s -o /dev/null -w "iframe:%{http_code} %{content_type}\n" https://YOUR_HOST/sdk/iframe.html
curl -s -o /dev/null -w "index:%{http_code} %{content_type}\n"  https://YOUR_HOST/sdk/index.json

# Manager modules
curl -s -o /dev/null -w "runtime:%{http_code} %{content_type}\n" https://YOUR_HOST/sdk/sb-manager/runtime.js
curl -s -o /dev/null -w "bundle:%{http_code} %{content_type}\n"  https://YOUR_HOST/sdk/sb-addons/common-manager-bundle.js
curl -s -o /dev/null -w "globals:%{http_code} %{content_type}\n" https://YOUR_HOST/sdk/sb-manager/globals-runtime.js

# Vite client (HMR)
curl -s -o /dev/null -w "vite:%{http_code} %{content_type}\n"    https://YOUR_HOST/sdk/@vite/client

# WebSocket upgrade
python3 - <<'PY'
import socket, ssl, base64
host='YOUR_HOST'; port=443
key=base64.b64encode(b'test-key').decode()
req=f"GET /sdk/storybook-server-channel HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
s=ssl.create_default_context().wrap_socket(socket.socket(), server_hostname=host); s.connect((host,port)); s.send(req.encode()); print(s.recv(4096).decode().split('\r\n\r\n')[0]); s.close()
PY
```

Expected: 200s for HTML/JSON/JS; 101 for WS.

## Notes
- If Vite logs “another hostname than localhost”, ensure `allowedHosts`, `origin`, and `hmr` are set, and start Storybook with `--host 0.0.0.0`.
- If Nunito fonts under `/sb-common-assets/*.woff2` 404/500, provide them via `staticDirs` or remove their preloads.
