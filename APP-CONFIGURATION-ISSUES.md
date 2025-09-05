# App Configuration Issues Found

## Critical Problems Preventing Proxy Functionality

### 1. Impact App (React/CRA) Configuration Issues

**Problem**: App hardcoded to call `localhost:8000` APIs, which fails when accessed through ngrok tunnel.

**Current Environment Variables**:
```bash
REACT_APP_API_URL=http://localhost:8000
REACT_APP_API_ENDPOINT=http://localhost:8000
```

**Impact**: When users access `https://ramileo.ngrok.app/impact/`, the JavaScript tries to make API calls to `http://localhost:8000` (which doesn't exist from their browser).

**Solution Required**: Impact app needs environment-aware API configuration:

```bash
# For tunnel/proxy usage
REACT_APP_API_URL=/api
REACT_APP_API_ENDPOINT=/api

# OR use relative paths in the code instead of absolute URLs
```

**Example Fix in React Code**:
```javascript
// ❌ Wrong: Hardcoded localhost
const API_BASE = 'http://localhost:8000';

// ✅ Correct: Use relative path (works through proxy)
const API_BASE = '/api';

// ✅ Alternative: Environment-aware
const API_BASE = process.env.REACT_APP_API_URL || '/api';
```

### 2. Storybook (SDK) Configuration Issues

**Problem**: Storybook not configured to handle proxy prefix, causing routing and asset loading issues.

**Current State**: No proxy-aware configuration detected.

**Solution Required**: Storybook needs to be configured for sub-path deployment.

**In `.storybook/main.js`**:
```javascript
module.exports = {
  // ... other config
  staticDirs: ['../public'],
  
  // For sub-path deployment
  managerHead: (head) => `
    ${head}
    <base href="/sdk/" />
  `,
  
  // Ensure assets load correctly
  features: {
    buildStoriesJson: true
  }
};
```

**Environment Variable Needed**:
```bash
STORYBOOK_BASE_PATH=/sdk
```

### 3. General Proxy Integration Problems

Both apps need to be configured to:

1. **Use relative API paths** instead of hardcoded `localhost` URLs
2. **Handle hash routing** correctly when behind a proxy  
3. **Configure asset paths** to work with proxy prefixes
4. **Set up WebSocket connections** to work through proxy for HMR

## Improved Testing Strategy

Our current tests are insufficient. We need to test:

### Functional Tests (Not Just HTTP Status)

```javascript
// Test actual app functionality, not just if it loads
const tests = [
  {
    name: "Impact App Login",
    url: "https://ramileo.ngrok.app/impact/#login",
    expect: "Login form loads and API calls work"
  },
  {
    name: "Storybook Story Loading", 
    url: "https://ramileo.ngrok.app/sdk/?path=/story/container-volunteercard--default",
    expect: "Story renders, assets load, controls work"
  }
];
```

### Asset Loading Tests
```javascript
// Test that critical assets load correctly
const assetTests = [
  "https://ramileo.ngrok.app/impact/static/js/bundle.js",
  "https://ramileo.ngrok.app/sdk/sb-common-assets/fonts.css", 
  "https://ramileo.ngrok.app/sdk/main.*.js" // Dynamic Storybook assets
];
```

### API Connectivity Tests  
```javascript
// Test that apps can reach their APIs through proxy
const apiTests = [
  {
    from: "impact app", 
    to: "/api/health",
    expect: "Should work from browser context"
  }
];
```

## Action Items for App Teams

### Impact App Team:
1. **Update environment variables** to use `/api` instead of `http://localhost:8000`
2. **Test hash routing** works correctly at `https://ramileo.ngrok.app/impact/#volunteer`
3. **Verify API calls** work from tunnel context, not just localhost

### SDK Team:  
1. **Configure Storybook** for sub-path deployment with base href
2. **Add environment variable** support for `STORYBOOK_BASE_PATH=/sdk`
3. **Test specific stories** load correctly through tunnel

### Proxy Team (Us):
1. **Enhance testing** to catch these functional issues
2. **Document app configuration requirements** clearly
3. **Provide better debugging tools** for app teams

## Testing Commands to Verify Fixes

```bash
# Test Impact app functionality
curl -s "https://ramileo.ngrok.app/impact/" | grep -E "api|localhost"

# Test Storybook functionality  
curl -s "https://ramileo.ngrok.app/sdk/?path=/story/container-volunteercard--default" | grep -E "story|error"

# Test API connectivity from tunnel
curl -s "https://ramileo.ngrok.app/api/health"
```

These issues are **app configuration problems**, not proxy infrastructure problems. The proxy is working correctly - the apps just aren't configured to work behind a proxy.
