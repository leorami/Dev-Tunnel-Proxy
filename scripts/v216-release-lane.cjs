'use strict';

// Runs one release lane from tests/release-lanes.json.
// Each file is its own process, with its own HOME and TMPDIR.
// The nginx lane refuses to start anywhere except hosted CI.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LANES = ['pure-node', 'nginx-fixture', 'libsignal-native', 'browser', 'blocked-capability'];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function summary(text) {
  const counts = {};
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/);
    if (match) counts[match[1]] = Number(match[2]);
  }
  if (!Number.isInteger(counts.tests) || counts.tests < 1) return null;
  for (const key of ['pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    if (!Number.isInteger(counts[key])) return null;
  }
  const bad = counts.fail + counts.cancelled + counts.skipped + counts.todo;
  return { ...counts, strict: bad === 0 && counts.pass === counts.tests };
}

function pythonSummary(text, status, error) {
  const ran = [...text.matchAll(/^Ran (\d+) tests?\b/gm)];
  const tests = ran.length ? Number(ran[ran.length - 1][1]) : null;
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const verdict = [...lines].reverse().find((line) => line === 'OK' || line.startsWith('OK (') || line.startsWith('FAILED'));
  const counts = {};
  if (verdict) {
    for (const match of verdict.matchAll(/([a-z][a-z ]*?)=(\d+)/g)) counts[match[1]] = Number(match[2]);
  }
  const failures = counts.failures || 0;
  const errors = counts.errors || 0;
  const skipped = counts.skipped || 0;
  const expected = counts['expected failures'] || 0;
  const unexpected = counts['unexpected successes'] || 0;
  const failedLine = verdict ? verdict.startsWith('FAILED') : false;
  const ok = !error && status === 0 && verdict && !failedLine && tests >= 1
    && failures === 0 && errors === 0 && skipped === 0 && expected === 0 && unexpected === 0;
  if (ok) {
    return { tests, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0, strict: true };
  }
  const fail = failures + errors + unexpected;
  const known = tests == null ? 0 : tests;
  return {
    tests: known,
    pass: 0,
    fail,
    cancelled: 0,
    skipped,
    todo: expected,
    strict: false,
  };
}

function emit(totals) {
  console.log(`# tests ${totals.tests}`);
  console.log(`# pass ${totals.pass}`);
  console.log(`# fail ${totals.fail}`);
  console.log(`# cancelled ${totals.cancelled}`);
  console.log(`# skipped ${totals.skipped}`);
  console.log(`# todo ${totals.todo}`);
}

function runFile(file) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'v216-home-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v216-tmp-'));
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: tmp,
    LANG: process.env.LANG || 'C',
    NODE_PATH: process.env.NODE_PATH || '',
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
      || path.join(process.env.HOME || os.homedir(), '.cache', 'ms-playwright'),
  };
  for (const key of ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'RUNNER_TEMP', 'CI']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('V192_') && value) env[key] = value;
  }
  let command = process.execPath;
  let args = ['--test', '--test-timeout=180000', path.join(ROOT, file)];
  if (file.endsWith('.py')) {
    command = 'python3';
    args = ['-m', 'unittest', file.replace(/\//g, '.').replace(/\.py$/, '')];
    env.PYTHONPATH = ROOT;
  }
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 190000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.error) console.error(`${file} ${result.error.code || result.error.message}`);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (file.endsWith('.py')) {
    return pythonSummary(output, result.status, result.error);
  }
  const parsed = summary(output);
  if (!parsed || result.status !== 0 || result.signal) {
    return {
      tests: parsed ? parsed.tests : 1,
      pass: parsed ? parsed.pass : 0,
      fail: parsed ? Math.max(parsed.fail, 1) : 1,
      cancelled: parsed ? parsed.cancelled : (result.signal ? 1 : 0),
      skipped: parsed ? parsed.skipped : 0,
      todo: parsed ? parsed.todo : 0,
      strict: false,
    };
  }
  return parsed;
}

function main() {
  const lane = arg('--lane');
  const shard = Number(arg('--shard', '0'));
  const shards = Number(arg('--shards', '1'));
  if (!LANES.includes(lane) || !Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shard < 0 || shard >= shards) {
    throw new Error('usage: --lane pure-node|nginx-fixture|libsignal-native|browser|blocked-capability [--shard N --shards N]');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/release-lanes.json'), 'utf8'));
  if (lane === 'blocked-capability') {
    const entries = manifest.lanes[lane];
    console.log(`BLOCKED_CAPABILITY count=${entries.length}`);
    console.log('These files were not executed. A blocked file is not a pass.');
    for (const entry of entries) {
      if (!entry.reason || !entry.disposition || !entry.evidence) throw new Error(`missing disposition ${entry.path}`);
      console.log(`${entry.path} ${entry.disposition} ${entry.reason}`);
    }
    return;
  }
  if (lane === 'nginx-fixture' && (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted')) {
    throw new Error('RELEASE_FIXTURE_REQUIRES_ISOLATED_HOSTED_CI');
  }
  const files = manifest.lanes[lane].filter((_, index) => index % shards === shard);
  const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  let badFile = false;
  for (const file of files) {
    console.log(`\n# lane ${lane} file ${file}`);
    const result = runFile(file);
    if (!result.strict) {
      badFile = true;
      console.error(`LANE_FILE_NOT_STRICT ${file}`);
    }
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  if (files.length === 0) throw new Error(`lane ${lane} shard ${shard} has no files`);
  emit(totals);
  if (badFile || totals.fail || totals.cancelled || totals.skipped || totals.todo || totals.pass !== totals.tests) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { runFile, summary };
