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
};
