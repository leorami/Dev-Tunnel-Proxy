# Calliope App-Level Diagnosis ✅

## New Capability

Calliope can now **detect and diagnose app-level configuration issues** that are outside of proxy scope, and provide specific recommendations for fixing them.

---

## Next.js Auth Errors Detection

### Pattern Added to Knowledge Base

**ID**: `nextjs_auth_errors`

**Detection Signals**:
```regex
\[next-auth\]\[error\]\[CLIENT_FETCH_ERROR\]
Unexpected token '<', "<!DOCTYPE "
/api/auth/session.*not valid JSON
POST.*\/api\/auth\/_log.*500
next-auth.*errors#client_fetch_error
```

**Effects**:
- Auth endpoints return HTML instead of JSON
- Session management fails
- Auth logging returns 500 errors
- User authentication broken

---

## What Calliope Will Do

When she detects these errors in browser console or audit reports:

### 1. **Acknowledge the Issue**
```
I see Next.js auth errors! These are app-level config issues 🔍
```

### 2. **Explain What's Wrong**
- "/api/auth/session is returning HTML instead of JSON"
- "This usually means next-auth isn't properly configured"
- "The auth handler needs to be set up with the correct basePath"

### 3. **Provide Specific Recommendations**

**Required fixes in the Next.js app:**

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"

export const GET = NextAuth({
  providers: [...],
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ? 
    `${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth` : 
    "/api/auth",
})
export const POST = GET
```

**Environment variables needed:**
```bash
NEXTAUTH_URL=https://your-domain.ngrok.app/lyra
NEXTAUTH_SECRET=your-secret-here
```

### 4. **Offer to Help Review Configs**
```
Would you like to paste your next-auth config? I can help identify what needs to be fixed! 📋
```

### 5. **Be Clear About Scope**
```
I can fix proxy issues, but this needs changes in your app code. Happy to review configs though!
```

---

## Enhanced System Prompt

Calliope's system prompt now includes:

**NEXT.JS AUTH ERRORS - APP-LEVEL DIAGNOSIS:**
- Detection patterns for common auth errors
- Diagnosis protocol with specific steps
- Code examples for fixes
- Clear distinction between proxy issues (she can fix) and app issues (she can guide)
- Invitation to review user's configs

---

## Enhanced Audit Analysis

The `auditAndHealRoute` function now:

1. **Parses console errors** from audit reports
2. **Detects Next.js auth patterns** in error messages
3. **Emits app_level_issue_detected** event when found
4. **Doesn't attempt to heal** auth errors (they're app-side)
5. **Continues auditing** other issues

**Code Added** (lines 1334-1349 in `calliopeHealing.js`):
```javascript
// Check for Next.js auth errors (app-level, not proxy)
const authErrors = [
  ...consoleErrors.filter(e => 
    e.text && (
      /\[next-auth\].*CLIENT_FETCH_ERROR/.test(e.text) ||
      /Unexpected token '<'.*<!DOCTYPE/.test(e.text) ||
      /\/api\/auth\/_log.*500/.test(e.text)
    )
  ),
  ...pageErrors.filter(e => 
    typeof e === 'string' && /next-auth|auth.*session|auth.*JSON/.test(e)
  )
];

if (authErrors.length > 0) {
  emit({ 
    name: 'app_level_issue_detected', 
    message: '⚠️ Detected Next.js auth configuration errors - these are app-level issues', 
    authErrors: authErrors.length 
  });
}
```

---

## Example Interaction

### User:
```
/lyra is hurting. please fix it

Browser console shows:
[next-auth][error][CLIENT_FETCH_ERROR]
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
POST /api/auth/_log 500
```

### Calliope's Response:
```
🩺✨ Taking a peek and patching things up…

Auditing pass 1 for https://ramileo.ngrok.app/lyra...

⚠️ Detected Next.js auth configuration errors - these are app-level issues

I see Next.js auth errors! These are app-level config issues, not proxy issues 🔍

**What's wrong:**
Your /api/auth/session endpoint is returning HTML instead of JSON. This means 
next-auth isn't properly configured for your subpath deployment.

**Required fixes in your Next.js app:**

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth"

export const GET = NextAuth({
  providers: [
    // your providers here
  ],
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ? 
    `${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth` : 
    "/api/auth",
})
export const POST = GET
```

**Environment variables needed:**
```bash
NEXTAUTH_URL=https://ramileo.ngrok.app/lyra
NEXTAUTH_SECRET=your-secret-key-here
NEXT_PUBLIC_BASE_PATH=/lyra
```

Would you like to paste your current next-auth config? I can help identify 
exactly what needs to change! 📋

Note: I can fix proxy-level issues, but this needs changes in your app code. 
The proxy configuration looks good - your assets are loading correctly!
```

---

## Benefits

### ✅ **Clear Diagnosis**
- Calliope distinguishes between proxy issues and app issues
- Users know exactly what type of problem they're facing

### ✅ **Actionable Recommendations**
- Specific code snippets to fix the issue
- No vague "check your config" - exact changes needed

### ✅ **Scope Clarity**
- Users understand what Calliope can fix vs. what needs app changes
- She still offers to help review configs

### ✅ **No False Healing**
- Calliope won't waste time trying to "heal" app-level issues
- Focuses on what she can actually fix

---

## Files Modified

### 1. `utils/calliopeHealing.js`

**Lines 247-271**: Added `nextjs_auth_errors` pattern to knowledge base
```javascript
if (!have.has('nextjs_auth_errors')) {
  seed.push({
    id: 'nextjs_auth_errors',
    detection: {
      signals: [
        String.raw`\[next-auth\]\[error\]\[CLIENT_FETCH_ERROR\]`,
        String.raw`Unexpected token '<', "<!DOCTYPE "`,
        String.raw`/api/auth/session.*not valid JSON`,
        String.raw`POST.*\/api\/auth\/_log.*500`,
        String.raw`next-auth.*errors#client_fetch_error`
      ],
      effects: [
        'Auth endpoints return HTML instead of JSON',
        'Session management fails',
        'Auth logging returns 500 errors',
        'User authentication broken'
      ]
    },
    solutions: [{
      id: 'diagnose_nextjs_auth',
      description: 'App-level Next.js auth configuration issue - recommend config fixes',
      implementation: { type: 'recommendation', guidance: 'Next.js Auth Configuration Issues Detected' }
    }]
  });
}
```

**Lines 1334-1349**: Enhanced audit report parsing to detect auth errors
```javascript
const authErrors = [
  ...consoleErrors.filter(e => 
    e.text && (
      /\[next-auth\].*CLIENT_FETCH_ERROR/.test(e.text) ||
      /Unexpected token '<'.*<!DOCTYPE/.test(e.text) ||
      /\/api\/auth\/_log.*500/.test(e.text)
    )
  ),
  ...pageErrors.filter(e => 
    typeof e === 'string' && /next-auth|auth.*session|auth.*JSON/.test(e)
  )
];

if (authErrors.length > 0) {
  emit({ 
    name: 'app_level_issue_detected', 
    message: '⚠️ Detected Next.js auth configuration errors - these are app-level issues', 
    authErrors: authErrors.length 
  });
}
```

### 2. `utils/proxyConfigAPI.js`

**Lines 1583-1614**: Added Next.js auth diagnosis protocol to system prompt
```javascript
NEXT.JS AUTH ERRORS - APP-LEVEL DIAGNOSIS:
When you see errors like:
- "[next-auth][error][CLIENT_FETCH_ERROR]"
- "Unexpected token '<', \"<!DOCTYPE\" ... is not valid JSON"
- "POST /api/auth/_log 500 (Internal Server Error)"

THIS IS AN APP-LEVEL CONFIG ISSUE, NOT A PROXY ISSUE!

DIAGNOSIS PROTOCOL:
1. Acknowledge: "I see Next.js auth errors! These are app-level config issues 🔍"
2. Explain what's wrong
3. Provide SPECIFIC recommendations with code examples
4. OFFER TO HELP: "Would you like to paste your next-auth config?"
5. Be clear about scope: "I can fix proxy issues, but this needs app code changes"
```

---

## Testing Recommendations

### Test with Calliope:

1. **Visit**: `https://ramileo.ngrok.app/status`
2. **Ask**: "/lyra has auth errors. Here's what I see: [paste console errors]"
3. **Expected**: Calliope should:
   - Identify the errors as app-level
   - Provide specific next-auth config fixes
   - Offer to review your config if you paste it
   - Clarify she can't fix app code but can guide

### Verify Pattern Detection:

```bash
# Check that pattern is loaded
curl -s http://localhost:3001/api/ai/health | jq '.patterns[] | select(.id == "nextjs_auth_errors")'
```

---

## Future Enhancements

### Additional App-Level Patterns to Add:

1. **Database connection errors**
   - "ECONNREFUSED" to database
   - "Authentication failed" for Prisma/TypeORM

2. **Environment variable issues**
   - Missing required env vars
   - Invalid API keys

3. **Build configuration problems**
   - Missing dependencies
   - TypeScript compilation errors

4. **CORS issues**
   - Cross-origin blocked requests
   - Missing CORS headers

---

## Conclusion

**Calliope is now a better diagnostician!** 🔍

She can:
- ✅ Detect app-level configuration issues
- ✅ Distinguish between proxy and app problems
- ✅ Provide specific, actionable recommendations
- ✅ Offer to review user's config files
- ✅ Give exact code snippets for fixes
- ✅ Know her scope and be honest about it

This makes her more helpful for developers working with complex frameworks like Next.js that require specific configuration when deployed behind a proxy.

---

**Implementation Date**: October 26, 2025  
**New Capability**: App-level diagnosis with specific recommendations  
**Status**: ✅ COMPLETE - Calliope can now diagnose and guide on app issues

