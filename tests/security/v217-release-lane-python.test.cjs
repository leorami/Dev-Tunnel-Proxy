'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runFile } = require('../../scripts/v216-release-lane.cjs');

test('a python process that ran zero tests is not a pass', () => {
  const result = runFile('tests/security/fixtures/v217_ran_zero.py');
  assert.equal(result.tests, 0);
  assert.equal(result.pass, 0);
  assert.equal(result.strict, false);
});

test('Ran 0 tests followed by OK and exit 0 is not a pass', () => {
  const result = runFile('tests/security/fixtures/v217_ran_zero_ok.py');
  assert.equal(result.tests, 0);
  assert.equal(result.pass, 0);
  assert.equal(result.fail, 0);
  assert.equal(result.strict, false);
});

test('python totals are the real unittest counts', () => {
  const result = runFile('tests/security/fixtures/v217_two_ok.py');
  assert.equal(result.tests, 2);
  assert.equal(result.pass, 2);
  assert.equal(result.fail, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.todo, 0);
  assert.equal(result.strict, true);
});

test('a python skip is counted and is not turned into a failure or a pass', () => {
  const result = runFile('tests/security/fixtures/v217_one_skip.py');
  assert.equal(result.tests, 1);
  assert.equal(result.pass, 0);
  assert.equal(result.fail, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.strict, false);
});
