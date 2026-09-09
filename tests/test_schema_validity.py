"""Schema-level tests. Independent of pipeline/: reads only schema/ and,
when present, data/<snapshot_id>/.

Test ids: test_sch01_* .. test_sch07_*
"""

import json

import jsonschema
import pytest
from jsonschema import Draft202012Validator

from conftest import (
    DATA_DIR,
    SCHEMA_FILES,
    load_schema,
    require_snapshot,
)


@pytest.mark.parametrize("schema_name", SCHEMA_FILES)
def test_sch01_schema_is_valid_draft_2020_12(schema_name):
    """Every schema/*.schema.json file is itself a valid JSON Schema
    draft 2020-12 document (Draft202012Validator.check_schema does not
    raise)."""
    schema = load_schema(schema_name)
    assert schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema", (
        f"{schema_name} must declare $schema draft 2020-12"
    )
    Draft202012Validator.check_schema(schema)


PUBLISHED_FILE_MAP = {
    "meta.json": "meta.schema.json",
    "partners.json": "partners.schema.json",
    "hs_sections.json": "hs_sections.schema.json",
}


def test_sch02_meta_json_validates_when_present(schema_registry, snapshot_dir):
    """data/<snapshot_id>/meta.json validates against meta.schema.json,
    using a Registry so the common.schema.json $ref resolves."""
    path = require_snapshot(snapshot_dir)
    target = path / "meta.json"
    if not target.exists():
        pytest.skip("not run: meta.json does not exist in the discovered snapshot directory")
    schema = load_schema("meta.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    instance = json.loads(target.read_text(encoding="utf-8"))
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_sch03_partners_json_validates_when_present(schema_registry, snapshot_dir):
    path = require_snapshot(snapshot_dir)
    target = path / "partners.json"
    if not target.exists():
        pytest.skip("not run: partners.json does not exist in the discovered snapshot directory")
    schema = load_schema("partners.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    instance = json.loads(target.read_text(encoding="utf-8"))
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_sch04_hs_sections_json_validates_when_present(schema_registry, snapshot_dir):
    path = require_snapshot(snapshot_dir)
    target = path / "hs_sections.json"
    if not target.exists():
        pytest.skip("not run: hs_sections.json does not exist in the discovered snapshot directory")
    schema = load_schema("hs_sections.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    instance = json.loads(target.read_text(encoding="utf-8"))
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_sch05_summary_files_validate_when_present(schema_registry, snapshot_dir):
    path = require_snapshot(snapshot_dir)
    summary_dir = path / "summary"
    if not summary_dir.is_dir():
        pytest.skip("not run: data/<snapshot_id>/summary/ does not exist yet")
    files = sorted(summary_dir.glob("*.json"))
    if not files:
        pytest.skip("not run: data/<snapshot_id>/summary/ has no files yet")
    schema = load_schema("summary.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    failures = []
    for f in files:
        instance = json.loads(f.read_text(encoding="utf-8"))
        errors = list(validator.iter_errors(instance))
        if errors:
            failures.append((f.name, [e.message for e in errors[:3]]))
    assert not failures, failures


def test_sch06_partner_files_validate_when_present(schema_registry, snapshot_dir):
    path = require_snapshot(snapshot_dir)
    partner_dir = path / "partner"
    if not partner_dir.is_dir():
        pytest.skip("not run: data/<snapshot_id>/partner/ does not exist yet")
    files = sorted(partner_dir.glob("*.json"))
    if not files:
        pytest.skip("not run: data/<snapshot_id>/partner/ has no files yet")
    schema = load_schema("partner.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    failures = []
    for f in files:
        instance = json.loads(f.read_text(encoding="utf-8"))
        errors = list(validator.iter_errors(instance))
        if errors:
            failures.append((f.name, [e.message for e in errors[:3]]))
    assert not failures, failures


def test_sch07_section_files_validate_when_present(schema_registry, snapshot_dir):
    path = require_snapshot(snapshot_dir)
    section_dir = path / "section"
    if not section_dir.is_dir():
        pytest.skip("not run: data/<snapshot_id>/section/ does not exist yet")
    files = sorted(section_dir.glob("*.json"))
    if not files:
        pytest.skip("not run: data/<snapshot_id>/section/ has no files yet")
    schema = load_schema("section.schema.json")
    validator = Draft202012Validator(schema, registry=schema_registry)
    failures = []
    for f in files:
        instance = json.loads(f.read_text(encoding="utf-8"))
        errors = list(validator.iter_errors(instance))
        if errors:
            failures.append((f.name, [e.message for e in errors[:3]]))
    assert not failures, failures
