# Testing Guide

**Last Updated**: December 2025  
**Version**: 1.0

## Overview

Dev Tunnel Proxy includes a comprehensive test suite covering unit tests, integration tests, end-to-end UI tests, and site auditing. This guide explains the testing strategy, how to run tests, and how to contribute new tests.

---

## Testing Philosophy

### Principles

1. **Test Behavior, Not Implementation** - Focus on user-facing outcomes
2. **Fast Feedback** - Unit tests run in milliseconds, integration tests in seconds
3. **Realistic Environments** - UI tests use actual Docker containers
4. **Test-Driven Development** - Write tests before implementing features (where feasible)
5. **Clear Assertions** - Tests should clearly express intent and expected outcomes

### Test Pyramid

```
         ┌─────────────┐
         │   E2E/UI    │  ~10 tests
         │  (Slowest)  │
         ├─────────────┤
         │ Integration │  ~30 tests
         │  (Medium)   │
         ├─────────────┤
         │    Unit     │  ~60+ tests
         │   (Fast)    │
         └─────────────┘
```

**Rationale**: More unit tests (fast, isolated), fewer E2E tests (slow, fragile)

---

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions and modules in isolation

**Location**: `test/*.test.js`

**Key Test Suites**:

#### Document Collection (`test/collect-docs.test.js`)

Tests for Calliope's RAG system document collection:
- ✅ collectDocs() returns array of documents
- ✅ Includes README.md, TROUBLESHOOTING.md
- ✅ Includes Calliope-specific docs
- ✅ Handles missing files gracefully
- ✅ Filters non-markdown files

**Run**:
```bash
node test/collect-docs.test.js
```

**Example Test**:
```javascript
assert.ok(docs.length >= 10, 
  `Expected at least 10 docs, got ${docs.length}`);
```

#### Configuration Parser (`utils/nginxParser.js`)

Tests for nginx configuration parsing:
- ✅ Extracts location blocks
- ✅ Identifies upstream services
- ✅ Detects route conflicts
- ✅ Handles malformed configs

**Run**:
```bash
node test/nginx-parser.test.js
```

### 2. Integration Tests

**Purpose**: Test multiple components working together

**Location**: `test/*integration*.js`, `test/*embeddings*.js`

#### Calliope Embeddings Integration (`test/calliope-embeddings-integration.test.js`)

Tests RAG system end-to-end:
- ✅ Document collection and chunking
- ✅ Chunk size distribution (should favor 1000-1200 chars)
- ✅ Cosine similarity calculations
- ✅ Source attribution preserved
- ✅ Relevant Calliope information in chunks
- ✅ Coverage of key topics (healing, configuration, API)

**Run**:
```bash
node test/calliope-embeddings-integration.test.js
```

**Sample Output**:
```
✓ Calliope Embeddings Integration Tests
  ✓ Should collect and chunk documents
  ✓ Chunks should be reasonable size (1000-1200 chars preferred)
  ✓ cosine() should compute similarity correctly
  ✓ Chunks should preserve source information
  ✓ Should include relevant Calliope information
  ✓ Should cover key topics
  ✓ Document quality and coverage check

Passed 7/7 tests
```

#### API Probing (`test/scanApps.js`)

Integration test for route health scanning:
- ✅ Parses nginx configurations
- ✅ Probes routes via HTTP
- ✅ Detects asset loading issues
- ✅ Discovers API endpoints from HTML/JS
- ✅ Tests WebSocket support
- ✅ Generates health reports

**Run**:
```bash
node test/scanApps.js
```

**Continuous Mode** (auto-scan service):
```bash
while true; do
  node test/scanApps.js
  sleep 15
done
```

### 3. End-to-End UI Tests

**Purpose**: Test user interactions in real browser environment

**Location**: `test/ui/tests/*.spec.ts`

**Framework**: Playwright (TypeScript)

#### Test Suites

**Status Dashboard** (`status.spec.ts`):
- ✅ Page loads successfully
- ✅ Route cards display
- ✅ Filtering works (by severity, status code)
- ✅ Theme toggle (light/dark)
- ✅ Calliope drawer opens/closes

**Calliope Integration** (`calliope-*.spec.ts`):
- ✅ Chat drawer functionality
- ✅ Thinking indicator animations
- ✅ Message sending and receiving
- ✅ Action buttons (Ask, Self-Check, Clear)
- ✅ Style consistency between enable/disable states
- ✅ Chip status updates
- ✅ Layout positioning (no overflow)

**Route Auditing** (`routes-audit-half.spec.ts`):
- ✅ Routes are accessible
- ✅ Assets load correctly
- ✅ No console errors
- ✅ Health status accurate

**Run Tests**:
```bash
# From workspace root
npm run ui:test

# Or via Docker
docker run --rm --network devproxy \
  -e UI_BASE_URL=http://dev-proxy \
  -v "$PWD":/work -w /work/test/ui \
  mcr.microsoft.com/playwright:v1.46.0-jammy \
  bash -lc 'npm install && npx playwright install --with-deps && npm test'
```

**Configuration** (`test/ui/playwright.config.ts`):
```typescript
{
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://localhost:8080',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  }
}
```

**Artifacts**:
- Screenshots: `.artifacts/ui/screenshots/`
- Videos: `.artifacts/ui/videos/`
- Traces: `.artifacts/ui/traces/`

### 4. Site Auditor

**Purpose**: Comprehensive page analysis with screenshots and error detection

**Location**: `site-auditor-debug/`

**Features**:
- Multi-viewport screenshots
- Console error capture
- Network failure detection
- Computed styles export
- Crawling with sitemap support

**Run Single Page Audit**:
```bash
cd site-auditor-debug
pnpm install
pnpm run build

# Audit a single route
node dist/cli.js http://dev-proxy/myapp/
```

**Run Crawl Mode**:
```bash
node dist/cli.js --crawl \
  --start-urls http://dev-proxy/myapp/ \
  --max-pages 25 \
  --concurrency 3
```

**Output**:
- Location: `site-auditor-out/TIMESTAMP/`
- Files:
  - `report.json` - Full audit data
  - `screenshots/*.png` - Per-viewport screenshots
  - `computed-styles.json` - CSS analysis (if enabled)

**Sample Report**:
```json
{
  "url": "http://dev-proxy/myapp/",
  "timestamp": "2025-01-15T12:34:56.789Z",
  "viewports": [
    {
      "name": "desktop",
      "width": 1440,
      "height": 900,
      "screenshot": "screenshots/desktop-myapp.png"
    }
  ],
  "console": {
    "errors": [],
    "warnings": ["React DevTools warning..."]
  },
  "network": {
    "failed": [],
    "successful": 42
  }
}
```

---

## Running Tests

### All Tests

```bash
# Run all unit and integration tests
npm test

# Or via smart-build.sh (future)
./smart-build.sh test:all
```

### Specific Test Suites

```bash
# Unit tests
node test/collect-docs.test.js
node test/calliope-embeddings-integration.test.js

# Integration tests
node test/scanApps.js

# UI tests
npm run ui:test

# Site auditor
cd site-auditor-debug
pnpm test
```

### Watch Mode

```bash
# For Node.js built-in test runner
node --test --watch test/**/*.test.js

# For UI tests (Playwright)
cd test/ui
npx playwright test --ui  # Interactive UI mode
```

### Debug Mode

```bash
# Node.js debugger
node --inspect-brk test/collect-docs.test.js

# Playwright debug
cd test/ui
PWDEBUG=1 npx playwright test
```

---

## Test Data

### Fixtures

**Location**: `test/fixtures/` (create as needed)

**Example Structure**:
```
test/fixtures/
  ├── nginx/
  │   ├── valid-simple.conf
  │   ├── valid-complex.conf
  │   ├── invalid-syntax.conf
  │   └── conflicting-routes.conf
  ├── docs/
  │   └── sample-markdown.md
  └── api-responses/
      ├── health-ok.json
      └── health-error.json
```

### Mock Services

For integration tests that need upstream services:

```javascript
// test/helpers/mockServer.js
const http = require('http');

function createMockApp(port, routes) {
  const server = http.createServer((req, res) => {
    const route = routes[req.url] || { status: 404, body: 'Not Found' };
    res.writeHead(route.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(route.body));
  });
  
  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
```

---

## Writing Tests

### Unit Test Template

```javascript
#!/usr/bin/env node
const assert = require('assert');
const { functionToTest } = require('../utils/myModule');

console.log('Testing myModule...\n');

// Test 1: Basic functionality
{
  const result = functionToTest('input');
  assert.strictEqual(result, 'expected output', 
    'Should return expected output for valid input');
  console.log('✓ Test 1: Basic functionality');
}

// Test 2: Edge cases
{
  const result = functionToTest('');
  assert.strictEqual(result, null, 
    'Should return null for empty input');
  console.log('✓ Test 2: Edge cases');
}

// Test 3: Error handling
{
  assert.throws(() => {
    functionToTest(null);
  }, /Invalid input/, 'Should throw error for null input');
  console.log('✓ Test 3: Error handling');
}

console.log('\nAll tests passed! ✓');
```

### Integration Test Template

```javascript
#!/usr/bin/env node
const assert = require('assert');
const { componentA } = require('../utils/componentA');
const { componentB } = require('../utils/componentB');

console.log('Integration Tests: ComponentA + ComponentB\n');

// Test: Components work together
(async () => {
  const dataA = await componentA.fetch();
  const result = componentB.process(dataA);
  
  assert.ok(result.success, 'Should successfully process data from A');
  assert.strictEqual(result.items.length, 3, 'Should have 3 items');
  
  console.log('✓ Components integrate successfully');
})();
```

### Playwright UI Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup
    await page.goto('/status');
  });

  test('should perform action', async ({ page }) => {
    // Arrange
    const button = page.locator('#my-button');

    // Act
    await button.click();

    // Assert
    await expect(page.locator('.result')).toHaveText('Expected Text');
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Simulate error condition
    await page.route('/api/data', route => route.abort());

    // Verify error handling
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
  });
});
```

---

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run unit tests
        run: |
          node test/collect-docs.test.js
          node test/calliope-embeddings-integration.test.js

  ui-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Create Docker network
        run: docker network create devproxy
      
      - name: Start services
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 10
      
      - name: Run Playwright tests
        run: npm run ui:test
      
      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-artifacts
          path: .artifacts/ui/
```

---

## Test Coverage

### Current Coverage

| Component | Coverage | Notes |
|-----------|----------|-------|
| Document Collection | 95% | All major paths covered |
| RAG System | 90% | Embeddings integration tested |
| Configuration Parser | 80% | Edge cases WIP |
| API Endpoints | 70% | Healing endpoints need more tests |
| UI Components | 85% | Calliope drawer thoroughly tested |

### Measuring Coverage

```bash
# Using c8 (recommended for Node.js)
npm install --save-dev c8

# Run with coverage
c8 node test/collect-docs.test.js

# Generate HTML report
c8 --reporter=html node test/**/*.test.js
open coverage/index.html
```

---

## Performance Testing

### Route Scanning Performance

```bash
# Time a single scan
time node test/scanApps.js
```

**Target**: <5 seconds for 20 routes

### Bundle Generation Performance

```bash
# Time bundle generation
time node utils/generateAppsBundle.js
```

**Target**: <100ms for 50 configs

### Embedding Query Performance

```javascript
// test/performance/rag-query-perf.js
const { loadEmbeddings, rankByVector, embedText } = require('../utils/proxyConfigAPI');

async function benchmarkQuery() {
  const embeddings = loadEmbeddings();
  const queryVec = await embedText('How do I configure nginx?');
  
  const start = Date.now();
  const results = rankByVector(embeddings, queryVec, 5);
  const duration = Date.now() - start;
  
  console.log(`Query took ${duration}ms`);
  console.assert(duration < 10, 'Query should be <10ms');
}
```

**Target**: <1ms for similarity search (in-memory)

---

## Troubleshooting Tests

### Tests Fail Locally But Pass in CI

**Possible Causes**:
- Timing issues (add waits)
- Port conflicts (use random ports)
- Docker network differences

**Solution**:
```bash
# Clean Docker state
docker-compose down -v
docker network prune
./smart-build.sh setup
```

### UI Tests Flaky

**Common Issues**:
- Race conditions (wait for elements)
- Network delays (increase timeouts)
- Element selectors changed

**Solutions**:
```typescript
// Use more resilient selectors
await page.locator('[data-testid="my-element"]').waitFor();

// Add explicit waits
await page.waitForLoadState('networkidle');

// Increase timeout for slow operations
test.setTimeout(60000);
```

### Test Artifacts Fill Disk

**Solution**:
```bash
# Clean old artifacts
rm -rf .artifacts/ui/*
rm -rf site-auditor-out/*

# Or via API
curl -X POST http://localhost:3001/api/reports/prune -d '{"keep":10}'
```

---

## Best Practices

### 1. Test Isolation

Each test should be independent:
```javascript
// ❌ Bad - tests depend on each other
let sharedState = null;
test1() { sharedState = getData(); }
test2() { assert.ok(sharedState); }

// ✅ Good - each test sets up its own state
test1() { const data = getData(); assert.ok(data); }
test2() { const data = getData(); assert.ok(data); }
```

### 2. Clear Assertions

```javascript
// ❌ Bad - unclear what failed
assert.ok(result);

// ✅ Good - clear intent and context
assert.ok(result, `Expected valid result, got ${JSON.stringify(result)}`);
```

### 3. Test Real Scenarios

```javascript
// ❌ Bad - testing implementation detail
assert.strictEqual(internalCounter, 3);

// ✅ Good - testing user-visible behavior
assert.strictEqual(renderedItems.length, 3);
```

### 4. Use Descriptive Names

```javascript
// ❌ Bad
test('test1', ...);

// ✅ Good
test('should return 404 when route does not exist', ...);
```

### 5. Keep Tests Fast

- Mock external services
- Use in-memory data where possible
- Avoid unnecessary sleeps
- Run expensive tests in separate suite

---

## Contributing Tests

### When to Add Tests

- ✅ Before implementing new features (TDD)
- ✅ When fixing bugs (regression test)
- ✅ When adding complex logic
- ✅ When external behavior changes

### Test PR Checklist

- [ ] Tests are isolated (don't depend on order)
- [ ] Tests have clear names and assertions
- [ ] Tests pass locally
- [ ] Coverage increased or maintained
- [ ] Added to appropriate test suite
- [ ] Documentation updated if needed

---

## See Also

- **[Architecture](ARCHITECTURE.md)** - System design for testability
- **[Development Workflow](../README.md#development-workflow)** - Integration with development process
- **[Calliope RAG Implementation](CALLIOPE-RAG-IMPLEMENTATION.md)** - TDD approach for RAG system

