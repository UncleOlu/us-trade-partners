"""Fixture self-checks: assert every value recorded in tests/fixtures/*.json
against the raw/source_test/ files it cites, recomputed directly here
(not by re-running the fixture generation script) so a stale fixture
fails this suite.

Test ids: test_fxchk01_* .. test_fxchk09_*
"""

import csv
import json
import re

from conftest import FIXTURES_DIR, RAW_SOURCE_TEST_DIR, load_fixture, load_json


def _load_raw(name):
    return load_json(RAW_SOURCE_TEST_DIR / name)


def _single_row_value(name, value_field):
    data = _load_raw(name)
    header, rows = data[0], data[1:]
    assert len(rows) == 1
    return int(rows[0][header.index(value_field)])


def test_fxchk01_fixture_a_partner_world_totals_match_raw():
    fixture = load_fixture("fixture_a_partner_world_totals.json")
    checks = [
        ("china_5700", "imports", "partner_total_imports_large.response.json", "GEN_VAL_YR"),
        ("china_5700", "exports", "partner_total_exports_large.response.json", "ALL_VAL_YR"),
        ("st_pierre_and_miquelon_1610", "imports", "partner_total_imports_small.response.json", "GEN_VAL_YR"),
        ("st_pierre_and_miquelon_1610", "exports", "partner_total_exports_small.response.json", "ALL_VAL_YR"),
        ("world_dash", "imports", "partner_total_imports_world.response.json", "GEN_VAL_YR"),
        ("world_dash", "exports", "partner_total_exports_world.response.json", "ALL_VAL_YR"),
        ("eu_aggregate_0003", "imports", "partner_total_imports_special.response.json", "GEN_VAL_YR"),
        ("eu_aggregate_0003", "exports", "partner_total_exports_special.response.json", "ALL_VAL_YR"),
    ]
    for key, flow, fname, field in checks:
        expected = _single_row_value(fname, field)
        actual = fixture["values"][key][flow]["value"]
        assert actual == expected, f"{key}.{flow}: fixture says {actual}, raw file {fname} says {expected}"


def test_fxchk02_fixture_b_eu_boundary_matches_raw():
    fixture = load_fixture("fixture_b_eu_boundary.json")
    countries = {"croatia": "4791", "united_kingdom": "4120"}
    periods = ["2013-06", "2013-07", "2020-01", "2020-02"]
    for country in countries:
        for period in periods:
            for flow in ("imports", "exports"):
                fname = f"eu_boundary_{flow}_{country}_{period}.response.json"
                data = _load_raw(fname)
                header, rows = data[0], data[1:]
                mo_field = [h for h in header if h.endswith("_MO")][0]
                yr_field = [h for h in header if h.endswith("_YR")][0]
                expected_mo = int(rows[0][header.index(mo_field)])
                expected_yr = int(rows[0][header.index(yr_field)])
                got = fixture["values"][country][period][flow]
                assert got["mo"] == expected_mo, (country, period, flow, "mo")
                assert got["yr"] == expected_yr, (country, period, flow, "yr")


def test_fxchk03_fixture_c_df_proof_matches_raw():
    fixture = load_fixture("fixture_c_df_proof.json")
    df1 = _single_row_value("contrast_exports_DF_1.response.json", "ALL_VAL_YR")
    df2 = _single_row_value("contrast_exports_DF_2.response.json", "ALL_VAL_YR")
    total = _single_row_value("partner_total_exports_large.response.json", "ALL_VAL_YR")
    assert fixture["df_1"]["value"] == df1
    assert fixture["df_2"]["value"] == df2
    assert fixture["df_total_dash"]["value"] == total
    assert df1 + df2 == total


def test_fxchk04_fixture_d_observed_partner_codes_match_raw():
    fixture = load_fixture("fixture_d_observed_partner_codes.json")

    def get_rows(fname):
        data = _load_raw(fname)
        header, rows = data[0], data[1:]
        idx_lvl = header.index("SUMMARY_LVL")
        idx_code = header.index("CTY_CODE")
        idx_name = header.index("CTY_NAME")
        return [(r[idx_code], r[idx_name], r[idx_lvl]) for r in rows]

    imp = get_rows("all_partners_imports.response.json")
    exp = get_rows("all_partners_exports.response.json")
    det_imp = sorted(c for c, n, l in imp if l == "DET" and c != "-")
    det_exp = sorted(c for c, n, l in exp if l == "DET" and c != "-")
    assert fixture["imports"]["det_codes"] == det_imp
    assert fixture["exports"]["det_codes"] == det_exp

    imp_codes = {c for c, n, l in imp}
    exp_codes = {c for c, n, l in exp}
    assert fixture["codes_only_in_imports"] == sorted(imp_codes - exp_codes)
    assert fixture["codes_only_in_exports"] == sorted(exp_codes - imp_codes)
    assert "6022" in fixture["codes_only_in_imports"]
    assert "5790" in fixture["codes_only_in_exports"]


def test_fxchk05_fixture_e_chapter_sets_match_raw():
    fixture = load_fixture("fixture_e_chapter_sets.json")
    imp = _load_raw("hs2_imports_large.response.json")
    exp = _load_raw("hs2_exports_large.response.json")
    hdr_i, hdr_e = imp[0], exp[0]
    idx_i = hdr_i.index("I_COMMODITY")
    idx_e = hdr_e.index("E_COMMODITY")
    chaps_i = sorted(r[idx_i] for r in imp[1:])
    chaps_e = sorted(r[idx_e] for r in exp[1:])
    assert fixture["imports"]["chapters"] == chaps_i
    assert fixture["exports"]["chapters"] == chaps_e
    assert "77" not in chaps_i and "77" not in chaps_e
    assert "99" in chaps_i and "99" not in chaps_e
    assert "98" in chaps_i and "98" in chaps_e


def test_fxchk06_fixture_g_availability_matches_raw_csv():
    fixture = load_fixture("fixture_g_availability.json")
    with open(RAW_SOURCE_TEST_DIR / "availability.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    years_with_data = sorted({int(r["year"]) for r in rows if r["has_data"] == "True"})
    assert fixture["years_with_data_all_four_combinations"] == years_with_data
    assert years_with_data == list(range(2010, 2026))
    rows_2026 = [r for r in rows if r["year"] == "2026"]
    assert all(r["has_data"] == "False" for r in rows_2026)
    assert fixture["period_2026_12_has_data"] is False


def test_fxchk07_hs_sections_fixture_covers_every_chapter_once_except_77():
    fixture = load_json("./tests/fixtures/hs_sections_fixture.json")
    assert len(fixture["groups"]) == 22
    seen = {}
    for g in fixture["groups"]:
        for c in g["chapters"]:
            seen.setdefault(c, []).append(g["id"])
    all_chapters = [f"{n:02d}" for n in range(1, 100) if n != 77]
    missing = [c for c in all_chapters if c not in seen]
    multi = {c: gids for c, gids in seen.items() if len(gids) > 1}
    assert not missing, f"chapters missing from hs_sections_fixture: {missing}"
    assert not multi, f"chapters mapped to more than one group: {multi}"
    assert "77" not in seen
    assert seen["98"] == ["SPECIAL"] and seen["99"] == ["SPECIAL"]


def _strip_tags(html_text):
    clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html_text, flags=re.S)
    clean = re.sub(r"<[^>]+>", " ", clean)
    clean = clean.replace("&#039;", "'").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", clean)


def _total_row_from_saved_page(html_path, year):
    """Extract the displayed 'TOTAL <year> <exports> <imports> <balance>'
    figures from a saved census.gov 'Trade in Goods with <country>' page,
    exactly as displayed (comma-separated millions, one decimal)."""
    text = html_path.read_text(encoding="utf-8", errors="replace")
    clean = _strip_tags(text)
    m = re.search(rf"TOTAL {year} ([\d,.\-]+) ([\d,.\-]+) ([\d,.\-]+)", clean)
    assert m, f"TOTAL {year} row not found in {html_path.name}"
    return m.group(1), m.group(2), m.group(3)


def _million_display_to_usd(displayed):
    return round(float(displayed.replace(",", "")) * 1_000_000)


def test_fxchk08_published_examples_match_saved_source_html():
    """Recompute each of the published_examples/<code>_<year>.json (and
    special_8220.json) dollar fixtures directly from the saved census.gov
    page HTML/response text cited by that fixture, so a stale or
    hand-typo'd fixture fails. A fixture whose own outcome is
    not_applicable (no captured values, no page to compare against) is
    skipped, since it has no values block to check."""
    cases = [
        ("published_examples/5700_2023.json", "published_examples/sources/5700_2023.html", 2023),
        ("published_examples/1610_2023.json", "published_examples/sources/1610_2023.html", 2023),
        ("published_examples/4803_2023.json", "published_examples/sources/4803_2023.html", 2023),
        ("published_examples/6022_2023.json", "published_examples/sources/6022_2023.html", 2023),
        ("published_examples/4280_2023.json", "published_examples/sources/4280_2023.html", 2023),
        ("published_examples/special_8220.json", "published_examples/sources/8220_attempt.txt", 2013),
    ]
    for fixture_name, source_name, year in cases:
        fixture = load_fixture(fixture_name)
        if fixture.get("outcome") == "not_applicable":
            continue
        exports_disp, imports_disp, _balance_disp = _total_row_from_saved_page(FIXTURES_DIR / source_name, year)
        expected_exports_usd = _million_display_to_usd(exports_disp)
        expected_imports_usd = _million_display_to_usd(imports_disp)
        assert fixture["values"]["exports_displayed"] == exports_disp, fixture_name
        assert fixture["values"]["imports_displayed"] == imports_disp, fixture_name
        assert fixture["values"]["exports_usd"] == expected_exports_usd, (fixture_name, fixture["values"]["exports_usd"], expected_exports_usd)
        assert fixture["values"]["imports_usd"] == expected_imports_usd, (fixture_name, fixture["values"]["imports_usd"], expected_imports_usd)


def test_fxchk09_eu_members_fixture_matches_saved_europa_sources():
    """Recompute tests/fixtures/eu_members_fixture.json's accession and
    exit dates directly from the saved europa.eu pages it cites, and its
    Census CTY_CODE per member directly from
    raw/source_test/all_partners_imports.response.json, so a stale or
    hand-typo'd fixture fails."""
    fixture = load_fixture("eu_members_fixture.json")

    page1 = (FIXTURES_DIR / "sources" / "europa_eu_countries_list_page1.html").read_text(encoding="utf-8", errors="replace")
    page2 = (FIXTURES_DIR / "sources" / "europa_eu_countries_list_page2.html").read_text(encoding="utf-8", errors="replace")
    clean_pages = _strip_tags(page1) + " " + _strip_tags(page2)
    pattern = re.compile(r"([A-Z][a-zA-Z'\- ]{2,30}?) EU Member State since (\d{4})")
    member_since = {name.strip(): int(year) for name, year in pattern.findall(clean_pages)}
    for m in fixture["members"]:
        if m["name"] == "United Kingdom":
            continue  # not a current EU member; checked separately below via the history page
        assert m["name"] in member_since, f"{m['name']} not found on the saved current-members pages"
        assert int(m["accession_date"][:4]) == member_since[m["name"]], (
            m["name"], m["accession_date"], member_since[m["name"]]
        )

    hist_1970s = _strip_tags((FIXTURES_DIR / "sources" / "europa_eu_history_1970-79.html").read_text(encoding="utf-8", errors="replace"))
    assert "Denmark, Ireland and the United Kingdom join the European Communities on 1 January 1973" in hist_1970s
    for name in ("Denmark", "Ireland", "United Kingdom"):
        member = next(x for x in fixture["members"] if x["name"] == name)
        assert member["accession_date"] == "1973-01-01", name

    hist_2010s = _strip_tags((FIXTURES_DIR / "sources" / "europa_eu_history_2010-19.html").read_text(encoding="utf-8", errors="replace"))
    assert "1 July 2013" in hist_2010s and "Croatia becomes the 28th EU member" in hist_2010s
    croatia = next(x for x in fixture["members"] if x["name"] == "Croatia")
    assert croatia["accession_date"] == "2013-07-01"

    hist_2020s = _strip_tags((FIXTURES_DIR / "sources" / "europa_eu_history_2020-today.html").read_text(encoding="utf-8", errors="replace"))
    assert "31 January 2020" in hist_2020s and "United Kingdom leaves the EU" in hist_2020s
    uk = next(x for x in fixture["members"] if x["name"] == "United Kingdom")
    assert uk["exit_date"] == "2020-01-31"

    data = _load_raw("all_partners_imports.response.json")
    header, rows = data[0], data[1:]
    idx_code = header.index("CTY_CODE")
    idx_name = header.index("CTY_NAME")
    name_to_code = {r[idx_name]: r[idx_code] for r in rows}
    census_name_overrides = {"Czechia": "CZECH REPUBLIC"}
    for m in fixture["members"]:
        census_name = census_name_overrides.get(m["name"], m["name"].upper())
        expected_code = name_to_code.get(census_name)
        assert expected_code == m["cty_code"], (m["name"], census_name, expected_code, m["cty_code"])
