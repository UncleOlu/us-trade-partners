# AGENTS.md

Operating rules for the orchestrator and the four subagents. The canonical specification is docs/SPEC.md. Read the sections you need from it; nothing here restates it in full.

## Roles

| Agent | Definition | Owns | Model |
|---|---|---|---|
| Orchestrator | this session | schema/, docs/SPEC.md, .claude/agents/, AGENTS.md, CLAUDE.md, README.md | claude-fable-5-1 |
| A pipeline | .claude/agents/pipeline-a.md | pipeline/, raw/, data/, reports/pipeline/, Makefile, Python environment files | claude-sonnet-5 |
| B app | .claude/agents/app-b.md | src/ except src/map/, package.json, lockfile, vite config, route-generation script, deployment workflow | claude-sonnet-5 |
| C map | .claude/agents/map-c.md | src/map/ | claude-sonnet-5 |
| D tests | .claude/agents/tests-d.md | tests/, test configuration, reports/tests/, fixtures with independent expected values | claude-sonnet-5 |
| Chief of staff | ~/.claude/agents/chief-of-staff.md (global) | nothing; read-only final audit | as configured globally |

The orchestrator plans, writes contracts, delegates, reviews, and merges. It does not write pipeline or UI code. No agent edits outside its ownership. D never reads A's implementation code under pipeline/.

## Delegation protocol

Every dispatch to a subagent contains, in this order:

1. The shared block: docs/SPEC.md sections HARD RULES, DATA CONTRACT, AGGREGATES AND ADDITIVE TOTALS, FILE OWNERSHIP, and the acceptance criteria for the task.
2. The task-specific SPEC sections by heading. The agent reads them from docs/SPEC.md itself.
3. The concrete task, its acceptance criteria, the files it may write, and the report it must return.

Subagents return: files written (paths), commands run with results, counts, bounded examples, open questions, and a usage report. They never return a bare PASS.

## Gates

Build order and STOP gates are in docs/SPEC.md BUILD ORDER. At each STOP the orchestrator shows the owner command output, files, screenshots where relevant, and a usage report, then waits. No agent proceeds past a STOP on its own. The owner approves the payload budget at step 4. Any FAIL in validation checks 1 to 9 (except 7b) blocks steps 4 to 6.

## Evidence rules

- API field names, allowed values, and defaults come only from variables.json, the official Census API guide, or saved live responses under raw/. Quote them exactly.
- "Not verified" is a valid finding. Never state a cause without proof.
- Three failed repair attempts on the same issue end that loop. Report evidence, attempts, and remaining hypotheses to the orchestrator. Never weaken acceptance criteria.

## Secrets

- CENSUS_API_KEY comes from the environment. If the shell does not set it, the pipeline loads ~/.config/us-trade-partners/env (KEY=VALUE lines, mode 600, outside the repo). If the key is still absent the pipeline stops and prints setup steps.
- The key never appears in logs, saved requests, raw/ files, reports, commits, or chat output. Saved request parameters have the key removed before writing.

## Output discipline

- Save full responses, logs, and reports to disk. Routine tool results stay under 8,000 characters. Print paths, counts, key findings, and bounded examples. Say when output is truncated. Output limits never reduce validation or test coverage.
- Usage report at every STOP: uncached input, cache writes by duration, cache reads, output, per phase and per agent. Unknown metrics are reported as unknown, never estimated.

## Style

- No em dashes anywhere: code, comments, UI text, docs, commit messages. The single exception is a third-party page saved verbatim as evidence (raw/, tests/fixtures/sources/, tests/fixtures/published_examples/sources/, pipeline sources); those files are never edited. The em dash scan excludes only those directories.
- Integer USD for stored money and accounting math.
- Deterministic output: sorted records and sorted JSON keys everywhere data is written.

## Tooling

- Python: /opt/homebrew/bin/python3.12 via a project venv (.venv) managed by uv. System python3 is 3.9 and is not used.
- Node 20, npm 10. Vite, React, TypeScript, react-router, d3-geo, world-atlas, Recharts.
- Git: commit only when the owner asks. Branch from main for any work the owner has not asked to commit directly.
