# Dev Tunnel Proxy API Endpoints

This document describes the available API endpoints for interacting with the dev-tunnel-proxy service.

## Configuration Management

### Install App Configuration

Allows apps to programmatically upload their Nginx configuration files to the proxy.

**Endpoint:** `POST /api/apps/install`

**Request Body:**
```json
{
  "name": "app-name",
  "content": "# Nginx configuration content\nlocation ^~ /app-name/ {\n  proxy_pass http://app-container:3000/;\n}"
}
```

**Parameters:**
- `name`: (Required) The name of the app without the `.conf` extension. Must be alphanumeric with hyphens and underscores only.
- `content`: (Required) The Nginx configuration content as a string.

**Response:**
```json
{
  "ok": true,
  "installed": "app-name.conf"
}
```

**Error Responses:**
- `400 Bad Request`: If name or content is missing or invalid
- `422 Unprocessable Entity`: If the Nginx configuration fails validation
- `500 Internal Server Error`: For other errors

**Processing:**
1. The configuration is saved to the `apps/` directory as `{name}.conf`
2. The `hardenUpstreams.js` script is run to transform proxy_pass directives for resilience
3. The bundle is regenerated with `generateAppsBundle.js`
4. Nginx configuration is tested and reloaded

### Promote App Configuration to Override

Promotes an existing app configuration to an override.

**Endpoint:** `POST /api/overrides/promote`

**Request Body:**
```json
{
  "filename": "app-name.conf"
}
```

**Parameters:**
- `filename`: (Required) The filename of the app configuration to promote.

**Response:**
```json
{
  "ok": true,
  "promoted": "app-name.conf"
}
```

### Get Configuration File

Retrieves the content of a configuration file.

**Endpoint:** `GET /api/config/:file`

**Response:**
```json
{
  "file": "apps/app-name.conf",
  "content": "# Configuration content..."
}
```

### Update Configuration File

Updates the content of an existing configuration file.

**Endpoint:** `POST /api/config/:file`

**Request Body:**
```json
{
  "content": "# Updated configuration content..."
}
```

**Response:**
```json
{
  "ok": true,
  "file": "apps/app-name.conf"
}
```

## Client Usage Example

Here's an example of how to use the API to programmatically install a configuration:

```javascript
async function installAppConfig(name, content) {
  const response = await fetch('http://dev-proxy:8080/api/apps/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, content })
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Failed to install config: ${result.error}`);
  }
  
  return result;
}

// Example usage
const nginxConfig = `
# My app configuration
location ^~ /myapp/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://my-app-container:3000/;
}
`;

installAppConfig('myapp', nginxConfig)
  .then(result => console.log('Config installed:', result))
  .catch(err => console.error('Installation failed:', err));
```
