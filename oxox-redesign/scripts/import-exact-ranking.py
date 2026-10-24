#!/usr/bin/env python3
"""Import the exact 2026 Jan-Jun export ranking from the supplied XLSX file."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import Counter
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROW_PATTERN = re.compile(r"^(\d+)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$")


def read_first_sheet_values(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [
            "".join(node.text or "" for node in item.iter(f"{NS}t"))
            for item in shared_root.findall(f"{NS}si")
        ]
        sheet_root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        values = []
        for cell in sheet_root.findall(f".//{NS}c"):
            value = cell.find(f"{NS}v")
            if value is None:
                continue
            values.append(shared[int(value.text)] if cell.attrib.get("t") == "s" else value.text)
        return values


def format_amount(raw: str) -> str:
    value = Decimal(raw)
    decimals = max(0, -value.as_tuple().exponent)
    return f"{value:,.{decimals}f}"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: scripts/import-exact-ranking.py <source.xlsx>")

    source = Path(sys.argv[1]).expanduser().resolve()
    repo = Path(__file__).resolve().parents[1]
    data_dir = repo / "public/data/yueqing-export-ranking"
    companies_path = data_dir / "companies.json"
    output_path = data_dir / "2026-ytd-06-exact.json"

    values = read_first_sheet_values(source)
    if values[:3] != [
        "2026年1-6月乐清进出口企业报表",
        "序号 分类名称 累计出口美元",
        "($)[万美元] 累计出口美元区间",
    ]:
        raise ValueError("Unexpected workbook heading or column layout")

    parsed = []
    for source_row, value in enumerate(values[3:], start=4):
        match = ROW_PATTERN.fullmatch(value.strip())
        if not match:
            raise ValueError(f"Could not parse row {source_row}: {value!r}")
        rank, name, amount = match.groups()
        parsed.append({
            "rank": int(rank),
            "company_name": name,
            "amount_raw": amount,
            "source_row": source_row,
        })

    companies = json.loads(companies_path.read_text(encoding="utf-8"))
    name_to_id: dict[str, str] = {}
    for company in companies:
        for name in [company["company_name"], *company.get("aliases", [])]:
            existing = name_to_id.get(name)
            if existing and existing != company["company_id"]:
                raise ValueError(f"Ambiguous company name in registry: {name}")
            name_to_id[name] = company["company_id"]

    next_id = max(int(company["company_id"][2:]) for company in companies) + 1
    for row in parsed:
        company_id = name_to_id.get(row["company_name"])
        if company_id is None:
            company_id = f"YQ{next_id:06d}"
            next_id += 1
            companies.append({
                "company_id": company_id,
                "company_name": row["company_name"],
                "aliases": [],
                "needs_review": True,
            })
            name_to_id[row["company_name"]] = company_id
        row["company_id"] = company_id

    duplicate_ids = {company_id for company_id, count in Counter(row["company_id"] for row in parsed).items() if count > 1}
    source_ranks = {row["rank"] for row in parsed}
    rank_gaps = [rank for rank in range(min(source_ranks), max(source_ranks) + 1) if rank not in source_ranks]
    records = []
    for row in parsed:
        amount = Decimal(row["amount_raw"])
        amount_label = f"（{format_amount(row['amount_raw'])} 万美元）"
        records.append({
            "rank": row["rank"],
            "company_id": row["company_id"],
            "company_name": row["company_name"],
            "amount_usd_10k": float(amount),
            "amount_label": amount_label,
            "band_id": "exact",
            "band_label": amount_label,
            "source_row": row["source_row"],
            "source_duplicate": row["company_id"] in duplicate_ids,
        })

    dataset = {
        "period": {
            "id": "2026-ytd-06-exact",
            "label": "2026年1—6月（精准数值）",
            "type": "year_to_date",
            "as_of": "2026-06-30",
            "metric": "exports",
            "precision": "exact",
            "unit": "万美元",
        },
        "source_note": "源表字段为累计出口美元，单位为万美元；精准金额按源表原值展示。源表未提供第16名，且重复企业行予以原样保留并标记。",
        "source_file": source.name,
        "validation": {
            "source_row_count": len(records),
            "source_rank_gaps": rank_gaps,
            "duplicate_company_ids": sorted(duplicate_ids),
        },
        "bands": [],
        "records": records,
    }

    options = {"ensure_ascii": False, "separators": (",", ":")}
    companies_path.write_text(json.dumps(companies, **options), encoding="utf-8")
    output_path.write_text(json.dumps(dataset, **options), encoding="utf-8")
    print(json.dumps({
        "records": len(records),
        "companies": len(companies),
        "new_companies": len(companies) - 3643,
        "rank_gaps": rank_gaps,
        "duplicate_company_ids": sorted(duplicate_ids),
        "output": str(output_path),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
