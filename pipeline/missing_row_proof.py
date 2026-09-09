"""
Generate reports/pipeline/missing_row_proof.md: proves the CONTRACT
Missing-row rule on St Pierre and Miquelon (Census CTY_CODE 1610) for 2023,
both flows, from the already-built data/<snapshot_id>/partner/1610.json.

Usage: .venv/bin/python3 pipeline/missing_row_proof.py <snapshot_id> --data-dir <dir>
"""

from __future__ import annotations

import argparse
import os
import json
import sys
from pathlib import Path

ROOT = Path(os.environ.get("US_TRADE_ROOT", str(Path(__file__).resolve().parents[1])))
REPORTS_DIR = ROOT / "reports" / "pipeline"
CODE = "1610"
YEAR = 2023


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot_id")
    parser.add_argument("--data-dir", required=True)
    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    doc = json.loads((data_dir / f"partner/{CODE}.json").read_text())
    ye = next(y for y in doc["years"] if y["year"] == YEAR)
    se = next(s for s in doc["sections"] if s["year"] == YEAR)

    lines = [f"# Missing-row rule proof: St Pierre and Miquelon ({CODE}), {YEAR}", "",
             f"Snapshot: {args.snapshot_id}", "",
             "CONTRACT.md Missing-row rule: 'A missing chapter row for partner P, year Y, flow F "
             "is confirmed_zero only when the present chapter rows for P, Y, F sum exactly to the "
             "separately fetched partner total for P, Y, F. The reason cites that reconciliation.'", ""]

    for flow in ("imports", "exports"):
        partner_total_fv = ye[flow]
        lines.append(f"## {flow}")
        lines.append("")
        lines.append(f"Partner total ({flow}, {YEAR}-12, separately fetched): "
                      f"status={partner_total_fv['status']}, value={partner_total_fv['value']}")
        lines.append("")
        present = []
        confirmed_zero = []
        absent = []
        not_applicable = []
        for g in se["groups"]:
            for ch in g["chapters"]:
                fv = ch[flow]
                if fv["status"] == "observed":
                    present.append((ch["chapter"], fv["value"]))
                elif fv["status"] == "confirmed_zero":
                    confirmed_zero.append((ch["chapter"], fv["reason"]))
                elif fv["status"] == "absent":
                    absent.append((ch["chapter"], fv["reason"]))
                elif fv["status"] == "not_applicable":
                    not_applicable.append(ch["chapter"])

        present_sum = sum(v for _, v in present)
        lines.append(f"Present (observed) chapters: {[c for c, _ in present]}")
        lines.append(f"Present chapter values: {dict(present)}")
        lines.append(f"Sum of present chapters: {present_sum}")
        lines.append("")
        lines.append(f"Chapters confirmed_zero by reconciliation: {[c for c, _ in confirmed_zero]}")
        if confirmed_zero:
            lines.append(f"Reason (first example): {confirmed_zero[0][1]}")
        lines.append("")
        lines.append(f"Chapters absent: {[c for c, _ in absent]}")
        if absent:
            lines.append(f"Reason (first example): {absent[0][1]}")
        lines.append("")
        lines.append(f"Chapters not_applicable (outside this flow's chapter set for {YEAR}): {not_applicable}")
        lines.append("")
        if partner_total_fv["status"] == "observed":
            reconciles = present_sum == partner_total_fv["value"]
            lines.append(f"Reconciliation: present_sum ({present_sum}) "
                          f"{'==' if reconciles else '!='} partner_total ({partner_total_fv['value']})")
            lines.append(f"Result: missing chapters are {'confirmed_zero (reconciliation holds)' if reconciles else 'absent (reconciliation fails)'}")
        else:
            lines.append(f"Partner total is {partner_total_fv['status']}; missing chapters cannot be reconciled and are absent.")
        lines.append("")

    out_path = REPORTS_DIR / "missing_row_proof.md"
    out_path.write_text("\n".join(lines) + "\n")
    print(f"[missing_row_proof] wrote {out_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
