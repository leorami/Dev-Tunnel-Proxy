#!/usr/bin/env node
'use strict';
// Read-only pre-mutation gate for smart-build up|restart|apply.
// Exit 0 = disposable stack may proceed. Exit 2 = blocked. Never prints secrets/paths.
const path = require('node:path');
const { runPremutationGuard } = require('../utils/rc1-release-drift-attest.cjs');

async function main() {
  const action = process.argv[2] || '';
  const rootDir = process.env.ROOT_DIR || path.resolve(__dirname, '..');
  const result = await runPremutationGuard(action, { rootDir, env: process.env });
  const code = result.code || 'EVIDENCE_INCOMPLETE';
  // No env-only allow path. mutationAllowed must stay false for these entrypoints.
  if (result.mutationAllowed === true) {
    process.stderr.write(
      `EVIDENCE_INCOMPLETE: unexpected mutationAllowed=true code=${code} (fail closed)\n`
    );
    process.exit(2);
  }
  process.stderr.write(
    `P0_DRIFT_BLOCKED/guard: ${code}\n` +
      `Ordinary ./smart-build.sh ${action || '(unknown)'} cannot mutate the live stack.\n` +
      `Live RC1 drift or incomplete/non-RC1 evidence must be remediated via an owner-authorized restoration plan.\n` +
      `DEVPROXY_DISPOSABLE_STACK / COMPOSE_PROJECT_NAME / COMPOSE_FILE / DOCKER_HOST never authorize mutations.\n` +
      `Use purpose-built fixture Compose (test-owned names/ports/networks) outside smart-build entrypoints.\n` +
      `Direct docker compose / host restarts bypass this guard — do not use them to “force” a downgrade.\n` +
      `productionChangeAuthorized=false mutationAllowed=false\n`
  );
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`EVIDENCE_INCOMPLETE: guard failed closed (${err && err.message ? 'error' : 'unknown'})\n`);
  process.exit(2);
});
