from __future__ import annotations

import argparse
import csv
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb


TOC_URL = "https://rplumber.ilo.org/metadata/toc/indicator?lang=en&format=.csv"
DOWNLOAD_URL_TEMPLATE = "https://rplumber.ilo.org/data/indicator?id={indicator_id}&format=.csv"

# Curated set from the occupation-enricher implementation plan.
# These are downloaded by default (unless explicit --ids are passed).
OCCUPATION_ENRICHER_INDICATOR_IDS = [
    # Priority 1: demand
    "EMP_TEMP_SEX_OCU_NB_A",
    "EMP_TEMP_SEX_OC2_NB_A",
    # Priority 2: security
    "UNE_TUNE_SEX_OCU_NB_A",
    "UNE_TUNE_SEX_OCU_EDU_NB_A",
    # Priority 3: workload
    "HOW_TEMP_SEX_OC2_NB_A",
    "HOW_XEES_SEX_OC2_NB_A",
    # Priority 4: occupation-based informality
    "EMP_NIFL_SEX_OCU_NB_A",
    "EMP_NIFL_SEX_OCU_RT_A",
    "EMP_NIFL_SEX_OC2_NB_A",
    "EMP_NIFL_SEX_OC2_RT_A",
    "EMP_PIFL_SEX_OC2_NB_A",
    "EMP_PIFL_SEX_OC2_RT_A",
    # Priority 5: employees split
    "EES_TEES_SEX_OCU_NB_A",
    "EES_TEES_SEX_OC2_NB_A",
]

# Relevance filters for occupation-matching and local realities.
LABEL_KEYWORDS = (
    "earnings",
    "employment",
    "unemployment",
    "informal employment",
    "employment outside the formal sector",
    "jobs gap",
    "labour underutilization",
    "underemployment",
    "minimum wage",
    "cpi",
    "exchange rate",
    "ppp conversion factor",
    "labour productivity",
)

# Prefer indicators that are occupation-aware or economically useful.
ID_HINTS = ("OCU", "ISCO", "EARN", "EMTA", "UNE", "IFL", "JOB", "LU2", "LU3", "LU4", "CPI", "EXR", "PPP")


def fetch_text(url: str, timeout_seconds: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    # Some local Python installs may not have up-to-date CA bundles.
    # Fallback is explicit here to keep the download script usable.
    unverified_context = ssl._create_unverified_context()
    with urllib.request.urlopen(
        req, timeout=timeout_seconds, context=unverified_context
    ) as response:
        return response.read().decode("utf-8", errors="replace")


def sanitize_filename(name: str) -> str:
    name = name.strip().replace(" ", "_")
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
    name = re.sub(r"_+", "_", name)
    return name.strip("_")


def parse_toc_rows(csv_text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(csv_text.splitlines())
    rows: list[dict[str, str]] = []
    for row in reader:
        if not row:
            continue
        rows.append(row)
    return rows


def get_indicator_id(row: dict[str, str]) -> str:
    for key in ("\ufeff\"id\"", "\ufeffid", "id", "indicator", "file name", "file_name"):
        value = row.get(key)
        if value:
            return value.strip()
    return ""


def get_indicator_label(row: dict[str, str]) -> str:
    for key in ("label", "indicator.label", "name", "title"):
        value = row.get(key)
        if value:
            return value.strip()
    return ""


def is_relevant(indicator_id: str, label: str) -> bool:
    low_label = label.lower()
    if any(keyword in low_label for keyword in LABEL_KEYWORDS):
        return True
    if any(hint in indicator_id.upper() for hint in ID_HINTS):
        return True
    return False


def select_relevant_indicators(toc_rows: list[dict[str, str]]) -> list[tuple[str, str]]:
    selected: list[tuple[str, str]] = []
    seen_ids: set[str] = set()
    for row in toc_rows:
        indicator_id = get_indicator_id(row)
        if not indicator_id or indicator_id in seen_ids:
            continue
        label = get_indicator_label(row)
        if is_relevant(indicator_id, label):
            selected.append((indicator_id, label))
            seen_ids.add(indicator_id)
    return selected


def select_curated_indicators(toc_rows: list[dict[str, str]]) -> list[tuple[str, str]]:
    by_id: dict[str, str] = {}
    for row in toc_rows:
        indicator_id = get_indicator_id(row)
        if not indicator_id:
            continue
        by_id[indicator_id] = get_indicator_label(row)

    selected: list[tuple[str, str]] = []
    for indicator_id in OCCUPATION_ENRICHER_INDICATOR_IDS:
        if indicator_id in by_id:
            selected.append((indicator_id, by_id[indicator_id] or "curated-selection"))
        else:
            # Still include it if metadata row is missing; download endpoint may still work.
            selected.append((indicator_id, "curated-selection"))
    return selected


def download_indicator_csv(indicator_id: str, output_dir: Path) -> Path:
    url = DOWNLOAD_URL_TEMPLATE.format(
        indicator_id=urllib.parse.quote(indicator_id, safe="")
    )
    csv_text = fetch_text(url)
    output_path = output_dir / f"{sanitize_filename(indicator_id)}.csv"
    output_path.write_text(csv_text, encoding="utf-8")
    return output_path


def build_duckdb_for_csv(csv_path: Path, duckdb_path: Path) -> None:
    table_name = sanitize_filename(csv_path.stem)
    con = duckdb.connect(str(duckdb_path))
    try:
        con.execute(
            f"""
            CREATE OR REPLACE TABLE "{table_name}" AS
            SELECT *
            FROM read_csv_auto(
                '{csv_path.as_posix()}',
                header = true,
                all_varchar = true,
                ignore_errors = true
            );
            """
        )
    finally:
        con.close()


def write_manifest(manifest_path: Path, rows: list[tuple[str, str, str]]) -> None:
    with manifest_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["indicator_id", "label", "csv_file"])
        writer.writerows(rows)


def main() -> int:
    default_output_dir = Path(__file__).resolve().parent / "ilostat"

    parser = argparse.ArgumentParser(
        description=(
            "Download relevant ILOSTAT indicator datasets as CSV and create one DuckDB per dataset."
        )
    )
    parser.add_argument(
        "--output-dir",
        default=str(default_output_dir),
        help="Directory where CSV and DuckDB files are saved.",
    )
    parser.add_argument(
        "--max-datasets",
        type=int,
        default=0,
        help="Optional limit for number of datasets (0 = no limit).",
    )
    parser.add_argument(
        "--ids",
        nargs="*",
        default=[],
        help="Optional explicit indicator IDs to download instead of automatic relevance selection.",
    )
    parser.add_argument(
        "--mode",
        choices=["curated", "relevant"],
        default="curated",
        help=(
            "Dataset selection mode when --ids is not provided. "
            "'curated' downloads planned occupation-enricher datasets."
        ),
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        if args.ids:
            indicators = [(indicator_id, "manual-selection") for indicator_id in args.ids]
        else:
            toc_text = fetch_text(TOC_URL)
            toc_rows = parse_toc_rows(toc_text)
            if args.mode == "curated":
                indicators = select_curated_indicators(toc_rows)
            else:
                indicators = select_relevant_indicators(toc_rows)
    except urllib.error.URLError as exc:
        print(f"Failed to fetch ILOSTAT metadata: {exc}", file=sys.stderr)
        return 1

    if args.max_datasets > 0:
        indicators = indicators[: args.max_datasets]

    if not indicators:
        print("No indicators selected. Nothing to do.")
        return 0

    print(f"Selected datasets: {len(indicators)}")
    manifest_rows: list[tuple[str, str, str]] = []

    for index, (indicator_id, label) in enumerate(indicators, start=1):
        print(f"[{index}/{len(indicators)}] {indicator_id} | {label}")
        try:
            csv_path = download_indicator_csv(indicator_id, output_dir)
            duckdb_path = output_dir / f"{sanitize_filename(indicator_id)}.duckdb"
            build_duckdb_for_csv(csv_path, duckdb_path)
            manifest_rows.append((indicator_id, label, csv_path.name))
        except Exception as exc:  # noqa: BLE001
            print(f"  -> skipped ({exc})", file=sys.stderr)

    manifest_path = output_dir / "relevant_ilostat_manifest.csv"
    write_manifest(manifest_path, manifest_rows)
    print(f"Done. Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
