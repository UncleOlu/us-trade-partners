"""Shared FlowValue/DerivedValue helpers and deterministic JSON writing, used
by pipeline/build.py and pipeline/validate.py. Matches schema/common.schema.json
exactly: FlowValue {status, value, reason}, DerivedValue {status, value, reason}.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def fv_observed(value: int) -> dict:
    assert isinstance(value, int)
    return {"status": "observed", "value": value, "reason": None}


def fv_confirmed_zero(reason: str) -> dict:
    assert reason
    return {"status": "confirmed_zero", "value": 0, "reason": reason}


def fv_absent(reason: str) -> dict:
    assert reason
    return {"status": "absent", "value": None, "reason": reason}


def fv_not_applicable(reason: str) -> dict:
    assert reason
    return {"status": "not_applicable", "value": None, "reason": reason}


def dv_observed(value: int) -> dict:
    assert isinstance(value, int)
    return {"status": "observed", "value": value, "reason": None}


def dv_absent(reason: str) -> dict:
    assert reason
    return {"status": "absent", "value": None, "reason": reason}


def _numeric_or_none(fv: dict) -> int | None:
    """A FlowValue contributes its integer value to a sum only when observed
    or confirmed_zero; otherwise it blocks the derivation."""
    if fv["status"] in ("observed", "confirmed_zero"):
        return fv["value"]
    return None


def derive_balance(imports_fv: dict, exports_fv: dict, context: str) -> dict:
    i = _numeric_or_none(imports_fv)
    e = _numeric_or_none(exports_fv)
    if i is None or e is None:
        missing = []
        if i is None:
            missing.append(f"imports ({imports_fv['status']})")
        if e is None:
            missing.append(f"exports ({exports_fv['status']})")
        return dv_absent(f"balance absent for {context}: missing input(s) " + ", ".join(missing))
    return dv_observed(e - i)


def derive_total_trade_value(imports_fv: dict, exports_fv: dict, context: str) -> dict:
    i = _numeric_or_none(imports_fv)
    e = _numeric_or_none(exports_fv)
    if i is None or e is None:
        missing = []
        if i is None:
            missing.append(f"imports ({imports_fv['status']})")
        if e is None:
            missing.append(f"exports ({exports_fv['status']})")
        return dv_absent(f"total_trade_value absent for {context}: missing input(s) " + ", ".join(missing))
    return dv_observed(i + e)


def sum_flowvalues(fvs: list[dict], not_applicable_ok: bool, context: str) -> dict:
    """Sum a list of FlowValue dicts (e.g. chapters in a group). Chapters that
    are not_applicable are skipped (do not block the sum) when
    not_applicable_ok is True (they are outside the flow's chapter set for
    that year). Any absent chapter blocks the sum (group value absent)."""
    total = 0
    absent_reasons = []
    counted = 0
    for fv in fvs:
        if fv["status"] in ("observed", "confirmed_zero"):
            total += fv["value"]
            counted += 1
        elif fv["status"] == "not_applicable" and not_applicable_ok:
            continue
        else:
            absent_reasons.append(fv.get("reason") or fv["status"])
    if absent_reasons:
        # de-duplicate identical reasons (preserving order); when every
        # absent member shares the same reason, use it verbatim rather than
        # repeating it once per member
        distinct = list(dict.fromkeys(absent_reasons))
        if len(distinct) == 1:
            return fv_absent(distinct[0])
        return fv_absent(f"absent for {context}: " + "; ".join(distinct))
    return fv_observed(total)


def write_json_sorted(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")


def sha256_hex(text: str) -> str:
    import hashlib
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
