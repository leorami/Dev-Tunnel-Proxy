# Layout & View Density Tests

Comprehensive test suite for the responsive layout and view density toggle features implemented in the Dev Tunnel Proxy status page.

## Overview

This test suite validates:
- **Responsive Grid Layout**: 1/2/3 column layouts at different breakpoints
- **View Density Toggle**: Compact/comfortable view switching
- **Masonry Ordering**: Efficient card packing
- **Mobile Optimization**: Single column without overflow
- **Persistence**: LocalStorage integration
- **Accessibility**: Keyboard navigation and ARIA attributes

## Test Files

### Unit Tests

#### `layout-responsive.test.js`
Tests responsive grid behavior across different viewport sizes:
- Desktop (≥1400px): 3 columns
- Tablet (900-1399px): 2 columns  
- Mobile (<900px): 1 column
- Grid configuration (auto-rows, align-items, gaps)
- Masonry card ordering
- No horizontal overflow on mobile

#### `view-density-toggle.test.js`
Tests the compact/comfortable view toggle:
- Button presence and interaction
- Icon changes (⊟ ↔ ⊞)
- CSS class application (`data-view` attribute)
- Visual changes (padding, font sizes, chip sizes)
- LocalStorage persistence
- Restoration on page load
- Edge cases (rapid clicking, theme toggle interaction)

#### `integration-layout.test.js`
End-to-end integration tests:
- Complete user journeys across viewports
- View preference persistence across navigation
- Masonry with view density changes
- Filtering interaction
- Performance under rapid changes
- Accessibility checks
- Browser compatibility (localStorage failures)

### Visual Tests

#### `site-audit-layout.config.json`
Configuration for site-auditor visual regression testing across viewports.

#### `run-layout-tests.sh`
Master test runner that executes all tests in sequence.

## Prerequisites

```bash
# Install dependencies
npm install

# Ensure dev tunnel proxy is running
# The tests expect the server at http://localhost:8080
```

## Running Tests

### Run All Tests
```bash
./test/run-layout-tests.sh
```

### Run Individual Test Suites
```bash
# Responsive layout tests only
npx mocha test/layout-responsive.test.js --reporter spec

# View density toggle tests only
npx mocha test/view-density-toggle.test.js --reporter spec

# Integration tests only
npx mocha test/integration-layout.test.js --reporter spec
```

### Run Visual Audits Only
```bash
cd site-auditor-debug
npm install

# Mobile audit
node dist/cli.js --url http://localhost:8080/status --viewport 400x800 --screenshot

# Tablet audit
node dist/cli.js --url http://localhost:8080/status --viewport 1024x768 --screenshot

# Desktop audit
node dist/cli.js --url http://localhost:8080/status --viewport 1600x1000 --screenshot
```

## Test Coverage

### Responsive Layout
- ✅ Column count at each breakpoint
- ✅ Grid CSS properties (auto-rows, align-items, gap)
- ✅ Dynamic column updates on resize
- ✅ No horizontal overflow on mobile
- ✅ Proper padding/margins at each size
- ✅ Width constraints (100%, max-width)

### View Density Toggle
- ✅ Button presence and accessibility
- ✅ Icon state (⊟ for comfortable, ⊞ for compact)
- ✅ CSS class application on body
- ✅ Visual changes (padding, fonts, chips)
- ✅ LocalStorage save/restore
- ✅ Persistence across page loads
- ✅ Rapid toggle handling
- ✅ No conflicts with other features

### Masonry Layout
- ✅ Card height measurement
- ✅ Shortest-first ordering
- ✅ Reordering on filter/sort
- ✅ Reordering on resize
- ✅ Consistent ordering across view modes

### Integration
- ✅ Complete user workflows
- ✅ Multi-viewport journeys
- ✅ Navigation persistence
- ✅ Filter/sort interaction
- ✅ Performance under stress
- ✅ Keyboard accessibility
- ✅ Graceful degradation

## Expected Results

### Mobile (400x800)
- Single column layout
- No horizontal scroll
- Reduced padding (8px)
- All cards stack vertically
- View toggle works

### Tablet (1024x768)
- Two column layout
- Cards distributed evenly
- Proper gaps between cards
- View toggle works

### Desktop (1600x1000)
- Three column layout
- Masonry ordering (short cards first)
- Efficient space usage
- View toggle works
- Compact mode reduces spacing

## Troubleshooting

### Tests Fail: "Server not running"
Ensure the dev tunnel proxy is running on port 8080:
```bash
docker-compose up -d
# or
npm start
```

### Tests Fail: "Element not found"
The page may be loading slowly. Increase timeout in test files:
```javascript
this.timeout(60000); // Increase from 30000
```

### Visual Audits Fail
Ensure site-auditor-debug is built:
```bash
cd site-auditor-debug
npm install
npm run build
```

### LocalStorage Tests Fail
Some tests intentionally break localStorage to test graceful degradation. This is expected behavior.

## Continuous Integration

To run these tests in CI:

```yaml
# .github/workflows/layout-tests.yml
- name: Start Dev Tunnel Proxy
  run: docker-compose up -d
  
- name: Wait for server
  run: sleep 5
  
- name: Run Layout Tests
  run: ./test/run-layout-tests.sh
  
- name: Upload Screenshots
  uses: actions/upload-artifact@v3
  with:
    name: layout-screenshots
    path: site-auditor-out/
```

## Test Maintenance

When adding new layout features:

1. Add unit tests to appropriate test file
2. Add integration test for user workflow
3. Update visual audit config if needed
4. Update this README with new coverage
5. Run full test suite to ensure no regressions

## Performance Benchmarks

Expected test execution times:
- Unit tests: ~30-45 seconds
- Integration tests: ~45-60 seconds
- Visual audits: ~15-20 seconds
- **Total: ~2-3 minutes**

## Known Issues

1. **Flaky resize tests**: Occasionally fail due to timing. Increase wait times if needed.
2. **Screenshot differences**: Minor pixel differences across environments are normal.
3. **Font rendering**: May vary slightly between OS/browsers in visual tests.

## Contributing

When modifying layout code:
1. Run tests locally first
2. Add tests for new features
3. Ensure all tests pass
4. Include screenshots in PR if visual changes

## References

- [Puppeteer Documentation](https://pptr.dev/)
- [Mocha Test Framework](https://mochajs.org/)
- [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [Responsive Design Principles](https://web.dev/responsive-web-design-basics/)

