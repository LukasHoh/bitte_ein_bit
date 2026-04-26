from pathlib import Path
import duckdb


ROOT = Path(__file__).resolve().parent
ESCO_DIR = ROOT / "esco"
ISCO_DIR = ROOT / "isco"

ESCO_DB = ROOT / "esco.duckdb"
ISCO_DB = ROOT / "isco.duckdb"


def csv_to_table_name(csv_path: Path) -> str:
    return csv_path.stem.replace("-", "_").replace(" ", "_")


def load_folder_into_db(db_path: Path, source_dir: Path) -> None:
    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory does not exist: {source_dir}")

    csv_files = sorted(source_dir.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in: {source_dir}")

    con = duckdb.connect(str(db_path))
    try:
        for csv_file in csv_files:
            table_name = csv_to_table_name(csv_file)
            sql = f"""
            CREATE OR REPLACE TABLE "{table_name}" AS
            SELECT *
            FROM read_csv_auto(
                '{csv_file.as_posix()}',
                header = true,
                all_varchar = true,
                ignore_errors = true
            );
            """
            con.execute(sql)
            count = con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
            print(f"Loaded {csv_file.name:<50} -> {table_name:<45} rows={count}")
    finally:
        con.close()


def main() -> None:
    print(f"Building ESCO DB at: {ESCO_DB}")
    load_folder_into_db(ESCO_DB, ESCO_DIR)
    print()
    print(f"Building ISCO DB at: {ISCO_DB}")
    load_folder_into_db(ISCO_DB, ISCO_DIR)
    print()
    print("Done.")


if __name__ == "__main__":
    main()
