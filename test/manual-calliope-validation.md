# Manual Calliope Enable/Disable Validation Guide

This guide helps you manually verify that the Calliope enable/disable logic is working correctly.

## Prerequisites

1. Make sure services are running: `docker-compose up -d`
2. Open browser to: `http://localhost:8080/status`
3. Open browser Developer Tools (F12) and go to Console tab

## Test Scenarios

### Scenario 1: With OPENAI_API_KEY (Calliope Enabled)

**Expected Behavior:**
- calliopeEnabled = true
- Recommend buttons: HIDDEN
- Diagnose buttons: Show as "Calliope" buttons, click opens chat drawer
- Calliope chat drawer: FUNCTIONAL

**Manual Steps:**
1. Check API health status:
   ```bash
   curl -s http://localhost:8080/api/ai/health | jq .
   ```
   Should show: `"enabled": true`

2. In browser console, check:
   ```javascript
   document.body.classList.contains('calliope-enabled')
   ```
   Should return: `true`

3. Check recommend buttons visibility:
   ```javascript
   Array.from(document.querySelectorAll('a.btn, button.btn'))
     .filter(el => /Recommend/i.test(el.textContent || ''))
     .map(el => ({ text: el.textContent, display: window.getComputedStyle(el).display }))
   ```
   Should show `display: "none"` for all recommend buttons

4. Check diagnose buttons have correct labels:
   ```javascript
   Array.from(document.querySelectorAll('button, .icon-btn'))
     .filter(el => el.querySelector('img[src*="calliope_heart_stethoscope"]'))
     .map(el => ({ title: el.title, ariaLabel: el.getAttribute('aria-label') }))
   ```
   Should show `title: "Calliope"` and `ariaLabel: "Calliope"`

5. Click a diagnose button (stethoscope icon) → Should open Calliope chat drawer

---

### Scenario 2: Without OPENAI_API_KEY (Calliope Disabled)

**Expected Behavior:**
- calliopeEnabled = false  
- Recommend buttons: VISIBLE
- Diagnose buttons: Show as "Diagnose" buttons, click opens diagnose modal
- Calliope chat drawer: DISABLED

**Manual Steps:**
1. Stop proxy-config-api and restart without API key:
   ```bash
   docker stop dev-proxy-config-api
   docker run -d --rm --name dev-proxy-config-api \
     --network dev-tunnel-proxy_devproxy \
     -v $(pwd):/app \
     -w /app \
     -e NODE_ENV=development \
     node:18-alpine \
     node utils/proxyConfigAPI.js
   ```

2. Refresh browser page and check API health:
   ```bash
   curl -s http://localhost:8080/api/ai/health | jq .
   ```
   Should show: `"enabled": false`

3. In browser console, check:
   ```javascript
   document.body.classList.contains('calliope-enabled')
   ```
   Should return: `false`

4. Check recommend buttons visibility:
   ```javascript
   Array.from(document.querySelectorAll('a.btn, button.btn'))
     .filter(el => /Recommend/i.test(el.textContent || ''))
     .map(el => ({ text: el.textContent, display: window.getComputedStyle(el).display }))
   ```
   Should show `display: ""` or other visible value (not "none")

5. Check diagnose buttons have correct labels:
   ```javascript
   Array.from(document.querySelectorAll('button, .icon-btn'))
     .filter(el => el.querySelector('img[src*="calliope_heart_stethoscope"]'))
     .map(el => ({ title: el.title, ariaLabel: el.getAttribute('aria-label') }))
   ```
   Should show `title: "Diagnose"` and `ariaLabel: "Diagnose"`

6. Click a diagnose button (stethoscope icon) → Should open diagnose modal (NOT chat drawer)

---

### Restore Original Services

After testing, restore the original configuration:
```bash
docker stop dev-proxy-config-api
docker-compose up -d proxy-config-api
```

## Quick Debugging Commands

### Check console logs for toggleCalliopeAffordances
```javascript
// Look for these console messages in the browser:
// "🔧 toggleCalliopeAffordances called with enabled: true/false"
// "🔧 Found X recommend buttons to hide"
```

### Check current state summary
```javascript
// Run this in browser console to get current state:
const enabled = document.body.classList.contains('calliope-enabled');
const recButtons = Array.from(document.querySelectorAll('a.btn, button.btn'))
  .filter(el => /Recommend/i.test(el.textContent || ''));
const diagButtons = Array.from(document.querySelectorAll('button, .icon-btn'))
  .filter(el => el.querySelector('img[src*="calliope_heart_stethoscope"]'));

console.log('Calliope State Summary:');
console.log('======================');
console.log('Enabled:', enabled);
console.log('Recommend buttons found:', recButtons.length);
console.log('Recommend buttons visible:', recButtons.filter(el => window.getComputedStyle(el).display !== 'none').length);
console.log('Diagnose buttons found:', diagButtons.length);
console.log('Diagnose button titles:', diagButtons.map(el => el.title));
```

## Expected Results

| State | API /health | body.calliope-enabled | Recommend Visible | Diagnose Labels | Button Click Action |
|-------|-------------|----------------------|-------------------|-----------------|-------------------|
| With API Key | `enabled: true` | `true` | `false` (hidden) | "Calliope" | Opens chat drawer |
| Without API Key | `enabled: false` | `false` | `true` (visible) | "Diagnose" | Opens diagnose modal |
