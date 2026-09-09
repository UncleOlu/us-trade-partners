# Independent all-years expected values

`expected.json` contains bounded test examples for the app's cumulative 2013-2025 view. It is not a new Census dataset. `tests/e2e/generate-all-years-expected.mjs` and `lib/all-years-expected.mjs` calculate these expectations from the existing validated annual snapshot with independent BigInt arithmetic. They do not import the app aggregation helper or read pipeline implementation.

The full 3,832-value comparison runs from annual files at test time and is not stored in Git. Inputs: annual world/partner summaries, Canada/China/EU/Norfolk partner files, section XVI, and metadata. Exact source hashes are in `reports/tests/all-years/expected-source-hashes.json`. World expectations add the 13 separately fetched annual world totals. EU expectations add historical-membership annual EU values and do not enter world sums.

Policy: any absent flow or missing required annual record makes that cumulative flow absent. All structurally not-applicable years yield not_applicable. Mixed applicable and structural NA years add only applicable values. All confirmed_zero inputs retain confirmed_zero. Derived balance and total need both complete flows. Every numeric result must fit a JavaScript safe integer.

Reproduce: `node tests/e2e/generate-all-years-expected.mjs`.
