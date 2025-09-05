# MXTK Dependency Issue - Not Proxy Related

## Problem Summary
MXTK site is returning HTTP 500 errors through the proxy, but this is **NOT a proxy configuration issue**.

## Root Cause
The MXTK Next.js application is missing the `react-markdown` dependency in its running container.

**Error from Next.js:**
```
Module not found: Can't resolve 'react-markdown'
  5 | import { getApiPath } from '@/lib/basepath';
  6 | import { useCallback, useEffect, useState } from 'react';
> 7 | import ReactMarkdown from 'react-markdown';
    | ^
  8 | import remarkGfm from 'remark-gfm';
```

**Import trace:**
- `./components/ai/GuideDrawer.tsx`
- `./components/ai/GuideHost.tsx`

## What Happened
1. MXTK team added new code that imports `react-markdown`
2. The dependency wasn't installed or the container wasn't restarted
3. Next.js development server is failing to build/serve pages
4. This causes HTTP 500 responses for all routes

## Proxy Status
✅ **Proxy configuration is working correctly**
- All nginx routing is functional
- Headers and forwarding are correct
- The 500 errors are coming from the MXTK app, not the proxy

## Solution for MXTK Team

### Option 1: Restart Container with Dependencies
```bash
# In the MXTK project directory
docker-compose down
docker-compose up --build  # Rebuild to include new dependencies
```

### Option 2: Install Missing Dependencies in Running Container
```bash
# Access the running container
docker exec -it mxtk-site-dev-mxtk sh

# Install the missing dependency
pnpm add react-markdown

# Or if it's already in package.json
pnpm install

# Restart the Next.js dev server if needed
```

### Option 3: Check Package.json
Ensure `react-markdown` is added to `package.json` dependencies:
```json
{
  "dependencies": {
    "react-markdown": "^x.x.x"
  }
}
```

## Verification
After fixing the dependency:
1. `http://localhost:2000/mxtk/` should work
2. `https://ramileo.ngrok.app/mxtk/` should work
3. HMR endpoints should stop returning 500 errors

## Key Point
This is a **development environment issue**, not a proxy configuration problem. The proxy team has confirmed that routing, headers, and forwarding are all working correctly.
