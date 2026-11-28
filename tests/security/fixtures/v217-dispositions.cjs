'use strict';

// Classification of the 42 files V216 left blocked. None of these counts as a pass.

const EXECUTED = [
  'test/dashboard-dropdown-bug.test.js',
  'test/unit/route-promotion-filtering.test.js',
];

const PORTED = [
  'test/ui/tests/calliope-chips.spec.ts',
  'test/ui/tests/calliope-toggle.spec.ts',
  'test/ui/tests/calliope-toggle-comprehensive.spec.ts',
  'test/ui/tests/status.spec.ts',
];

const SUPERSEDED = [
  'test/integration/api-reindex.test.js',
  'test/ui/tests/calliope-fixes.spec.ts',
  'test/ui/tests/dashboard-dropdown.spec.ts',
];

function manual(path, originalTests) {
  return {
    path,
    disposition: 'manual',
    originalTests,
    evidence: 'tests/security/fixtures/v217-dispositions.cjs',
    reason: 'Manual script. It is not a test suite and V217 does not point it at the owner.',
  };
}

function capability(path, originalTests, capability) {
  return {
    path,
    disposition: 'capability-blocked',
    capability,
    originalTests,
    evidence: 'tests/security/fixtures/v217-dispositions.cjs',
    reason: `Needs ${capability} V217 does not start that capability and does not use the owner host.`,
  };
}

const BLOCKED = [
  manual('test/browser-console-test.js', ['browser console diagnostic']),
  manual('test/calliope-comprehensive-tests.js', ['calliope comprehensive manual runner']),
  manual('test/calliope-enable-disable-visual-test.js', ['calliope enable and disable visual runner']),
  manual('test/calliope-real-time-ui-test.js', ['calliope real-time UI runner']),
  manual('test/calliope-simple-test.js', ['calliope simple manual runner']),
  manual('test/calliope-ui-interaction-test.js', ['calliope UI interaction runner']),
  manual('test/comprehensive-browser-test.js', ['comprehensive browser runner']),
  capability(
    'test/e2e/nginx-proxy-pass.test.js',
    [
      'should correctly proxy /devproxy/api/apps/install through nginx',
      'should correctly proxy /devproxy/api/ai/reindex through nginx',
      'should correctly proxy /devproxy/api/config/ paths through nginx',
      'should verify nginx config does not have trailing slash on apps proxy_pass',
      'should verify all API proxy_pass directives use deferred DNS resolution',
    ],
    'a disposable nginx process loading the historical dashboard proxy_pass file',
  ),
  capability(
    'test/integration-layout.test.js',
    ['Full User Journey', 'Masonry with View Density', 'Performance & Stability'],
    'an isolated browser session against a disposable status origin',
  ),
  capability(
    'test/integration/api-apps-install.test.js',
    [
      'should require authentication',
      'should install a valid config file',
      'should reject invalid app names',
      'should reject missing name or content',
      'should reject invalid nginx config',
    ],
    'an authenticated disposable config API with a writable fixture spool',
  ),
  {
    path: 'test/integration/api-reindex.test.js',
    disposition: 'superseded',
    originalTests: [
      'should return 503 when OPENAI_API_KEY is not set',
      'should be accessible without authentication (public endpoint)',
      'should return proper response structure when successful',
    ],
    evidence: 'tests/security/fixtures/v217-dispositions.cjs',
    reason: 'Public unauthenticated reindex is refused by the current secure-mode policy. See tests/security/v162-secure-dashboard-truthful-actions.test.cjs.',
  },
  capability(
    'test/layout-responsive.test.js',
    ['Responsive Layout & Masonry', 'Desktop Layout (≥1400px)', 'Tablet/Desktop Layout (900-1399px)'],
    'an isolated browser session that can resize a disposable status origin',
  ),
  manual('test/lyra-auth-test.js', ['lyra auth visual runner']),
  manual('test/mixed-content-test.js', ['mixed-content manual runner']),
  manual('test/nextjs-auth-test.js', ['nextjs auth visual runner']),
  manual('test/quick-calliope-test.js', ['quick calliope manual runner']),
  manual('test/quick-validate-layout.js', ['quick layout validation runner']),
  manual('test/run-calliope-puppeteer.js', ['calliope puppeteer runner']),
  manual('test/run-iterative.js', ['iterative visual runner']),
  manual('test/run.js', ['historical test runner']),
  manual('test/scanApps.js', ['scanApps manual diagnostic']),
  manual('test/site-auditor-test.js', ['site auditor manual runner']),
  manual('test/status-chip-mechanism-test.js', ['status chip mechanism runner']),
  manual('test/status-chip-test.js', ['status chip manual runner']),
  manual('test/status-model.js', ['status model manual script']),
  manual('test/test-calliope-button-behavior.js', ['calliope button behavior runner']),
  manual('test/ui-fixes-verification.js', ['UI fixes verification runner']),
  {
    path: 'test/ui/tests/calliope-chips.spec.ts',
    disposition: 'ported',
    originalTests: ['${url} chips present and styled in ${theme}'],
    evidence: 'tests/security/v217-current-source-ui.test.cjs',
    reason: 'The chip and toggle elements are checked on the current source. Computed styles were not executed and are not a pass.',
  },
  capability(
    'test/ui/tests/calliope-computed-styles.spec.ts',
    ['${url}: toggle behavior and positioning via computed styles'],
    'an isolated browser session that can read computed styles from a disposable origin',
  ),
  {
    path: 'test/ui/tests/calliope-fixes.spec.ts',
    disposition: 'superseded',
    originalTests: [
      'Chat shows user bubble before thinking; renders Markdown; no post-processing rewrite',
      'Health check posts heal:true and thinking bubble appears after ack',
    ],
    evidence: 'tests/security/fixtures/v217-dispositions.cjs',
    reason: 'The spec expects a heal:true post. Secure mode refuses that request. See tests/security/v162-secure-dashboard-truthful-actions.test.cjs.',
  },
  capability(
    'test/ui/tests/calliope-layout.spec.ts',
    ['drawer push + bubbles + buttons on ${url}'],
    'an isolated browser session against a disposable status origin',
  ),
  capability(
    'test/ui/tests/calliope-style-parity.spec.ts',
    ['${url} matches chat/textarea/button styles in ${theme}'],
    'an isolated browser session that can compare computed styles on a disposable origin',
  ),
  {
    path: 'test/ui/tests/calliope-toggle-comprehensive.spec.ts',
    disposition: 'ported',
    originalTests: [
      '${url}: button toggles drawer open/close with correct states',
      '${url}: drawer positioned with 16px gap below header and above viewport bottom',
    ],
    evidence: 'tests/security/v217-current-source-ui.test.cjs',
    reason: 'The toggle, aria-pressed state, and drawer markup are on the current source. Pixel positioning was not executed and is not a pass.',
  },
  {
    path: 'test/ui/tests/calliope-toggle.spec.ts',
    disposition: 'ported',
    originalTests: ['toggle open/close and aria-pressed on ${url}'],
    evidence: 'tests/security/v217-current-source-ui.test.cjs',
    reason: 'The toggle and aria-pressed contract are on the current source. A live click was not executed and is not a pass.',
  },
  {
    path: 'test/ui/tests/dashboard-dropdown.spec.ts',
    disposition: 'superseded',
    originalTests: [
      'should load the dashboard page',
      'should populate all three dropdowns with routes',
      'should have optgroups for config files',
      'should display console logs for debugging',
      'should be able to select a route from dropdown',
    ],
    evidence: 'tests/security/fixtures/v217-dispositions.cjs',
    reason: 'The spec expects Audit + Heal and Advanced Heal controls. Secure mode does not offer them. See tests/security/v162-secure-dashboard-truthful-actions.test.cjs.',
  },
  capability(
    'test/ui/tests/routes-audit-half.spec.ts',
    ['Calliope audits half of discovered routes via Dashboard'],
    'an isolated dashboard origin with disposable route fixtures',
  ),
  {
    path: 'test/ui/tests/status.spec.ts',
    disposition: 'ported',
    originalTests: [
      'renders and shows Calliope, captures console and styles',
      'Clicking stethoscope runs Calliope health when enabled',
    ],
    evidence: 'tests/security/v217-current-source-ui.test.cjs',
    reason: 'The current status document still has the Calliope toggle and drawer. Live console capture was not executed and is not a pass.',
  },
  manual('test/verify-realtime-thoughts.js', ['realtime thoughts manual runner']),
  manual('test/verify-thoughts-pushed.js', ['thoughts pushed manual runner']),
  capability(
    'test/view-density-toggle.test.js',
    ['View Density Toggle', 'Toggle Button', 'Toggle Functionality'],
    'an isolated browser session against a disposable status origin',
  ),
];

module.exports = { EXECUTED, PORTED, SUPERSEDED, BLOCKED };
