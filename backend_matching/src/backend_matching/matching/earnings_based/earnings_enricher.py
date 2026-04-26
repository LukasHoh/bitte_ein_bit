from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb


@dataclass
class EarningsEnrichedResult:
    occupation_uri: str
    occupation_label: str | None
    earnings_value_local: float | None


class EarningsEnricher:
    """Return local earnings per occupation URI.

    The component returns only requested enrichment values.
    If no mapping/value is available, earnings_value_local is None.
    """

    def __init__(
        self,
        esco_db_path: str | Path = Path(__file__).parents[4] / "data" / "esco.duckdb",
        earnings_csv_path: str | Path = Path(__file__).parents[4] / "data" / "ilostat" / "SDG_0851_SEX_OCU_NB.csv",
    ) -> None:
        self.esco_db_path = str(esco_db_path)
        self.earnings_csv_path = Path(earnings_csv_path)
        self._occupation_to_isco_major: dict[str, str] = {}
        self._earnings_rows: dict[tuple[str, str, str], dict[int, float]] = {}
        self._load_occupation_index()
        self._load_earnings_index()

    @staticmethod
    def _to_iso_sex(sex: str | None) -> str:
        value = (sex or "").strip().lower()
        if value in {"male", "m", "sex_m"}:
            return "SEX_M"
        if value in {"female", "f", "sex_f"}:
            return "SEX_F"
        return "SEX_T"

    @staticmethod
    def _normalize_country(country: str) -> str:
        return (country or "").strip().upper()

    @staticmethod
    def _build_classif_from_isco_major(major: str) -> str:
        return f"OCU_ISCO08_{major}"

    def _load_occupation_index(self) -> None:
        con = duckdb.connect(self.esco_db_path, read_only=True)
        try:
            rows = con.execute(
                """
                SELECT conceptUri AS occupation_uri, iscoGroup
                FROM occupations_en
                WHERE conceptUri IS NOT NULL AND iscoGroup IS NOT NULL
                """
            ).fetchall()
        finally:
            con.close()
        for occupation_uri, isco_group in rows:
            isco_group_str = str(isco_group).strip()
            if isco_group_str and isco_group_str[0].isdigit():
                self._occupation_to_isco_major[occupation_uri] = isco_group_str[0]

    def _load_earnings_index(self) -> None:
        if not self.earnings_csv_path.exists():
            raise FileNotFoundError(f"Earnings CSV not found: {self.earnings_csv_path}")
        con = duckdb.connect()
        try:
            rows = con.execute(
                f"""
                SELECT
                    ref_area,
                    sex,
                    classif1,
                    TRY_CAST(time AS INTEGER) AS year,
                    TRY_CAST(obs_value AS DOUBLE) AS obs_value
                FROM read_csv_auto(
                    '{self.earnings_csv_path.as_posix()}',
                    header = true,
                    all_varchar = true,
                    ignore_errors = true
                )
                WHERE indicator = 'SDG_0851_SEX_OCU_NB'
                  AND ref_area IS NOT NULL
                  AND classif1 IS NOT NULL
                  AND year IS NOT NULL
                  AND obs_value IS NOT NULL
                  AND classif1 LIKE 'OCU_ISCO08_%'
                """
            ).fetchall()
        finally:
            con.close()
        for ref_area, sex, classif1, year, obs_value in rows:
            key = (str(ref_area).upper(), str(sex), str(classif1))
            self._earnings_rows.setdefault(key, {})[int(year)] = float(obs_value)

    @staticmethod
    def _pick_best_year(
        year_map: dict[int, float], reference_year: int | None
    ) -> float | None:
        if not year_map:
            return None
        years = sorted(year_map.keys())
        if reference_year is None:
            return year_map[years[-1]]
        if reference_year in year_map:
            return year_map[reference_year]
        nearest = min(years, key=lambda y: abs(y - reference_year))
        return year_map[nearest]

    def _extract_occupation(self, item: Any) -> tuple[str, str | None]:
        if isinstance(item, str):
            return item, None
        uri = getattr(item, "occupation_uri", None)
        label = getattr(item, "occupation_label", None)
        if uri:
            return str(uri), (str(label) if label is not None else None)
        if isinstance(item, dict):
            uri_dict = item.get("occupation_uri") or item.get("conceptUri")
            label_dict = item.get("occupation_label") or item.get("preferredLabel")
            if uri_dict:
                return str(uri_dict), (str(label_dict) if label_dict is not None else None)
        raise ValueError("Each occupation must be str, dict, or object with occupation_uri.")

    def _lookup(
        self, *, occupation_uri: str, country: str, sex: str | None, reference_year: int | None
    ) -> float | None:
        isco_major = self._occupation_to_isco_major.get(occupation_uri)
        if not isco_major:
            return None
        country_norm = self._normalize_country(country)
        sex_norm = self._to_iso_sex(sex)
        classif = self._build_classif_from_isco_major(isco_major)

        keys = [(country_norm, sex_norm, classif)]
        if sex_norm != "SEX_T":
            keys.append((country_norm, "SEX_T", classif))

        for key in keys:
            year_map = self._earnings_rows.get(key)
            value = self._pick_best_year(year_map or {}, reference_year)
            if value is not None:
                return value
        return None

    def enrich(
        self,
        occupations: list[Any],
        *,
        country: str,
        sex: str | None = None,
        region: str | None = None,
        reference_year: int | None = None,
    ) -> list[EarningsEnrichedResult]:
        _ = region
        result: list[EarningsEnrichedResult] = []
        for item in occupations:
            occupation_uri, occupation_label = self._extract_occupation(item)
            value = self._lookup(
                occupation_uri=occupation_uri,
                country=country,
                sex=sex,
                reference_year=reference_year,
            )
            result.append(
                EarningsEnrichedResult(
                    occupation_uri=occupation_uri,
                    occupation_label=occupation_label,
                    earnings_value_local=value,
                )
            )
        return result


if __name__ == "__main__":
    sample_occupations = [
        {
            "occupation_uri": "http://data.europa.eu/esco/occupation/00030d09-2b3a-4efd-87cc-c4ea39d27c34",
            "occupation_label": "technical director",
        }
    ]
    enricher = EarningsEnricher()
    out = enricher.enrich(sample_occupations, country="AFG", sex="female", reference_year=2020)
    for row in out:
        print(row)
