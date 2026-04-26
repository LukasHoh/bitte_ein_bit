#!/usr/bin/env python3
"""Import unique ref_area.label values from CSV into Supabase regions table."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_CSV_PATH = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "ilostat"
    / "EAR_EMTA_SEX_OCU_NB_A-filtered-2026-04-26.csv"
)


def _get_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    return value


def _resolve_supabase_key() -> str:
    return (
        _get_env("SUPABASE_SERVICE_ROLE_KEY")
        or _get_env("SUPABASE_KEY")
        or _get_env("SUPABASE_PUBLISHABLE_KEY")
        or _get_env("VITE_SUPABASE_PUBLISHABLE_KEY")
    )


def _request_json(url: str, key: str, method: str = "GET", payload: list[dict] | None = None) -> list[dict]:
    body = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=minimal"

    request = urllib.request.Request(url=url, method=method, headers=headers, data=body)
    with urllib.request.urlopen(request) as response:
        raw = response.read().decode("utf-8")
        if not raw:
            return []
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        return [parsed]


def _extract_unique_regions(csv_path: Path) -> list[str]:
    regions: set[str] = set()
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames:
            reader.fieldnames = [(field or "").strip().strip('"') for field in reader.fieldnames]
        for row in reader:
            region = (row.get("ref_area.label") or "").strip().strip('"')
            if region:
                regions.add(region)
    return sorted(regions)


def _chunk(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def import_regions(csv_path: Path, dry_run: bool = False) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    extracted = _extract_unique_regions(csv_path)
    if not extracted:
        print("No region values found in CSV.")
        return 0

    supabase_url = _get_env("SUPABASE_URL") or _get_env("VITE_SUPABASE_URL")
    supabase_key = _resolve_supabase_key()
    if dry_run and (not supabase_url or not supabase_key):
        print(f"CSV unique regions: {len(extracted)}")
        print("Dry run mode without Supabase credentials: DB checks skipped.")
        return len(extracted)

    if not supabase_url:
        raise RuntimeError("Missing SUPABASE_URL (or VITE_SUPABASE_URL).")
    if not supabase_key:
        raise RuntimeError(
            "Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_KEY."
        )

    quoted_table = urllib.parse.quote("regions")
    select_url = f"{supabase_url}/rest/v1/{quoted_table}?select=name&limit=5000"
    existing_rows = _request_json(select_url, supabase_key, method="GET")
    existing_lc = {
        str(row.get("name", "")).strip().lower()
        for row in existing_rows
        if str(row.get("name", "")).strip()
    }

    to_insert = [name for name in extracted if name.lower() not in existing_lc]
    print(f"CSV unique regions: {len(extracted)}")
    print(f"Existing DB regions: {len(existing_lc)}")
    print(f"Missing regions to insert: {len(to_insert)}")

    if dry_run or not to_insert:
        if dry_run:
            print("Dry run mode: no rows inserted.")
        return len(to_insert)

    insert_url = f"{supabase_url}/rest/v1/{quoted_table}"
    inserted = 0
    for names in _chunk(to_insert, 500):
        payload = [{"name": name} for name in names]
        _request_json(insert_url, supabase_key, method="POST", payload=payload)
        inserted += len(names)

    print(f"Inserted rows: {inserted}")
    return inserted


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import unique ref_area.label values into Supabase public.regions."
    )
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_CSV_PATH),
        help="Path to CSV file containing ref_area.label column.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show counts only; do not insert rows.",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv).expanduser().resolve()
    try:
        import_regions(csv_path=csv_path, dry_run=args.dry_run)
        return 0
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        print(f"HTTP error {exc.code}: {detail}", file=sys.stderr)
        if exc.code in (401, 403):
            print(
                "Tip: use SUPABASE_SERVICE_ROLE_KEY to bypass RLS for this import.",
                file=sys.stderr,
            )
        return 1
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Import failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
