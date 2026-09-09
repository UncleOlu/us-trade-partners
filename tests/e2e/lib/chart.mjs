// Recharts point-count helper for the partner trend chart
// (src/pages/PartnerPage.tsx: three <Line dataKey="imports"|"exports"|
// "balance"> inside one <LineChart>, connectNulls={false}, so a year
// whose value is null (not usable, see src/lib/status.ts isUsable) is a
// genuine gap, not an interpolated point).
//
// Selector discovered by live DOM inspection (documented in
// tests/README.md "Selector used, with evidence"): each <Line> renders
// as <g class="recharts-line"> containing a <path class="recharts-curve
// recharts-line-curve"> (the drawn line) and, once Recharts' entrance
// animation finishes, a sibling <g class="recharts-line-dots"> holding
// one <circle class="recharts-dot recharts-line-dot"> per rendered
// (non-null) data point. Querying immediately after the chart mounts
// returns 0 circles (found empirically: the dots layer populates after
// the line-draw animation), so this module polls until two consecutive
// reads agree instead of using a fixed sleep.
//
// Stable selector: '.recharts-line-dots circle.recharts-dot', scoped
// per line via each line's own <path> stroke color (see
// playwright.config.mjs seriesStrokeColors), not DOM order, since color
// is the more explicit, less accidental identifier (DOM order happens
// to match JSX declaration order today: imports, exports, balance, but
// that is not guaranteed by anything Recharts documents).

async function readLineDotCounts(page) {
  return page.evaluate(() => {
    const lines = document.querySelectorAll('.recharts-line');
    return Array.from(lines).map((line) => ({
      stroke: line.querySelector('path.recharts-curve')?.getAttribute('stroke') ?? null,
      dotCount: line.querySelectorAll('.recharts-line-dots circle.recharts-dot').length,
    }));
  });
}

/**
 * Polls the rendered dot counts until they stop changing. Found by live
 * inspection that Recharts' entrance animation means dots read 0 for a
 * window right after the chart mounts (an all-zero reading is a
 * legitimate transient state, not a final one), so this requires
 * `minStableReads` consecutive identical reads, taken `pollMs` apart,
 * AND ignores an all-zero reading as a candidate "stable" state unless
 * every poll for the entire maxWaitMs stayed at zero (a genuinely empty
 * chart, which is possible and must not throw as if it were still
 * animating).
 */
export async function waitForStableLineDotCounts(page, { pollMs = 200, maxWaitMs = 8000, minStableReads = 3 } = {}) {
  const start = Date.now();
  let previousKey = null;
  let stableStreak = 0;
  let lastCounts = null;
  let sawNonZero = false;
  while (Date.now() - start < maxWaitMs) {
    const counts = await readLineDotCounts(page);
    lastCounts = counts;
    const total = counts.reduce((sum, c) => sum + c.dotCount, 0);
    if (total > 0) sawNonZero = true;
    const key = JSON.stringify(counts);
    const isAllZero = total === 0;
    if (key === previousKey && (!isAllZero || sawNonZero === false)) {
      stableStreak += 1;
    } else {
      stableStreak = 1;
    }
    previousKey = key;
    // Accept once stable for minStableReads in a row, but never accept an
    // all-zero reading as final until we are at least halfway through the
    // wait budget, since 0 is also the correct in-flight animation state.
    const halfwayElapsed = Date.now() - start > maxWaitMs / 2;
    if (stableStreak >= minStableReads && (!isAllZero || halfwayElapsed)) {
      return counts;
    }
    await page.waitForTimeout(pollMs);
  }
  throw new Error(
    `chart line dot counts did not stabilize within ${maxWaitMs}ms; last read: ${JSON.stringify(lastCounts)}`,
  );
}

export function countsBySeries(counts, seriesStrokeColors) {
  const byColor = new Map(counts.map((c) => [c.stroke, c.dotCount]));
  const result = {};
  for (const [series, color] of Object.entries(seriesStrokeColors)) {
    result[series] = byColor.has(color) ? byColor.get(color) : null;
  }
  return result;
}
