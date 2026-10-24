#!/usr/bin/env python3
"""Audit a pasted Yueqing ranking source and emit a normalized CSV."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROW = re.compile(r"^\s*(\d+)\s*[，,]\s*(.*?)\s*[，,]\s*(.*?)\s*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--band-range", action="append", default=[], required=True)
    return parser.parse_args()


def parse_band(value: str) -> tuple[int, int, str]:
    rank_range, separator, label = value.partition("=")
    start, dash, end = rank_range.partition("-")
    if not separator or not dash or not start.isdigit() or not end.isdigit() or not label:
        raise ValueError(f"Invalid band range: {value}")
    return int(start), int(end), label


def main() -> None:
    args = parse_args()
    bands = [parse_band(value) for value in args.band_range]
    rows = []
    for source_line, raw in enumerate(args.source.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if line.startswith(("，", ",")):
            line = line[1:].lstrip()
        match = ROW.fullmatch(line)
        if not match:
            continue
        rank = int(match.group(1))
        company_name = match.group(2).strip()
        band = next((label for start, end, label in bands if start <= rank <= end), None)
        if band is None:
            raise ValueError(f"Rank {rank} does not belong to a confirmed band")
        rows.append(
            {
                "rank": rank,
                "company_name": company_name,
                "band_label": band,
                "source_line": source_line,
            }
        )

    ranks = [row["rank"] for row in rows]
    expected = list(range(1, max(ranks, default=0) + 1))
    duplicates = Counter(row["company_name"] for row in rows)
    duplicate_names = sorted(name for name, count in duplicates.items() if count > 1)
    empty_names = [row["rank"] for row in rows if not row["company_name"]]
    invalid_names = [
        row["rank"]
        for row in rows
        if row["company_name"] != row["company_name"].strip()
        or row["company_name"].endswith((",", "，"))
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(
            output,
            fieldnames=["rank", "company_name", "band_label", "source_line"],
        )
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "record_count": len(rows),
        "rank_min": min(ranks, default=None),
        "rank_max": max(ranks, default=None),
        "missing_ranks": sorted(set(expected) - set(ranks)),
        "duplicate_ranks": sorted(rank for rank, count in Counter(ranks).items() if count > 1),
        "duplicate_company_names": duplicate_names,
        "empty_company_names": empty_names,
        "invalid_company_name_rows": invalid_names,
        "band_counts": Counter(row["band_label"] for row in rows),
        "sample_first": rows[:3],
        "sample_last": rows[-3:],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
