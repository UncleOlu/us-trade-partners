"""FlowValue and DerivedValue rules from schema/CONTRACT.md and
schema/common.schema.json, positive and negative cases.

Test ids: test_fv01_* .. test_fv20_*
"""

import pytest
from jsonschema import Draft202012Validator

FLOWVALUE_REF = {"$ref": "https://us-trade-partners.local/schema/common.schema.json#/$defs/FlowValue"}
DERIVEDVALUE_REF = {"$ref": "https://us-trade-partners.local/schema/common.schema.json#/$defs/DerivedValue"}


def is_valid(schema_ref, instance, registry):
    validator = Draft202012Validator(schema_ref, registry=registry)
    return validator.is_valid(instance)


# ---------------- FlowValue: positive cases ----------------

def test_fv01_observed_with_integer_and_null_reason_is_valid(schema_registry):
    instance = {"status": "observed", "value": 12345, "reason": None}
    assert is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv02_observed_with_negative_integer_is_valid(schema_registry):
    # balance-style FlowValue usage is not negative (FlowValue is imports/exports,
    # never negative in this contract), but the schema itself does not forbid
    # negative integers for FlowValue.value; this documents that fact rather
    # than asserting a business rule the schema does not encode.
    instance = {"status": "observed", "value": -1, "reason": None}
    assert is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv03_confirmed_zero_with_reason_is_valid(schema_registry):
    instance = {"status": "confirmed_zero", "value": 0, "reason": "row returned with 0 for 1234 imports 2023-12"}
    assert is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv04_absent_with_reason_is_valid(schema_registry):
    instance = {"status": "absent", "value": None, "reason": "no row returned for 5790 imports 2023-12"}
    assert is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv05_not_applicable_with_reason_is_valid(schema_registry):
    instance = {"status": "not_applicable", "value": None, "reason": "chapter 99 not in exports chapter set"}
    assert is_valid(FLOWVALUE_REF, instance, schema_registry)


# ---------------- FlowValue: negative cases ----------------

def test_fv06_observed_with_null_value_is_invalid(schema_registry):
    instance = {"status": "observed", "value": None, "reason": None}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv07_observed_with_non_null_reason_is_invalid(schema_registry):
    instance = {"status": "observed", "value": 5, "reason": "should not have a reason"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv08_confirmed_zero_with_nonzero_value_is_invalid(schema_registry):
    instance = {"status": "confirmed_zero", "value": 1, "reason": "row returned with 0"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv09_confirmed_zero_with_empty_reason_is_invalid(schema_registry):
    instance = {"status": "confirmed_zero", "value": 0, "reason": ""}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv10_confirmed_zero_with_null_reason_is_invalid(schema_registry):
    instance = {"status": "confirmed_zero", "value": 0, "reason": None}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv11_absent_with_integer_value_is_invalid(schema_registry):
    instance = {"status": "absent", "value": 0, "reason": "no row returned"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv12_absent_with_null_reason_is_invalid(schema_registry):
    instance = {"status": "absent", "value": None, "reason": None}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv13_not_applicable_with_zero_value_is_invalid(schema_registry):
    instance = {"status": "not_applicable", "value": 0, "reason": "chapter 99 not in exports chapter set"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv14_fetch_failed_status_is_invalid(schema_registry):
    """fetch_failed never appears in published data (DATA CONTRACT, CONTRACT.md)."""
    instance = {"status": "fetch_failed", "value": None, "reason": "timeout"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv15_extra_property_is_invalid(schema_registry):
    instance = {"status": "observed", "value": 5, "reason": None, "extra": "nope"}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv16_missing_required_field_is_invalid(schema_registry):
    instance = {"status": "observed", "value": 5}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


def test_fv17_float_value_is_invalid(schema_registry):
    """No floats anywhere in data files (HARD RULES, CONTRACT.md)."""
    instance = {"status": "observed", "value": 5.5, "reason": None}
    assert not is_valid(FLOWVALUE_REF, instance, schema_registry)


# ---------------- DerivedValue: positive and negative cases ----------------

def test_fv18_derived_observed_is_valid(schema_registry):
    instance = {"status": "observed", "value": 100, "reason": None}
    assert is_valid(DERIVEDVALUE_REF, instance, schema_registry)


def test_fv19_derived_absent_with_reason_is_valid(schema_registry):
    instance = {"status": "absent", "value": None, "reason": "imports absent for 5790 2023-12"}
    assert is_valid(DERIVEDVALUE_REF, instance, schema_registry)


def test_fv20_derived_confirmed_zero_status_is_invalid(schema_registry):
    """DerivedValue only allows observed|absent, never confirmed_zero or
    not_applicable (CONTRACT.md: balance and total_trade_value)."""
    instance = {"status": "confirmed_zero", "value": 0, "reason": "x"}
    assert not is_valid(DERIVEDVALUE_REF, instance, schema_registry)


def test_fv21_derived_observed_with_null_value_is_invalid(schema_registry):
    instance = {"status": "observed", "value": None, "reason": None}
    assert not is_valid(DERIVEDVALUE_REF, instance, schema_registry)


def test_fv22_derived_absent_with_null_reason_is_invalid(schema_registry):
    instance = {"status": "absent", "value": None, "reason": None}
    assert not is_valid(DERIVEDVALUE_REF, instance, schema_registry)


def test_fv23_derived_float_value_is_invalid(schema_registry):
    """JSON Schema's integer type accepts a JSON number only when it has a
    zero fractional part; 1.5 is unambiguously non-integral, so this
    exercises the same no-floats intent as test_fv17 without relying on
    Python's float/int distinction (1.0 round-trips as integral JSON and
    is valid, which is correct schema behavior, not a case to test here).
    """
    instance = {"status": "observed", "value": 1.5, "reason": None}
    assert not is_valid(DERIVEDVALUE_REF, instance, schema_registry)
