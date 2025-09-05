# Storybook Debugging Instructions for Encast Team

## Problem Identified
SDK/Storybook shows **different errors** between localhost and proxy despite identical HTTP responses and asset loading.

## Root Cause Analysis
- ✅ **HTML content identical**: Both URLs return same HTML
- ✅ **All assets load correctly**: JavaScript, CSS, iframe all return HTTP 200
- ❌ **JavaScript execution differs**: Same code behaves differently in browser

## Key Issue: Runtime Environment Differences

The iframe loads identical scripts but JavaScript execution fails differently due to:

1. **Base Path Context**: Scripts may reference `window.location` or make relative requests
2. **WebSocket Connections**: HMR and dev server connections may fail differently  
3. **CORS Policies**: Different origins may trigger different security behaviors
4. **Module Resolution**: ES modules may resolve paths differently in proxy context

## Debug Steps for Encast Team

### 1. Browser Console Comparison
Open both URLs in separate browser tabs and compare JavaScript console errors:

```
Localhost:  http://localhost:6006/?path=/story/action-button--default
Proxy:      https://ramileo.ngrok.app/sdk/?path=/story/action-button--default
```

**Look for:**
- Different error messages
- Failed network requests  
- WebSocket connection failures
- Module loading errors

### 2. Test Iframe Directly
The stories render in an iframe. Test these directly:

```
Localhost:  http://localhost:6006/iframe.html?path=/story/action-button--default
Proxy:      https://ramileo.ngrok.app/sdk/iframe.html?path=/story/action-button--default
```

### 3. Network Tab Analysis
Compare the Network tab in browser dev tools:
- Are there failed requests that don't show up in curl tests?
- Are WebSocket connections failing?
- Are there timing differences in asset loading?

### 4. Storybook Configuration Check
The issue may require Storybook configuration for subpath deployment:

**In `.storybook/main.js`:**
```javascript
module.exports = {
  // ... existing config
  viteFinal: async (config) => {
    // Configure for subpath deployment
    config.base = '/sdk/';
    return config;
  },
};
```

**Or try setting environment variables:**
```bash
STORYBOOK_BASE_URL=/sdk/
```

### 5. WebSocket/HMR Issues
If HMR (Hot Module Replacement) is failing through proxy:

**In `.storybook/main.js`:**
```javascript
module.exports = {
  viteFinal: async (config) => {
    if (process.env.PROXY_MODE) {
      // Disable HMR through proxy
      config.server.hmr = false;
      // Or configure WebSocket port
      config.server.hmr = {
        port: 443,
        clientPort: 443
      };
    }
    return config;
  }
};
```

## What NOT To Do

❌ **Don't change Docker configurations** - the proxy routing is working correctly
❌ **Don't modify nginx rules** - asset loading is already functional  
❌ **Don't change ports or networking** - containers are properly connected

## Expected Outcome

After fixing the Storybook configuration, both URLs should show identical behavior:
- Same story rendering
- Same error messages (if any)
- Same console output
- Same network requests

## Contact Proxy Team If:
- The debug steps reveal proxy-side issues (failed asset loading, 404 errors)
- WebSocket connections cannot be configured to work through proxy
- CORS errors that can't be resolved with Storybook config changes

The proxy team has confirmed all HTTP responses are identical - this is a **client-side JavaScript execution issue** that requires Storybook configuration changes.
