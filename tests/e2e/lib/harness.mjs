// Minimal test collector and runner. package.json's devDependencies has
// `playwright` (the core automation library) but not `@playwright/test`
// (the test-runner package with its own test()/expect()/config format),
// so this suite cannot use the @playwright/test runner without adding a
// new dependency, which is out of scope (task instruction: do not edit
// package.json). This harness plays the same role at a much smaller
// scale: register named async tests, run them in order, and classify
// each outcome as PASS, FAIL, or NOT RUN.
//
// A test function returns one of:
//   - anything else (including undefined): PASS, that return value is
//     recorded as `detail`.
//   - the object returned by skip(reason): NOT RUN, with that reason.
//   - it throws: FAIL, with the error message as `reason`.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function skip(reason) {
  return { __notRun: true, reason };
}

export async function runAll() {
  const results = [];
  for (const t of tests) {
    const startedAt = Date.now();
    try {
      const outcome = await t.fn();
      const ms = Date.now() - startedAt;
      if (outcome && outcome.__notRun) {
        results.push({ name: t.name, status: 'NOT RUN', reason: outcome.reason, ms });
      } else {
        results.push({ name: t.name, status: 'PASS', detail: outcome, ms });
      }
    } catch (err) {
      const ms = Date.now() - startedAt;
      results.push({ name: t.name, status: 'FAIL', reason: err && err.message ? err.message : String(err), ms });
    }
  }
  return results;
}

export function clearTests() {
  tests.length = 0;
}

export function formatResults(results) {
  const lines = [];
  for (const r of results) {
    const detailText = r.detail !== undefined ? ` detail=${JSON.stringify(r.detail)}` : '';
    const reasonText = r.reason ? ` reason=${r.reason}` : '';
    lines.push(`[${r.status}] ${r.name} (${r.ms}ms)${detailText}${reasonText}`);
  }
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const notRun = results.filter((r) => r.status === 'NOT RUN').length;
  lines.push('');
  lines.push(
    `collected=${results.length} passed=${passed} failed=${failed} not_run=${notRun}`,
  );
  return lines.join('\n');
}
