# US goods trade partners

A static web app showing US goods trade with every trading partner by year and HS category, with the trade balance per partner. Census-basis goods trade in nominal USD. Excludes services.

- Specification: docs/SPEC.md
- Operating rules and agent roles: AGENTS.md
- Data contract: schema/ (CONTRACT.md plus JSON Schema files)
- Pipeline: pipeline/ (Python 3.12, uv, .venv)
- Tests: tests/ (pytest, .venv-tests)
- Raw evidence and snapshots: raw/<snapshot_id>/, published data: data/<snapshot_id>/
- Reports: reports/pipeline/, reports/tests/

Setup: put `CENSUS_API_KEY=...` in the shell environment or in `~/.config/us-trade-partners/env` (mode 600). The key never enters this repository.

Build status: step 1 source test approved 2026-09-08. Step 2 contract written; tests in progress.
