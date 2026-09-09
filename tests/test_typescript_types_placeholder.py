"""Placeholder for the TypeScript type agreement test (DATA CONTRACT:
'Generate TypeScript types from it and test that they agree in CI'; SPEC
DATA CONTRACT: 'CI fails if the generated file differs from a fresh
generation'). Not run until src/ exists.

Test id: test_ts01_generated_types_match_fresh_generation
"""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
GENERATED_TYPES_PATH = ROOT / "src" / "types" / "generated.ts"


def test_ts01_generated_types_match_fresh_generation():
    """Once src/ exists (Agent B), this test should:
      1. Read the committed src/types/generated.ts.
      2. Run the project's type-generation command (npm run gen:types, per
         schema/CONTRACT.md) into a temporary file.
      3. Assert the two are byte-identical.
    D never edits src/, so this test only reads generated output and runs
    the generation command; it does not implement generation itself.
    """
    if not (ROOT / "src").is_dir():
        pytest.skip("not run: src/ does not exist yet (step 4 not run)")
    if not GENERATED_TYPES_PATH.exists():
        pytest.skip("not run: src/types/generated.ts does not exist yet")
    package_json = ROOT / "package.json"
    if not package_json.exists():
        pytest.skip("not run: package.json does not exist yet, cannot run gen:types")
    committed = GENERATED_TYPES_PATH.read_text(encoding="utf-8")
    result = subprocess.run(
        ["npm", "run", "gen:types"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, f"npm run gen:types failed: {result.stderr}"
    fresh = GENERATED_TYPES_PATH.read_text(encoding="utf-8")
    assert fresh == committed, "src/types/generated.ts differs from a fresh generation"
