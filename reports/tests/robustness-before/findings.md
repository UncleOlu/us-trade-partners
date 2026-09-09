# Independent UI robustness audit before changes

Target: https://uncleolu.github.io/us-trade-partners/. Source checkout: b19843c. Read-only source review plus eleven focused browser observations; no pipeline implementation read. No full route suite repeated. Evidence: observations.json and run.txt. Browser-local response fixtures never changed the hosted site.

## Verified issues

| Priority | Trigger and result | Evidence | Regression expectation |
|---|---|---|---|
| High | Home `?year=abc` and `?year=0` remain on Loading after network idle. | Live cases home invalid year abc/0; source checks `!year` before reporting loader error. | Normalize or reject unsupported input visibly. Never leave a settled request on loading. |
| High | Partner response containing valid JSON `{}` crashes React and removes main content. | Browser-local response fixture; page error: Cannot read properties of undefined (reading map). | Show a recoverable data error while retaining navigation. Validate required shape or catch render errors. |
| Medium | Home `year=2099` requests a nonexistent snapshot file, whereas partner/section show 2025 while retaining invalid URL values. Invalid rank also stays in URL while another rank renders. | Five invalid-query cases. | Use one explicit URL normalization rule across routes; rendered state and shared URL agree. |
| Medium | Choose partner section XVI, refresh, and the selected section becomes I. | Live group refresh detail: before XVI, after I; URL unchanged. | Keep selected group in URL, validate it, and preserve across refresh and share. |
| Medium | Header Hub link removes both `year=2020` and `rank=exports`. Hub links generate latest-year destinations. | Live header context URL plus Layout/Hub source. | Preserve meaningful year/rank context across navigation. |
| Medium | Home map creates 170 separate keyboard tab stops before partner search. | Live mapTabStops=170. | One map tab stop with internal arrow navigation and a clear way to leave it. |
| Medium | Navigation links measure 18 px high. Many native controls and money buttons are also small. | Live smallControls measurements. | Larger, well-spaced touch controls; table density should not make actions hard to select. |

## Source findings needing focused regression checks

- Partner section rows select only through click handlers. There is no labeled section-select button or row keyboard action. Numeric buttons bubble clicks to the row, coupling exact-value access to section selection.
- Missing-value reasons live in title attributes on spans. A touch action cannot expose them as persistent visible text.
- useAtlas aborts a fetch during effect cleanup but retains requestedFor. React StrictMode's second setup can skip the replacement fetch. Map retry and the revised hook need a development-mode test.
- useAsyncData uses generation checks for changed dependencies, so an older request should not overwrite a newer one. Test this with controlled delayed responses before changing it.
- Data requests have no explicit timeout. A request that never settles can keep the page loading. A bounded timeout with retry is a design choice; it adds an arbitrary waiting threshold that should be documented.
- Layout has no skip link, current-page marker, route-specific title, or route-change focus handling. Test the agreed new keyboard behavior with semantic selectors.

## Checks that already worked

A missing partner file and invalid JSON text each produced a visible error plus Reload. Home CSV explicitly exports all partners; its scope matches the label, even when search filters visible rows. Existing world-total and search logic use the correct independent scopes. No evidence supports changing these data rules.

## Focused test plan

1. Unsupported, malformed, empty, and valid year/rank/group queries resolve to one clear state, with no invalid file fetch and no state mismatch.
2. Missing/500/parse/shape failures show a recoverable error. Retry restores the same snapshot and query context.
3. A delayed old-year request cannot replace current-year values. Rapid back/forward navigation has the same result.
4. Partner section choice uses a keyboard control and survives refresh. Exact-value buttons do not change section choice. Missing reasons open through touch and keyboard.
5. Header/Hub/partner links keep context. Current page and focus behavior help keyboard users find the new page.
6. Map one-tab-stop navigation: arrows, Home/End, Enter/Space, Tab exit, Escape, plus retry after failed or aborted atlas load.
7. At 320 px and 200% reflow, only table containers scroll horizontally. Controls and headings fit; touch targets remain usable.
8. Keep independent totals, all-partner search, displayed counts, and explicit CSV scope in the tests after UI selectors settle.

## Limits and trade-offs

This is a bounded robustness review, not an accessibility certification. Touch size measurements alone do not determine compliance because target spacing and equivalent controls matter. Normalizing invalid input to latest year favors recovery; rejecting it favors explicit correction. Either choice must prevent a URL/display mismatch. Keep map geometry, numeric precision, and data integrity unchanged while improving input controls.

Usage: current Codex model. Uncached input, cache writes by duration, cache reads, output, and cost are unknown.
