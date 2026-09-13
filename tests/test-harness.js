/*
 * Shared harness for tests/engine-tests.js and tests/online-tests.js: both files push into the same
 * results list so tools/run_tests.py sees one combined pass/fail report. Loaded before either test
 * file; the final render happens in tests/engine-tests.html after every test file has run.
 */
(function (root) {
  'use strict';

  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error.message || error) });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function equal(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }

  function render() {
    const list = document.getElementById('list');
    list.innerHTML = results
      .map((r) => `<li class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` - ${r.error}`}</li>`)
      .join('');
    document.getElementById('results').textContent = JSON.stringify({ ok: true, passed: results.every((r) => r.ok), results });
  }

  root.TestHarness = { results, test, assert, equal, render };
})(typeof window !== 'undefined' ? window : globalThis);
