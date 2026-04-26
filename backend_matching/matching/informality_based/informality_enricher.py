from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb


@dataclass
class InformalityEnrichedResult:
    occupation_uri: str
    occupation_label: str | None
    informality_rate: float | None


class InformalityEnricher:
    """Return informality rate per occupation URI (or None if unavailable)."""

    def __init__(
        self,
        esco_db_path: str | Path = "backend_matching/data/esco.duckdb",
        occupation_rate_csv_path: str | Path = "backend_matching/data/ilostat/EMP_NIFL_SEX_OC2_RT_A.csv",
        occupation_rate_major_csv_path: str | Path = "backend_matching/data/ilostat/EMP_NIFL_SEX_OCU_RT_A.csv",
        # optional sector fallback for sparse countries
        sector_primary_csv_path: str | Path = "backend_matching/data/ilostat/SDG_0831_SEX_ECO_RT.csv",
        sector_fallback_csv_path: str | Path = "backend_matching/data/ilostat/SDG_B831_SEX_ECO_RT.csv",
    ) -> None:
        self.esco_db_path = str(esco_db_path)
        self.occupation_rate_csv_path = Path(occupation_rate_csv_path)
        self.occupation_rate_major_csv_path = Path(occupation_rate_major_csv_path)
        self.sector_primary_csv_path = Path(sector_primary_csv_path)
        self.sector_fallback_csv_path = Path(sector_fallback_csv_path)
        self._occupation_to_isco_major: dict[str, str] = {}
        self._occupation_to_isco_2digit: dict[str, str] = {}
        self._occupation_to_sector: dict[str, str] = {}
        self._rows_occ2: dict[tuple[str, str, str], dict[int, float]] = {}
        self._rows_ocu: dict[tuple[str, str, str], dict[int, float]] = {}
        self._rows_sector_primary: dict[tuple[str, str, str], dict[int, float]] = {}
        self._rows_sector_fallback: dict[tuple[str, str, str], dict[int, float]] = {}
        self._load_occupation_sector_proxy()
        self._load_informality_rows()

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
    def _pick_best_year(year_map: dict[int, float], reference_year: int | None) -> float | None:
        if not year_map:
            return None
        years = sorted(year_map.keys())
        if reference_year is None:
            return year_map[years[-1]]
        if reference_year in year_map:
            return year_map[reference_year]
        nearest = min(years, key=lambda y: abs(y - reference_year))
        return year_map[nearest]

    @staticmethod
    def _nace_to_sector_classif(nace_code: str | None) -> str | None:
        if not nace_code:
            return None
        token = str(nace_code).rstrip("/").split("/")[-1]
        if not token:
            return None
        # handle lettered sections if present
        first = token[0].upper()
        if first == "A":
            return "ECO_SECTOR_AGR"
        if first in {"B", "C", "D", "E", "F"}:
            return "ECO_SECTOR_IND"
        if first in {"G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"}:
            return "ECO_SECTOR_SER"
        # handle numeric prefixes (common in this dataset)
        digits = "".join(ch for ch in token if ch.isdigit())
        if not digits:
            return None
        prefix = int(digits[:2]) if len(digits) >= 2 else int(digits[0])
        if 1 <= prefix <= 3:
            return "ECO_SECTOR_AGR"
        if 5 <= prefix <= 43:
            return "ECO_SECTOR_IND"
        if 45 <= prefix <= 99:
            return "ECO_SECTOR_SER"
        return None

    def _load_occupation_sector_proxy(self) -> None:
        con = duckdb.connect(self.esco_db_path, read_only=True)
        try:
            rows = con.execute(
                """
                SELECT conceptUri AS occupation_uri, naceCode, iscoGroup
                FROM occupations_en
                WHERE conceptUri IS NOT NULL
                """
            ).fetchall()
        finally:
            con.close()
        for occupation_uri, nace_code, isco_group in rows:
            sector = self._nace_to_sector_classif(nace_code)
            if sector:
                self._occupation_to_sector[str(occupation_uri)] = sector
            digits = "".join(ch for ch in str(isco_group or "").strip() if ch.isdigit())
            if digits:
                self._occupation_to_isco_major[str(occupation_uri)] = digits[0]
            if len(digits) >= 2:
                self._occupation_to_isco_2digit[str(occupation_uri)] = digits[:2]

    def _load_rows_from_csv(
        self, csv_path: Path
    ) -> dict[tuple[str, str, str], dict[int, float]]:
        if not csv_path.exists():
            return {}
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
                    '{csv_path.as_posix()}',
                    header = true,
                    all_varchar = true,
                    ignore_errors = true
                )
                WHERE ref_area IS NOT NULL
                  AND classif1 IS NOT NULL
                  AND year IS NOT NULL
                  AND obs_value IS NOT NULL
                  AND classif1 LIKE 'ECO_SECTOR_%'
                """
            ).fetchall()
        finally:
            con.close()
        mapped: dict[tuple[str, str, str], dict[int, float]] = {}
        for ref_area, sex, classif1, year, obs_value in rows:
            key = (str(ref_area).upper(), str(sex), str(classif1))
            mapped.setdefault(key, {})[int(year)] = float(obs_value)
        return mapped

    def _load_informality_rows(self) -> None:
        # Occupation-specific tables
        self._rows_occ2 = self._load_rows_from_csv(self.occupation_rate_csv_path)
        self._rows_ocu = self._load_rows_from_csv(self.occupation_rate_major_csv_path)
        # Sector fallback tables
        self._rows_sector_primary = self._load_rows_from_csv(self.sector_primary_csv_path)
        self._rows_sector_fallback = self._load_rows_from_csv(self.sector_fallback_csv_path)

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
        country_norm = self._normalize_country(country)
        sex_norm = self._to_iso_sex(sex)

        # 1) Occupation-specific, ISCO level 2
        code2 = self._occupation_to_isco_2digit.get(occupation_uri)
        if code2:
            keys = [(country_norm, sex_norm, f"OC2_ISCO08_{code2}")]
            if sex_norm != "SEX_T":
                keys.append((country_norm, "SEX_T", f"OC2_ISCO08_{code2}"))
            for key in keys:
                value = self._pick_best_year(self._rows_occ2.get(key, {}), reference_year)
                if value is not None:
                    return value

        # 2) Occupation-specific, ISCO major
        code1 = self._occupation_to_isco_major.get(occupation_uri)
        if code1:
            keys = [(country_norm, sex_norm, f"OCU_ISCO08_{code1}")]
            if sex_norm != "SEX_T":
                keys.append((country_norm, "SEX_T", f"OCU_ISCO08_{code1}"))
            for key in keys:
                value = self._pick_best_year(self._rows_ocu.get(key, {}), reference_year)
                if value is not None:
                    return value

        # 3) Sector fallback (existing behavior)
        sector = self._occupation_to_sector.get(occupation_uri)
        if not sector:
            return None
        keys = [(country_norm, sex_norm, sector)]
        if sex_norm != "SEX_T":
            keys.append((country_norm, "SEX_T", sector))
        for key in keys:
            value = self._pick_best_year(self._rows_sector_primary.get(key, {}), reference_year)
            if value is not None:
                return value
            value = self._pick_best_year(self._rows_sector_fallback.get(key, {}), reference_year)
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
    ) -> list[InformalityEnrichedResult]:
        _ = region
        out: list[InformalityEnrichedResult] = []
        for item in occupations:
            occupation_uri, occupation_label = self._extract_occupation(item)
            rate = self._lookup(
                occupation_uri=occupation_uri,
                country=country,
                sex=sex,
                reference_year=reference_year,
            )
            out.append(
                InformalityEnrichedResult(
                    occupation_uri=occupation_uri,
                    occupation_label=occupation_label,
                    informality_rate=rate,
                )
            )
        return out


if __name__ == "__main__":
    sample_occupations = [
        {
            "occupation_uri": "http://data.europa.eu/esco/occupation/00030d09-2b3a-4efd-87cc-c4ea39d27c34",
            "occupation_label": "technical director",
        }
    ]
    enricher = InformalityEnricher()
    out = enricher.enrich(sample_occupations, country="AFG", sex="female", reference_year=2021)
    for row in out:
        print(row)
