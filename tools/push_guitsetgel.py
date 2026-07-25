#!/usr/bin/env python3
"""Excel -> Selbe_guitsetgel_consolidated (ArcGIS hosted table) loader.

Reads the "Autoupdate dashboard" workbooks and appends ONE new snapshot per
Багц (append-only: old ognoo rows are never touched). Each output row is one
(task x building) cell of the sheet's "Ажил гүйцэтгэл" (actual) block.

  python3 tools/push_guitsetgel.py --dir ~/Desktop/7.20 --date 2026-07-20 [--push]

Without --push it only parses and prints a report (dry run).
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import openpyxl

LAYER = ("https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services/"
         "Selbe_guitsetgel_consolidated/FeatureServer/0")

# Every workbook lays its columns out differently, so the actual-progress block
# is pinned per sheet instead of guessed: (first, last) 1-based column of the
# "Ажил гүйцэтгэл" building columns. Re-check with --inspect when a new file
# arrives; the planned/schedule blocks that follow must stay out of the range.
FILES = [
    ("Багц 1 -Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 7.20.xlsm", "Багц 1", "барилга",
     [("9F", 8, 19), ("12F", 7, 14)]),
    ("Багц 2 -Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 07.20.xlsm", "Багц 2", "барилга",
     [("9F", 9, 30), ("12F", 8, 11)]),
    ("Багц 3.1 - Төлөвлөгөө гүйцэтгэл Autoupdate dashboard.xlsm", "Багц 3.1", "барилга",
     [("9F", 8, 18)]),
    ("Багц 3.2 - Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 07.20.xlsm", "Багц 3.2", "барилга",
     [("9F", 8, 19)]),
    ("Багц 3.3 - Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 07.20.xlsm", "Багц 3.3", "барилга",
     [("9F", 8, 21)]),
    ("Багц 4.1 - Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 07.20.xlsm", "Багц 4-1", "блок",
     [("9F", 8, 23)]),
    # 4.2's 9F carries BOTH its 9-давхар and 12-давхар buildings; its 12F sheet
    # only repeats the 12-давхар ones, so that sheet is skipped.
    ("Багц 4.2 - Төлөвлөгөө гүйцэтгэл Autoupdate dashboard - 6.24.xlsm", "Багц 4-2", "блок",
     [("9F", 8, 21)]),
]

BLOCK_RE = re.compile(r"^\d+/\d+(\s+(барилга|блок))?$")

# The phase rows are written three ways across the workbooks ("A." latin, "А"
# cyrillic bare, title-case names). The table's canonical form is latin "A." /
# cyrillic "Б." with the uppercase name — `dugaar='Б.'` is how the portal reads
# a building's construction total, so a stray "Б" would go unseen.
PHASE = {
    "A": ("A.", "Бэлтгэл ажил"),
    "А": ("A.", "Бэлтгэл ажил"),
    "Б": ("Б.", "БАРИЛГА УГСРАЛТЫН АЖИЛ"),
    "B": ("Б.", "БАРИЛГА УГСРАЛТЫН АЖИЛ"),
}


def canon_phase(no, ajil):
    key = no.rstrip(".").strip()
    if key in PHASE and len(key) == 1:
        return PHASE[key]
    return no, ajil


def num(s):
    """Excel cell -> float, or None if blank/text/#DIV/0!."""
    if isinstance(s, (int, float)) and not isinstance(s, bool):
        return float(s)
    return None


def dugaar_str(v):
    """Column A's № verbatim: '1', '1.1', 'A.', 'Б1' — never '1.0'."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, float):
        return repr(round(v, 6)).rstrip("0").rstrip(".")
    return clean_text(v)


def level_from_no(no, weight):
    """Hierarchy depth from the № format (port of src/modules/sheet/ags.ts).
    "A."/"Б." phase=1, "Б1" sub-phase=2, "N.M" group=4, integer = category (3)
    when its weight is 1/blank else leaf (5)."""
    s = str(no or "").strip()
    if not s:
        return None
    if re.match(r"^[A-Za-zА-Яа-яӨөҮү]\.", s):
        return 1
    if re.match(r"^[A-Za-zА-Яа-яӨөҮү]\d", s):
        return 2
    if re.match(r"^\d+\.\d+", s):
        return 4
    if re.match(r"^\d+$", s):
        return 3 if weight is None or abs(weight - 1) < 1e-6 else 5
    return None


def clean_text(v):
    """Collapse the line breaks and padding the sheets wrap long task names with —
    the table stores them single-spaced, and the name is part of a row's identity."""
    return re.sub(r"\s+", " ", str(v)).strip()


def split_no(a, b):
    """Column A holds either the № alone (task name in B) or "A. Бэлтгэл ажил"
    with B empty — the phase rows keep № and name in one cell."""
    a_s = dugaar_str(a)
    b_s = "" if b is None else clean_text(b)
    if b_s:
        return a_s, b_s
    m = re.match(r"^([A-Za-zА-Яа-яӨөҮү]\S*)\s+(.+)$", a_s)
    return (m.group(1), m.group(2).strip()) if m else (a_s, "")


def find_header(ws_rows):
    """Row index (0-based) of the '№' header row, and its № column (0-based)."""
    for i, row in enumerate(ws_rows[:14]):
        for j, c in enumerate(row):
            if isinstance(c, str) and c.strip() == "№":
                return i, j
    raise SystemExit("no '№' header row found")


def parse_sheet(rows, first, last, bagts, suffix, ognoo):
    hdr, col_no = find_header(rows)
    col_w = next(j for j, c in enumerate(rows[hdr])
                 if isinstance(c, str) and c.strip().startswith("Хувийн жин"))
    names_row = rows[hdr + 2]
    data_start = hdr + 4  # blank row + building-name row + "Хүн хүчний тоо" row

    blocks = []  # (0-based column, barilga_blok value)
    for j in range(first - 1, last):
        raw = names_row[j] if j < len(names_row) else None
        name = "" if raw is None else str(raw).strip()
        if not BLOCK_RE.match(name):
            continue
        blocks.append((j, name if name.endswith(("барилга", "блок")) else f"{name} {suffix}"))
    if not blocks:
        raise SystemExit(f"{bagts}: no building columns in {first}..{last}")

    out, section, skipped = [], None, 0
    for row in rows[data_start:]:
        no, ajil = split_no(row[col_no] if col_no < len(row) else None,
                            row[col_no + 1] if col_no + 1 < len(row) else None)
        if not no and not ajil:
            skipped += 1
            continue
        no, ajil = canon_phase(no, ajil)
        w = num(row[col_w]) if col_w < len(row) else None
        niit = num(row[col_w + 1]) if col_w + 1 < len(row) else None
        lvl = level_from_no(no, w)
        if lvl is not None and lvl != 5:
            section = ajil
        for j, blok in blocks:
            pct = num(row[j]) if j < len(row) else None
            if pct is None:
                continue  # empty cell = not reported; the table stores no row for it
            out.append({
                "bagts": bagts, "ognoo": ognoo, "torol": "actual", "huvilbar": 1,
                "tuvshin": lvl, "dugaar": no, "ajil": ajil,
                "angilal_a": None, "angilal_b": section,
                "huviin_jin": w, "niit_jin": niit,
                "barilga_blok": blok,
                "guitsetgel": pct,
                "aldaatai": None,
            })
    return out, [b for _, b in blocks], skipped


def load(directory, date, only=None):
    feats = []
    for fname, bagts, suffix, sheets in FILES:
        if only and bagts not in only:
            continue
        path = Path(directory) / fname
        if not path.exists():
            print(f"!! missing: {fname}")
            continue
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for sheet, first, last in sheets:
            rows = [list(r) for r in wb[sheet].iter_rows(values_only=True)]
            got, blocks, skipped = parse_sheet(rows, first, last, bagts, suffix, date)
            odd = [f for f in got if not 0 <= f["guitsetgel"] <= 1] + [f for f in got if f["tuvshin"] is None]
            print(f"{bagts:9s} {sheet:4s} {len(blocks):2d} buildings -> {len(got):5d} rows "
                  f"({skipped} blank sheet rows skipped, {len(odd)} suspect)")
            for f in odd[:5]:
                print(f"          ?? {f['barilga_blok']} {f['dugaar']!r} {f['ajil'][:30]} "
                      f"lvl={f['tuvshin']} {f['guitsetgel']}")
            print(f"          {', '.join(blocks)}")
            feats += got
        wb.close()
    return feats


def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    with urllib.request.urlopen(urllib.request.Request(url, body)) as r:
        j = json.load(r)
    if j.get("error"):
        raise SystemExit(f"ArcGIS: {j['error'].get('message')} {j['error'].get('details')}")
    return j


def push(feats, chunk=500):
    """The layer accepts anonymous edits (that is how the portal's «Гүйцэтгэл
    бөглөх» page writes). Set ARCGIS_TOKEN if that is ever locked down."""
    token = os.environ.get("ARCGIS_TOKEN", "")
    added = 0
    for i in range(0, len(feats), chunk):
        batch = [{"attributes": a} for a in feats[i:i + chunk]]
        params = {"adds": json.dumps(batch, ensure_ascii=False),
                  "rollbackOnFailure": "true", "f": "json"}
        if token:
            params["token"] = token
        j = post(f"{LAYER}/applyEdits", params)
        res = j.get("addResults", [])
        bad = [r for r in res if not r.get("success")]
        if bad:
            raise SystemExit(f"chunk {i}: {bad[:3]}")
        added += len(res)
        print(f"  +{added}/{len(feats)}")
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--date", required=True, help="snapshot ognoo, YYYY-MM-DD")
    ap.add_argument("--bagts", nargs="*", help="limit to these bagts values")
    ap.add_argument("--push", action="store_true", help="write to ArcGIS (default: dry run)")
    ap.add_argument("--out", help="also dump the parsed rows to this JSON file")
    a = ap.parse_args()

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", a.date):
        sys.exit("--date must be YYYY-MM-DD")
    feats = load(a.dir, a.date, a.bagts)
    print(f"\nTOTAL {len(feats)} rows for ognoo {a.date}")
    if a.out:
        Path(a.out).write_text(json.dumps(feats, ensure_ascii=False), encoding="utf-8")

    if not a.push:
        print("dry run — nothing written. Re-run with --push to load.")
        return
    for bagts in sorted({f["bagts"] for f in feats}):
        j = post(f"{LAYER}/query", {"where": f"bagts='{bagts}' AND ognoo=DATE '{a.date}'",
                                    "returnCountOnly": "true", "f": "json"})
        if j.get("count"):
            sys.exit(f"{bagts} already has {j['count']} rows on {a.date} — refusing to duplicate.")
    push(feats)


if __name__ == "__main__":
    main()
