#!/usr/bin/env python3
"""Level-5 activity export -> Selbe_guitsetgel_consolidated.

One row per (block x activity) of the Primavera-style "Level 4" sheet, mapped
onto the consolidated table's columns and appended as its own snapshot
(torol='level5', so it can be told apart from the sheet-filled 'actual' rows).

  python3 tools/push_level5.py --file ~/Desktop/'Level 5 (1).xlsx' [--push]

Dropped on the way in — the table has no column for them: Мөнгөн дүн, the four
date columns, planned/contract percentages and Гүйцэтгэлийн зөрүү. Ажлын бүлэг
is dropped too but is recoverable: each Ажлын дэд бүлэг belongs to exactly one.
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))
from push_guitsetgel import LAYER, post, push  # noqa: E402

SHEET = "Level 4"

# 0-based columns of the export.
C_STEP, C_ID, C_BAGTS, C_BLOCK = 0, 1, 2, 3
C_GROUP, C_SUB, C_SUB2, C_NAME = 4, 5, 6, 8
C_AHZ, C_ACTUAL, C_DELAY = 10, 19, 23

# The workbook's Багц spelling vs the table's ("Багц 4.1" is "Багц 4-1" there),
# and the suffix each Багц's blocks carry in barilga_blok.
BAGTS = {
    "Багц 1": ("Багц 1", "барилга"),
    "Багц 2": ("Багц 2", "барилга"),
    "Багц 3.1": ("Багц 3.1", "барилга"),
    "Багц 3.2": ("Багц 3.2", "барилга"),
    "Багц 3.3": ("Багц 3.3", "барилга"),
    "Багц 4.1": ("Багц 4-1", "блок"),
    "Багц 4.2": ("Багц 4-2", "блок"),
}

# The export was written with a legacy Mongolian codepage: ө/ү come through as
# the Ukrainian є/ї (86k occurrences), which would fork every affected task name
# away from its match in the existing rows.
LEGACY = str.maketrans("єїЄЇ", "өүӨҮ")


def text(v):
    return re.sub(r"\s+", " ", str(v).translate(LEGACY)).strip() if v is not None else ""


def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def parse(path, ognoo):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    it = wb[SHEET].iter_rows(values_only=True)
    header = next(it)
    print(f"sheet date cell: {header[0]}  ->  ognoo {ognoo}")

    out, stats = [], collections.Counter()
    for row in it:
        raw_bagts = text(row[C_BAGTS])
        if raw_bagts not in BAGTS:
            stats["unknown bagts"] += 1
            continue
        bagts, suffix = BAGTS[raw_bagts]
        block = text(row[C_BLOCK])
        if not re.match(r"^\d+/\d+$", block):
            stats["bad block"] += 1
            continue
        name = text(row[C_NAME])
        if not name:
            stats["no activity name"] += 1
            continue

        act = text(row[C_ID])
        if act == "#REF!":  # the workbook lost these links; keep the row, drop the id
            act, stats["#REF! activity id"] = "", 1 + stats["#REF! activity id"]
        # Empty Бодит гүйцэтгэл means "nothing done yet" here, not "not reported":
        # those rows carry Бодит гүйцэтгэл АХЗ = 0 and a negative Гүйцэтгэлийн зөрүү.
        pct = num(row[C_ACTUAL])
        if pct is None:
            pct = 0.0
            stats["blank actual -> 0"] += 1
        delay = num(row[C_DELAY])

        out.append({
            "bagts": bagts, "ognoo": ognoo, "torol": "level5", "huvilbar": 1,
            "tuvshin": 5,                      # every row is a leaf activity
            "dugaar": act or None,             # Activity ID; blank where it was #REF!
            "ajil": name,
            "angilal_a": text(row[C_SUB]).upper() or None,   # Ажлын дэд бүлэг
            "angilal_b": text(row[C_SUB2]) or None,          # Ажлын 2-р дэд бүлэг
            "huviin_jin": None,
            "niit_jin": num(row[C_AHZ]),       # АХЗ — багц-wide weight, sums to 1
            "barilga_blok": f"{block} {suffix}",
            "guitsetgel": pct,
            # Хоцролтын төрөл: 1 Шийдэл/Захиалагч, 2 Гүйцэтгэгч,
            # 3 Газар чөлөөлөлт, 4 Хуулийн асуудал.
            "aldaatai": str(int(delay)) if delay else None,
        })
    wb.close()
    return out, stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--date", default="2026-06-30", help="snapshot ognoo, YYYY-MM-DD")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()

    feats, stats = parse(a.file, a.date)
    per = collections.Counter(f["bagts"] for f in feats)
    for b in sorted(per):
        blocks = len({f["barilga_blok"] for f in feats if f["bagts"] == b})
        done = sum(1 for f in feats if f["bagts"] == b and f["guitsetgel"])
        print(f"  {b:9s} {per[b]:6d} rows  {blocks:3d} blocks  {done:6d} with progress > 0")
    for k, v in stats.items():
        print(f"  note: {k}: {v}")
    print(f"\nTOTAL {len(feats)} rows for ognoo {a.date}")
    if a.out:
        Path(a.out).write_text(json.dumps(feats, ensure_ascii=False), encoding="utf-8")
    if not a.push:
        print("dry run — nothing written. Re-run with --push to load.")
        return

    j = post(f"{LAYER}/query", {"where": f"torol='level5' AND ognoo=DATE '{a.date}'",
                                "returnCountOnly": "true", "f": "json"})
    if j.get("count"):
        sys.exit(f"level5 rows already exist on {a.date} ({j['count']}) — refusing to duplicate.")
    push(feats)


if __name__ == "__main__":
    main()
