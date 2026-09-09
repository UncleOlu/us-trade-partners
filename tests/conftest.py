"""Shared fixtures for the independent test suite (Agent D).

Independence rule: this suite never imports or reads pipeline/ implementation
code. It reads only schema/, docs/SPEC.md, raw/source_test/, tests/fixtures/,
and data/ (when present, read at run time, never assumed).

Staged-build override (for running the suite against an unpublished,
staged build before it is copied into data/<snapshot_id>): set these
environment variables before invoking pytest.

  DATA_DIR       Absolute path to a data/<snapshot_id>-shaped directory
                 (meta.json, partners.json, summary/, partner/, section/,
                 hs_sections.json). When set, discover_snapshot_dir()
                 (and therefore the snapshot_dir fixture / require_snapshot)
                 uses this directory directly instead of scanning data/
                 for a single directory matching the SnapshotId pattern.
  RAW_DIR        Absolute path to the matching raw/<snapshot_id>-shaped
                 directory (partner_totals/, eu_members/, manifest.json,
                 ...). When set, resolve_raw_dir() uses this directory
                 directly instead of deriving ROOT/raw/<DATA_DIR.name>.
                 Read by test_c07a_eu_calculation_full.
  VALIDATION_CSV Absolute path to a validation.csv-shaped report file.
                 When set, require_validation_csv() reads this file
                 directly instead of reports/pipeline/validation.csv.

All three are independent: set any subset. None of them change what a
test asserts, only where it reads from; a staged build must still match
the real schema and contract for these tests to pass. Documented again
in reports/tests/test_list.md.
"""

import json
import os
import re
from pathlib import Path

import pytest
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "schema"
DATA_DIR = ROOT / "data"
RAW_SOURCE_TEST_DIR = ROOT / "raw" / "source_test"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
REPORTS_TESTS_DIR = ROOT / "reports" / "tests"

# Staged-build override environment variable names (see module docstring).
DATA_DIR_ENV_VAR = "DATA_DIR"
RAW_DIR_ENV_VAR = "RAW_DIR"
VALIDATION_CSV_ENV_VAR = "VALIDATION_CSV"

SNAPSHOT_ID_PATTERN = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$")

SCHEMA_FILES = [
    "common.schema.json",
    "hs_sections.schema.json",
    "meta.schema.json",
    "partner.schema.json",
    "partners.schema.json",
    "section.schema.json",
    "summary.schema.json",
]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_schema(name):
    return load_json(SCHEMA_DIR / name)


def load_fixture(name):
    return load_json(FIXTURES_DIR / name)


@pytest.fixture(scope="session")
def schema_registry():
    """A referencing.Registry with every schema/*.schema.json resource
    registered under its own $id, so cross-file $ref (for example
    partner.schema.json referring to common.schema.json#/$defs/...)
    resolves without network access or hard-coded paths.
    """
    resources = []
    for name in SCHEMA_FILES:
        contents = load_schema(name)
        resource = Resource(contents=contents, specification=DRAFT202012)
        resources.append((contents["$id"], resource))
    return Registry().with_resources(resources)


@pytest.fixture(scope="session")
def schema_texts():
    return {name: load_schema(name) for name in SCHEMA_FILES}


def discover_snapshot_dir():
    """Return (path_or_none, reason_or_none).

    If the DATA_DIR environment variable is set (staged-build override,
    see module docstring), it is used directly: returns (Path(DATA_DIR),
    None) when that path is a directory, else (None, reason).

    Otherwise chooses the single directory directly under data/ whose
    name matches the SnapshotId pattern from common.schema.json. If zero
    or more than one match, returns (None, reason) so callers report the
    test as not run instead of passed or errored.
    """
    override = os.environ.get(DATA_DIR_ENV_VAR)
    if override:
        override_path = Path(override)
        if not override_path.is_dir():
            return None, f"DATA_DIR={override!r} is set but is not a directory"
        return override_path, None
    if not DATA_DIR.is_dir():
        return None, "data/ directory does not exist yet (step 3 not run)"
    candidates = [
        p for p in DATA_DIR.iterdir() if p.is_dir() and SNAPSHOT_ID_PATTERN.match(p.name)
    ]
    if len(candidates) == 0:
        return None, "zero directories under data/ match the SnapshotId pattern"
    if len(candidates) > 1:
        names = ", ".join(sorted(p.name for p in candidates))
        return None, f"multiple directories under data/ match the SnapshotId pattern: {names}"
    return candidates[0], None


@pytest.fixture(scope="session")
def snapshot_dir():
    path, reason = discover_snapshot_dir()
    return path, reason


def require_snapshot(snapshot_dir_fixture):
    """Call at the top of a test body. Skips (reports not run) with a
    clear reason when no single snapshot directory exists yet.
    """
    path, reason = snapshot_dir_fixture
    if path is None:
        pytest.skip(f"not run: {reason}")
    return path


def resolve_raw_dir(data_dir_path):
    """Return the raw/<snapshot_id> directory matching a data/<snapshot_id>
    directory (data_dir_path, typically from require_snapshot).

    If the RAW_DIR environment variable is set (staged-build override,
    see module docstring), it is used directly instead of deriving
    ROOT/raw/<data_dir_path.name>. Does not check existence; callers
    check whatever subdirectories they need and skip accordingly.
    """
    override = os.environ.get(RAW_DIR_ENV_VAR)
    if override:
        return Path(override)
    return ROOT / "raw" / data_dir_path.name


def resolve_validation_csv_path():
    """Return the validation.csv path this suite should read, honoring
    the VALIDATION_CSV staged-build override (see module docstring) when
    set, else ROOT/reports/pipeline/validation.csv. Does not check
    existence: callers that require the file use require_validation_csv;
    callers that treat it as optional (best-effort cross-reference) check
    .exists() themselves, as test_c02_partner_totals_equal_chapter_sums
    does for its tolerance-row lookup."""
    override = os.environ.get(VALIDATION_CSV_ENV_VAR)
    return Path(override) if override else (ROOT / "reports" / "pipeline" / "validation.csv")


def require_validation_csv():
    """Return the validation.csv path to read, skipping (not run) if it
    does not exist.

    If the VALIDATION_CSV environment variable is set (staged-build
    override, see module docstring), it is used directly instead of
    reports/pipeline/validation.csv.
    """
    override = os.environ.get(VALIDATION_CSV_ENV_VAR)
    path = resolve_validation_csv_path()
    if not path.exists():
        reason = (
            f"not run: VALIDATION_CSV={override!r} does not exist"
            if override
            else "not run: reports/pipeline/validation.csv does not exist yet (step 3 not run)"
        )
        pytest.skip(reason)
    return path
