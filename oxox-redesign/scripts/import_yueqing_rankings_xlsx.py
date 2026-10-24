#!/usr/bin/env python3
"""Import the supplied Yueqing cumulative-ranking XLSX without third-party deps.

The workbook is a three-column source table: rank, company_name, band_label.
Blank cells after rank 779 inherit the preceding explicit band. Ranks may have
source gaps and must never be synthesized. Stable IDs are reused only for an
exact name match, a unique normalized-name match, or an explicit registry alias.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CELL_REF = re.compile(r"^([A-Z]+)")
BAND_NORMALIZATIONS = {
    "230-280万美金": "230-280万美元",
    "190-230万": "190-230万美元",
    "165-190万": "165-190万美元",
    "130-150万": "130-150万美元",
    "110-115万": "110-115万美元",
}
RANGE_PATTERN = re.compile(r"^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)万美元$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--period-id", required=True)
    parser.add_argument("--period-label", required=True)
    parser.add_argument("--as-of", required=True)
    return parser.parse_args()


def normalize_name(name: str) -> str:
    return re.sub(r"[\s\u3000（）()·•,，.。\-—_]+", "", name)


def normalize_band(raw: str, fallback: str | None) -> str:
    value = raw.strip()
    if not value and fallback:
        return fallback
    value = BAND_NORMALIZATIONS.get(value, value)
    if not value:
        raise ValueError("A ranking row has no export band")
    return value


def read_xlsx_rows(path: Path) -> tuple[str, list[dict]]:
    with zipfile.ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(f"{NS}t"))
            for item in shared_root.findall(f"{NS}si")
        ]
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        xml_rows = sheet_root.findall(f".//{NS}row")
        if not xml_rows:
            raise ValueError("The workbook has no rows")

        parsed_rows = []
        for row in xml_rows:
            values: dict[str, str] = {}
            for cell in row.findall(f"{NS}c"):
                match = CELL_REF.match(cell.attrib.get("r", ""))
                if not match:
                    continue
                value_node = cell.find(f"{NS}v")
                inline_node = cell.find(f"{NS}is")
                if value_node is not None:
                    value = shared[int(value_node.text)] if cell.attrib.get("t") == "s" else (value_node.text or "")
                elif inline_node is not None:
                    value = "".join(node.text or "" for node in inline_node.iter(f"{NS}t"))
                else:
                    value = ""
                values[match.group(1)] = value.strip()
            parsed_rows.append(values)

    header = parsed_rows[0]
    if header.get("A") != "序号" or header.get("B") != "企业名称" or header.get("C") != "累计出口美元区间":
        raise ValueError(f"Unexpected workbook columns: {header}")

    rows = []
    current_band = None
    for source_row, values in enumerate(parsed_rows[1:], start=2):
        rank_text = values.get("A", "")
        company_name = values.get("B", "")
        band_label = normalize_band(values.get("C", ""), current_band)
        current_band = band_label
        if not rank_text or not company_name:
            raise ValueError(f"Missing rank or company name at Excel row {source_row}")
        rows.append(
            {
                "source_row": source_row,
                "rank": int(rank_text),
                "company_name": company_name,
                "band_label": band_label,
            }
        )

    ranks = [row["rank"] for row in rows]
    if ranks != sorted(ranks) or len(set(ranks)) != len(ranks):
        raise ValueError("Ranks must be sorted and unique")
    if not ranks or ranks[0] != 1:
        raise ValueError("The ranking must start at rank 1")
    source_ranks = set(ranks)
    rank_gaps = [rank for rank in range(1, ranks[-1] + 1) if rank not in source_ranks]
    return rank_gaps, rows


def make_bands(rows: list[dict]) -> list[dict]:
    counts = Counter(row["band_label"] for row in rows)
    labels = list(counts)
    bands = []
    for index, label in enumerate(labels, start=1):
        match = RANGE_PATTERN.fullmatch(label)
        bands.append(
            {
                "id": f"b{index:02d}",
                "label": label,
                "min_usd_10k": float(match.group(1)) if match else None,
                "max_usd_10k": float(match.group(2)) if match else None,
                "count": counts[label],
            }
        )
    return bands


def match_companies(rows: list[dict], companies: list[dict]) -> None:
    by_name: dict[str, str] = {}
    normalized: dict[str, set[str]] = defaultdict(set)
    by_id = {company["company_id"]: company for company in companies}

    for company in companies:
        for name in [company["company_name"], *company.get("aliases", [])]:
            previous = by_name.get(name)
            if previous and previous != company["company_id"]:
                raise ValueError(f"Ambiguous exact company name in registry: {name}")
            by_name[name] = company["company_id"]
            normalized[normalize_name(name)].add(company["company_id"])

    name_counts = Counter(row["company_name"] for row in rows)
    next_id = max(int(company["company_id"][2:]) for company in companies) + 1
    for row in rows:
        source_name = row["company_name"]
        company_id = by_name.get(source_name)
        if company_id is None:
            candidates = normalized.get(normalize_name(source_name), set())
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
        row["company_id"] = company_id


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    args = parse_args()
    rank_gaps, rows = read_xlsx_rows(args.workbook)
    data_dir = args.output
    companies_path = data_dir / "companies.json"
    companies = json.loads(companies_path.read_text(encoding="utf-8"))
    match_companies(rows, companies)

    band_labels = list(dict.fromkeys(row["band_label"] for row in rows))
    bands = make_bands(rows)
    band_ids = {band["label"]: band["id"] for band in bands}
    duplicate_ids = {
        company_id
        for company_id, count in Counter(row["company_id"] for row in rows).items()
        if count > 1
    }
    records = [
        {
            "rank": row["rank"],
            "company_id": row["company_id"],
            "company_name": row["company_name"],
            "band_id": band_ids[row["band_label"]],
            "band_label": row["band_label"],
            "source_row": row["source_row"],
            "source_duplicate": row["company_id"] in duplicate_ids,
        }
        for row in rows
    ]
    data = {
        "period": {
            "id": args.period_id,
            "label": args.period_label,
            "type": "year_to_date",
            "as_of": args.as_of,
            "metric": "exports",
        },
        "source_note": "排名来自用户提供的累计出口区间数据；仅展示源表排名与出口额区间，不推算精确出口额。源表未提供的名次保持缺号。",
        "source_file": args.workbook.name,
        "validation": {
            "source_row_count": len(records),
            "source_rank_gaps": rank_gaps,
            "duplicate_company_ids": sorted(duplicate_ids),
        },
        "bands": bands,
        "records": records,
    }

    write_json(data_dir / "companies.json", companies)
    write_json(data_dir / f"{args.period_id}.json", data)

    manifest_path = data_dir / "periods.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"periods": []}
    period_meta = {
        **data["period"],
        "file": f"{args.period_id}.json",
        "record_count": len(records),
    }
    manifest["periods"] = [item for item in manifest["periods"] if item["id"] != args.period_id]
    manifest["periods"].append(period_meta)
    manifest["periods"].sort(key=lambda item: (item["as_of"], item.get("precision") == "exact"), reverse=True)
    manifest["latest"] = manifest["periods"][0]["id"]
    write_json(manifest_path, manifest)

    print(json.dumps({
        "records": len(records),
        "companies": len(companies),
        "bands": len(bands),
        "source_rank_gaps": rank_gaps,
        "duplicate_company_ids": sorted(duplicate_ids),
        "band_labels": band_labels,
        "output": str(data_dir / f"{args.period_id}.json"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
