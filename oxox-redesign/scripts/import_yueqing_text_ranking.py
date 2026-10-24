#!/usr/bin/env python3
"""Import cumulative ranking text while preserving stable company IDs."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

HEADER = re.compile(r"^(\d+)-(\d+)名\s+\(累计出口：(.+?)\)$")
RANKED = re.compile(r"^(\d+)\.\s*(.+)$")
CSV_ROW = re.compile(r"^\s*(\d+)\s*[，,]\s*(.*?)\s*[，,]\s*(.*?)\s*$")
TSV_ROW = re.compile(r"^\s*(\d+)\t([^\t]+)(?:\t(.*))?$")
RANGE = re.compile(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)万美元$")


def normalize_name(name: str) -> str:
    return re.sub(r"[\s\u3000（）()·•,，.。\-—_]+", "", name)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--companies", type=Path, required=True)
    parser.add_argument("--current-period", type=Path, required=True)
    parser.add_argument("--aliases", type=Path, required=True)
    parser.add_argument("--period-id", default="2026-ytd-05")
    parser.add_argument("--period-label", default="2026年1—5月")
    parser.add_argument("--as-of", default="2026-05-31")
    parser.add_argument("--metric", choices=["exports"], default="exports")
    parser.add_argument("--drop-source-row", action="append", default=[])
    parser.add_argument(
        "--implicit-start-rank",
        type=int,
        help="Rank assigned to the first unnumbered source row; later unnumbered rows increment from it.",
    )
    parser.add_argument(
        "--unknown-band-range",
        action="append",
        default=[],
        help="Inclusive rank range whose source band is unavailable, for example 28-101",
    )
    parser.add_argument(
        "--band-range",
        action="append",
        default=[],
        help="Confirmed inclusive rank band, for example 1-52=270-5500万美元",
    )
    parser.add_argument(
        "--prefer-forced-bands",
        action="store_true",
        help="Use confirmed --band-range values when a pasted row contains a conflicting band.",
    )
    return parser.parse_args()


def parse_rank_range(value: str) -> tuple[int, int]:
    start, separator, end = value.partition("-")
    if not separator or not start.isdigit() or not end.isdigit():
        raise ValueError(f"Invalid rank range: {value}")
    return int(start), int(end)


def parse_band_range(value: str) -> tuple[int, int, str]:
    rank_range, separator, label = value.partition("=")
    if not separator or not label.strip():
        raise ValueError(f"Invalid band range: {value}")
    start, end = parse_rank_range(rank_range)
    return start, end, label.strip()


def parse_sources(
    paths: list[Path],
    *,
    drop_source_rows: set[str] | None = None,
    unknown_band_ranges: list[tuple[int, int]] | None = None,
    forced_band_ranges: list[tuple[int, int, str]] | None = None,
    prefer_forced_bands: bool = False,
    implicit_start_rank: int | None = None,
) -> list[dict]:
    records = []
    inferred_rank = None
    band_label = None
    drop_source_rows = drop_source_rows or set()
    unknown_band_ranges = unknown_band_ranges or []
    forced_band_ranges = forced_band_ranges or []
    for path in paths:
        for source_line, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            line = raw.strip()
            source_key = f"{path.parent.name}/{path.name}:{source_line}"
            if source_key in drop_source_rows:
                continue
            if (
                not line
                or re.match(r"^\d{4}年.*排名", line)
                or re.match(r"^\d+\s*-\s*\d+", line)
                or line.startswith("注：")
                or line.startswith("序号")
                or line.startswith("根据您提供")
            ):
                continue
            header = HEADER.fullmatch(line)
            if header:
                start, _, raw_label = header.groups()
                inferred_rank = int(start)
                band_label = raw_label.replace("区间", "").replace("或未明确", "")
                continue
            delimited_line = line[1:].lstrip() if line.startswith(("，", ",")) else line
            rank_prefix = re.match(r"^\s*(\d+)\s*[，,]", delimited_line)
            forced_band = next(
                (
                    label
                    for start, end, label in forced_band_ranges
                    if start <= int(rank_prefix.group(1)) <= end
                ),
                None,
            ) if rank_prefix else None
            delimited_row = CSV_ROW.fullmatch(delimited_line)
            tsv_row = TSV_ROW.fullmatch(raw)
            if delimited_row:
                rank = int(delimited_row.group(1))
                company_name = delimited_row.group(2).strip()
                provided_band = delimited_row.group(3).strip()
                if (
                    forced_band
                    and provided_band
                    and forced_band != provided_band
                    and not prefer_forced_bands
                ):
                    raise ValueError(
                        f"Source band conflicts with confirmed band at {path}:{source_line}"
                    )
                if forced_band:
                    row_band_label = forced_band
                elif provided_band:
                    band_label = provided_band
                    row_band_label = band_label
                else:
                    row_band_label = band_label
                inferred_rank = rank + 1
            elif tsv_row:
                rank = int(tsv_row.group(1))
                company_name = tsv_row.group(2).strip()
                provided_band = (tsv_row.group(3) or "").strip()
                is_unknown = any(start <= rank <= end for start, end in unknown_band_ranges)
                if (
                    forced_band
                    and provided_band
                    and forced_band != provided_band
                    and not prefer_forced_bands
                ):
                    raise ValueError(
                        f"Source band conflicts with confirmed band at {path}:{source_line}"
                    )
                if forced_band:
                    row_band_label = forced_band
                elif is_unknown:
                    row_band_label = "区间未提供"
                elif provided_band:
                    band_label = provided_band
                    row_band_label = band_label
                elif band_label:
                    row_band_label = band_label
                else:
                    raise ValueError(f"Missing band before {path}:{source_line}")
                inferred_rank = rank + 1
            else:
                ranked = RANKED.fullmatch(line)
                if ranked:
                    rank, company_name = int(ranked.group(1)), ranked.group(2)
                elif inferred_rank is not None:
                    rank, company_name = inferred_rank, line
                elif implicit_start_rank is not None and not records:
                    rank, company_name = implicit_start_rank, line
                else:
                    raise ValueError(f"Unclassified line {path}:{source_line}: {line}")
                forced_band = next(
                    (
                        label
                        for start, end, label in forced_band_ranges
                        if start <= rank <= end
                    ),
                    None,
                )
                row_band_label = forced_band or band_label
            if row_band_label is None:
                raise ValueError(f"Missing band header before {path}:{source_line}")
            records.append(
                {
                    "rank": rank,
                    "company_name": company_name,
                    "band_label": row_band_label,
                    "source_file": f"{path.parent.name}/{path.name}",
                    "source_line": source_line,
                }
            )
            inferred_rank = rank + 1

    expected = list(range(1, len(records) + 1))
    if [record["rank"] for record in records] != expected:
        raise ValueError("Ranks must be continuous and sorted from 1")
    return records


def make_bands(records: list[dict]) -> list[dict]:
    labels = list(dict.fromkeys(record["band_label"] for record in records))
    bands = []
    for index, label in enumerate(labels, start=1):
        match = RANGE.fullmatch(label)
        bands.append(
            {
                "id": f"b{index:02d}",
                "label": label,
                "min_usd_10k": float(match.group(1)) if match else None,
                "max_usd_10k": float(match.group(2)) if match else None,
                "count": sum(record["band_label"] == label for record in records),
            }
        )
    return bands


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    args = parse_args()
    records = parse_sources(
        args.sources,
        drop_source_rows=set(args.drop_source_row),
        unknown_band_ranges=[parse_rank_range(value) for value in args.unknown_band_range],
        forced_band_ranges=[parse_band_range(value) for value in args.band_range],
        prefer_forced_bands=args.prefer_forced_bands,
        implicit_start_rank=args.implicit_start_rank,
    )
    companies = json.loads(args.companies.read_text(encoding="utf-8"))
    current_period = json.loads(args.current_period.read_text(encoding="utf-8"))
    explicit_aliases = json.loads(args.aliases.read_text(encoding="utf-8"))

    by_name = {}
    normalized = defaultdict(set)
    by_id = {company["company_id"]: company for company in companies}
    for company in companies:
        for name in [company["company_name"], *company.get("aliases", [])]:
            by_name[name] = company["company_id"]
            normalized[normalize_name(name)].add(company["company_id"])

    for alias, canonical in explicit_aliases.items():
        if canonical not in by_name:
            raise ValueError(f"Alias target is not in company registry: {canonical}")
        company_id = by_name[canonical]
        by_name[alias] = company_id
        normalized[normalize_name(alias)].add(company_id)
        if alias not in by_id[company_id]["aliases"]:
            by_id[company_id]["aliases"].append(alias)

    name_counts = Counter(record["company_name"] for record in records)
    next_id = max(int(company["company_id"][2:]) for company in companies) + 1
    matched_records = []
    for record in records:
        source_name = record["company_name"]
        company_id = by_name.get(source_name)
        if company_id is None:
            candidates = normalized[normalize_name(source_name)]
            if len(candidates) == 1:
                company_id = next(iter(candidates))
                if source_name not in by_id[company_id]["aliases"]:
                    by_id[company_id]["aliases"].append(source_name)
            elif candidates:
                raise ValueError(f"Ambiguous normalized company name: {source_name}")
            else:
                company_id = f"YQ{next_id:06d}"
                next_id += 1
                company = {
                    "company_id": company_id,
                    "company_name": source_name,
                    "aliases": [],
                    "needs_review": name_counts[source_name] > 1,
                }
                companies.append(company)
                by_id[company_id] = company
                by_name[source_name] = company_id
                normalized[normalize_name(source_name)].add(company_id)

        if name_counts[source_name] > 1:
            by_id[company_id]["needs_review"] = True
        matched_records.append({**record, "company_id": company_id})

    bands = make_bands(records)
    band_ids = {band["label"]: band["id"] for band in bands}
    output_records = [
        {
            "rank": record["rank"],
            "company_id": record["company_id"],
            "company_name": record["company_name"],
            "band_id": band_ids[record["band_label"]],
            "band_label": record["band_label"],
            "source_file": record["source_file"],
            "source_line": record["source_line"],
            "source_duplicate": name_counts[record["company_name"]] > 1,
        }
        for record in matched_records
    ]
    period = {
        "id": args.period_id,
        "label": args.period_label,
        "type": "year_to_date",
        "as_of": args.as_of,
        "metric": args.metric,
    }
    data = {
        "period": period,
        "source_note": "排名来自用户提供的区间数据；仅展示累计排名与出口额区间，不推算精确出口额。",
        "bands": bands,
        "records": output_records,
    }
    manifest_path = args.output / "periods.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "latest": current_period["period"]["id"],
            "periods": [
                {
                    **current_period["period"],
                    "file": f"{current_period['period']['id']}.json",
                    "record_count": len(current_period["records"]),
                }
            ],
        }
    period_meta = {**period, "file": f"{args.period_id}.json", "record_count": len(output_records)}
    manifest["periods"] = [
        item for item in manifest["periods"] if item["id"] != args.period_id
    ] + [period_meta]
    manifest["periods"].sort(key=lambda item: item["as_of"], reverse=True)
    manifest["latest"] = manifest["periods"][0]["id"]
    write_json(args.output / "companies.json", companies)
    write_json(args.output / f"{args.period_id}.json", data)
    write_json(manifest_path, manifest)
    print(
        f"Imported {len(output_records)} rows; registry now has {len(companies)} companies; "
        f"{sum(bool(company['aliases']) for company in companies)} companies have aliases"
    )


if __name__ == "__main__":
    main()
