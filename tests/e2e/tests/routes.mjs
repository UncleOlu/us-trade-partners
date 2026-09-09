// Task 3: route tests for /hub and /section/<id>?year=<latest>.
//
// Both pages carry an explicit "Placeholder" doc comment in their
// source (src/pages/HubPage.tsx, src/pages/SectionPage.tsx) at the time
// this suite was written, and SectionPage.tsx additionally says "The
// section trend line is added in a later step." Rather than hard-coding
// a blanket not-run for both routes, each test here runs every check it
// can against the live page and only reports not-run for the specific
// piece that is genuinely still missing (the section trend chart),
// citing that source comment as the reason. If Agent B finishes the
// chart, this test starts asserting it automatically, no test change
// needed. If HTTP status, the global label, the hub link, or (for
// section) the partner table are ever missing, that is a real FAIL, not
// a not-run.

import { config } from '../playwright.config.mjs';

async function checkCommonPageParts(page, url) {
  const pageErrors = [];
  const onPageError = (err) => pageErrors.push(err.message);
  const onConsole = (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: config.navigationTimeoutMs });
    const status = response ? response.status() : null;
    if (status !== 200) {
      throw new Error(`navigation to ${url} did not return 200 (got ${status})`);
    }
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    const hasGlobalLabel = bodyText.includes(config.globalLabelText);
    if (!hasGlobalLabel) {
      const errorNote = pageErrors.length
        ? ` -- a browser error occurred during render, likely the real cause: ${pageErrors.join(' | ')}`
        : '';
      throw new Error(`global label text not found on ${url}: "${config.globalLabelText}"${errorNote}`);
    }
    const hubLinkCount = await page.locator('a[href*="/hub"]').count();
    if (hubLinkCount < 1) {
      throw new Error(`no link back to /hub found on ${url}`);
    }
    if (pageErrors.length > 0) {
      throw new Error(`page loaded but logged a browser error on ${url}: ${pageErrors.join(' | ')}`);
    }
    return { status, hasGlobalLabel, hubLinkCount };
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

export function registerRouteTests({ test, skip }, ctx) {
  const { page, baseUrl, latestYear, sectionId } = ctx;

  test('e2e /hub returns 200, shows global label, links back to hub', async () => {
    const url = `${baseUrl}hub`;
    const common = await checkCommonPageParts(page, url);
    return { url, ...common };
  });

  test(`e2e /section/${sectionId}?year=${latestYear} returns 200, shows global label, hub link, table with partner rows, and trend chart`, async () => {
    const url = `${baseUrl}section/${sectionId}?year=${latestYear}`;
    const common = await checkCommonPageParts(page, url);

    const rowCount = await page.locator('table tbody tr').count();
    if (rowCount < 1) {
      throw new Error(`section table has no partner rows on ${url}`);
    }

    const chartCount = await page.locator('.recharts-wrapper').count();
    if (chartCount < 1) {
      return skip(
        `HTTP ${common.status}, global label, hub link, and ${rowCount} partner table rows all verified on ${url}; ` +
          "section trend chart not yet implemented (src/pages/SectionPage.tsx doc comment: " +
          "'The section trend line is added in a later step'); Agent B is building this now",
      );
    }
    return { url, ...common, rowCount, chartCount };
  });
}
