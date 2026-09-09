// Own e2e config for Agent D's browser-level suite. Not a @playwright/test
// config (that package is not a project dependency; only the core
// `playwright` package is, per package.json devDependencies, which
// tests/e2e/run.mjs uses directly). Plain constants only, read by
// tests/e2e/run.mjs and tests/e2e/tests/*.mjs.
//
// Ownership: everything under tests/e2e/ belongs to Agent D. This file
// never edits package.json; it only reads the existing "build" and
// "preview" npm scripts already defined there.

export const config = {
  // Repo base path. Matches src/lib/config.ts BASE_PATH default and
  // vite.config.ts basePath default (VITE_BASE_PATH env var, default
  // '/us-trade-partners/'). If VITE_BASE_PATH is set in the environment
  // this runner picks it up too, via basePathFromEnv() in lib/server.mjs.
  defaultBasePath: '/us-trade-partners/',

  // Global label text, quoted verbatim from src/lib/config.ts
  // GLOBAL_LABEL, which itself quotes docs/SPEC.md UI RULES: "Global
  // label on every page: 'US goods trade, Census basis. Excludes
  // services. Values are nominal USD.'" Not imported directly from
  // src/lib/config.ts (a .ts file) into this plain Node script; kept in
  // sync by citation instead.
  globalLabelText: 'US goods trade, Census basis. Excludes services. Values are nominal USD.',

  // Partner trend chart series colors, quoted verbatim from
  // src/pages/PartnerPage.tsx's three <Line stroke="..."> props. Used to
  // identify which rendered Recharts line is imports/exports/balance
  // regardless of DOM order (see tests/e2e/lib/chart.mjs and
  // tests/README.md "Selector used" for how this was discovered).
  seriesStrokeColors: {
    imports: '#c0392b',
    exports: '#2980b9',
    balance: '#27ae60',
  },

  // Partners tested for task 2 (chart point counts): China (large,
  // fully observed), EU (computed aggregate, fully observed), St Pierre
  // and Miquelon (small, fully observed), Norfolk Island (has absent
  // years, so every series must render fewer points than total
  // configured years).
  chartCheckPartnerCodes: ['5700', 'EU', '1610', '6022'],

  navigationTimeoutMs: 20000,
  chartStabilizePollMs: 200,
  chartStabilizeMaxWaitMs: 8000,

  // Owner requirements, step 5/6 (2026-09-09 onward). Task ids below
  // match the coordinator's numbered list in that message.

  // Task 1: home table default row limit and show-all.
  homeDefaultRowLimit: 25,
  // A partner outside the default top 25 by whatever the default rank
  // is, used to prove search still finds it: St Pierre and Miquelon.
  homeSearchOutsideTop25: { code: '1610', name: 'St Pierre and Miquelon' },
  // Desktop and mobile viewports used across this suite.
  desktopViewport: { width: 1280, height: 900 },
  mobileViewport: { width: 390, height: 844 },

  // Task 2: unit formatting. World imports 2025 in
  // data/<snapshot_id>/summary/2025.json, quoted by the owner:
  // 3,414,510,592,814 -> "$3.41tn" (3 significant figures).
  trillionExample: { year: 2025, expectedInteger: 3414510592814, expectedDisplay: '$3.41tn' },

  // Task 4: methodology page, quoted verbatim from
  // docs/methodology-content.md's "Unidentified Countries (Census code
  // 8220)" section heading and partners.json's owner-approved name for
  // 8220 (schema/CONTRACT.md amended Published examples paragraph /
  // tests/test_validation_checks.py::test_partner_8220_matches_owner_approved_record).
  code8220Text: 'Unidentified Countries (Census code 8220)',

  // Task 5: deployed-site audit. BASE_URL env var overrides; unset means
  // the local static server in lib/static-server.mjs (mimics GitHub
  // Pages: real 404 status and body for unknown paths, since `npm run
  // preview`'s SPA fallback always returns 200 and cannot be used to
  // prove this).
  auditRoutes: [
    '/hub',
    '/methodology',
    '/partner/5700?year=2025',
    '/partner/EU?year=2013',
    '/section/XVI?year=2025&rank=exports',
  ],
  auditUnknownRoute: '/nope',
  missingDataPartnerRoute: { code: '6022', year: 2023, flow: 'exports' },
  payloadBudgets: {
    // Bytes, set by the owner 2026-09-09 (docs/SPEC.md UI RULES payload
    // budgets paragraph: 250 KB / 300 KB gzip); the owner's message for
    // this task gives the exact byte figures used here directly.
    home: 250000,
    partner: 300000,
    partnerRoute: '/partner/5700?year=2025',
  },
};
