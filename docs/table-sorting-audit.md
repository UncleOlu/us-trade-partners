# Sortable trade tables

Owner request: make the tables sortable from lowest to highest and vice versa. The screenshot showed the country product group table.

Scope: clickable column headings on home partners, section partners, and the country yearly, group and chapter tables. Preserve the existing defaults until a user changes the order. Use exact stored values, with proper negative and zero ordering. Missing values remain last in either direction. Equal values use a stable identifier. Text columns sort A-Z or Z-A; Group order follows HS section numbers rather than the alphabet.

Decisions stated to the owner: each table shows its direction and stores its choice in the URL; CSV exports follow the full sorted row order. Financial rank remains rank by the selected monetary measure even if the smallest values appear first. Sorting does not change world totals, annual charts or selected product details. Centered headers need equal space on both sides of their text to keep sort arrows from shifting the labels.

The feature adds visible header buttons and sort status text. These controls use more space than static headings, so narrow screens retain contained horizontal scrolling. It adds no dependency, data acquisition, canonical snapshot change or release artifact.

Checks and deployment evidence will be recorded in reports/tests/table-sorting/. Usage and billing metrics are unknown.

Initial verification: full TypeScript checking, production build and rendered methodology passed. Five independent sorting tests passed: signed and large exact numbers, stable ties without input mutation, case-insensitive text and blank descriptions, HS order from metadata, and usable zero versus absent/not_applicable statuses. Source Gitleaks scan exited 0 with no findings.

The initial browser pass found a real narrow-header defect: a Rank label moved 14.66px off center because its grid cell could shrink below the text width. The fix gives the label its full width, with equal arrow space, and lets the table scroll. Separate test corrections compare unchanged chart coordinates with a 1e-8 tolerance for floating-point rendering differences and check the first-25 button after expanding the table. Exact row order and CSV checks retain exact comparisons.

The all-years derived summary remains byte-identical to the published data view: SHA256 `bc55f3b65c66b9d60b1a2d8e7cfa0587d4ddde0526eb6ac6304aa2d113d8fea7`. Sorting changes only the app's view of those values.

Final local results: 10 browser cases passed, including all 54 column/direction pairs with exact row and full CSV order comparisons. Five unit cases, six affected annual URL/control cases and one all-years navigation case passed. Numeric header text centers match column centers within 1px; targets meet 44px height. Root inspected representative group, home and yearly desktop/mobile images. The initial failure receipt remains separate from the final passing receipt.

Computed gzip budgets: home 2025 138,993 bytes, home All years 139,042 bytes, largest partner All years 269,082 bytes. Limits remain 250,000 for home and 300,000 for partner. These sums use gzip level 6 response bodies and are not measured deployed transfers. Final tested index SHA256: `9eb20ec87aba080e0007de3602d8c6eb9233709cdd83a9c2c479a79b15bd95bb`.
