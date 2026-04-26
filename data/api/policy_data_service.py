from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb


_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_ILOSTAT_DIR = _REPO_ROOT / "data" / "ilostat"


@dataclass
class _FilterContext:
    country: str
    sex: str
    reference_year: int | None
    start_year: int | None
    end_year: int | None


class PolicyDataService:
    """Local data-layer service for policymaker dashboard."""

    def __init__(self, ilostat_dir: str | Path = _DEFAULT_ILOSTAT_DIR) -> None:
        self.ilostat_dir = Path(ilostat_dir)

    @staticmethod
    def _normalize_country(country: str) -> str:
        return (country or "").strip().upper()

    @staticmethod
    def _to_iso_sex(sex: str | None) -> str:
        value = (sex or "").strip().lower()
        if value in {"male", "m", "sex_m"}:
            return "SEX_M"
        if value in {"female", "f", "sex_f"}:
            return "SEX_F"
        return "SEX_T"

    def _dataset_path(self, filename: str) -> Path:
        return self.ilostat_dir / filename

    def _read_rows(self, filename: str) -> list[tuple[Any, ...]]:
        csv_path = self._dataset_path(filename)
        if not csv_path.exists():
            return []
        con = duckdb.connect()
        try:
            result = con.execute(
                f"""
                SELECT *
                FROM read_csv_auto(
                    '{csv_path.as_posix()}',
                    header = true,
                    all_varchar = true,
                    ignore_errors = true
                )
                """
            )
            raw_rows = result.fetchall()
            col_names = [desc[0] for desc in result.description]
        finally:
            con.close()

        idx = {name: i for i, name in enumerate(col_names)}
        out: list[tuple[Any, ...]] = []
        for row in raw_rows:
            ref_area = row[idx["ref_area"]] if "ref_area" in idx else None
            time_value = row[idx["time"]] if "time" in idx else None
            obs_value = row[idx["obs_value"]] if "obs_value" in idx else None
            if ref_area is None or time_value is None or obs_value is None:
                continue
            try:
                year = int(str(time_value).strip())
                value = float(str(obs_value).strip())
            except ValueError:
                continue
            sex = row[idx["sex"]] if "sex" in idx else "SEX_T"
            classif1 = row[idx["classif1"]] if "classif1" in idx else "ALL"
            out.append((ref_area, sex, classif1, year, value))
        return out

    @staticmethod
    def _pick_nearest_year(years: list[int], target_year: int | None) -> int | None:
        if not years:
            return None
        years_sorted = sorted(set(years))
        if target_year is None:
            return years_sorted[-1]
        if target_year in years_sorted:
            return target_year
        return min(years_sorted, key=lambda y: abs(y - target_year))

    def _filter_with_sex_fallback(
        self,
        rows: list[tuple[Any, ...]],
        country: str,
        sex: str,
        warnings: list[str],
    ) -> tuple[list[tuple[Any, ...]], str]:
        country_rows = [r for r in rows if str(r[0]).upper() == country]
        if not country_rows:
            warnings.append(f"No rows for country={country}.")
            return [], sex

        direct = [r for r in country_rows if str(r[1]) == sex]
        if direct:
            return direct, sex

        if sex != "SEX_T":
            fallback = [r for r in country_rows if str(r[1]) == "SEX_T"]
            if fallback:
                warnings.append(f"Sex fallback applied: {sex} -> SEX_T.")
                return fallback, "SEX_T"

        warnings.append(f"No rows for sex={sex}.")
        return [], sex

    def _get_minimum_wage(
        self, ctx: _FilterContext, warnings: list[str]
    ) -> tuple[float | None, int | None]:
        rows = self._read_rows("EAR_INEE_NOC_NB_A.csv")
        filtered, _ = self._filter_with_sex_fallback(rows, ctx.country, ctx.sex, warnings)
        if not filtered:
            return None, None
        years = [int(r[3]) for r in filtered]
        picked_year = self._pick_nearest_year(years, ctx.reference_year)
        if picked_year is None:
            return None, None
        values = [float(r[4]) for r in filtered if int(r[3]) == picked_year]
        return (sum(values) / len(values), picked_year) if values else (None, picked_year)

    def _get_sector_growth(
        self, ctx: _FilterContext, warnings: list[str]
    ) -> list[dict[str, Any]]:
        rows = self._read_rows("EMP_TEMP_SEX_ECO_NB_A.csv")
        filtered, _ = self._filter_with_sex_fallback(rows, ctx.country, ctx.sex, warnings)
        if not filtered:
            return []

        by_sector: dict[str, dict[int, float]] = {}
        for _, _, classif1, year, obs_value in filtered:
            sector = str(classif1 or "").strip() or "UNKNOWN"
            by_sector.setdefault(sector, {})[int(year)] = float(obs_value)

        out: list[dict[str, Any]] = []
        for sector, year_map in by_sector.items():
            years = sorted(year_map.keys())
            if not years:
                continue
            target_start = ctx.start_year if ctx.start_year is not None else years[0]
            target_end = ctx.end_year if ctx.end_year is not None else years[-1]
            start_year = self._pick_nearest_year(years, target_start)
            end_year = self._pick_nearest_year(years, target_end)
            if start_year is None or end_year is None:
                continue
            start_val = year_map.get(start_year)
            end_val = year_map.get(end_year)
            if start_val is None or end_val is None:
                continue
            growth_abs = end_val - start_val
            growth_pct = (growth_abs / start_val * 100.0) if start_val != 0 else None
            out.append(
                {
                    "economic_activity": sector,
                    "start_year": start_year,
                    "end_year": end_year,
                    "employment_start": round(start_val, 6),
                    "employment_end": round(end_val, 6),
                    "growth_abs": round(growth_abs, 6),
                    "growth_pct": round(growth_pct, 6) if growth_pct is not None else None,
                }
            )
        out.sort(key=lambda x: (x["growth_pct"] is not None, x["growth_pct"]), reverse=True)
        return out

    def _get_education_returns(
        self, ctx: _FilterContext, warnings: list[str]
    ) -> tuple[list[dict[str, Any]], int | None]:
        rows = self._read_rows("EAR_EMTA_SEX_EDU_NB_A.csv")
        filtered, _ = self._filter_with_sex_fallback(rows, ctx.country, ctx.sex, warnings)
        if not filtered:
            return [], None

        years = [int(r[3]) for r in filtered]
        picked_year = self._pick_nearest_year(years, ctx.reference_year)
        if picked_year is None:
            return [], None

        by_edu: dict[str, list[float]] = {}
        for _, _, classif1, year, obs_value in filtered:
            if int(year) != picked_year:
                continue
            edu_level = str(classif1 or "").strip() or "UNKNOWN"
            by_edu.setdefault(edu_level, []).append(float(obs_value))

        avg_by_edu = {
            edu: (sum(values) / len(values))
            for edu, values in by_edu.items()
            if values
        }
        if not avg_by_edu:
            return [], picked_year

        baseline = min(avg_by_edu.values())
        out = []
        for edu, avg_value in sorted(avg_by_edu.items(), key=lambda item: item[1]):
            premium_pct = (
                ((avg_value - baseline) / baseline) * 100.0 if baseline != 0 else None
            )
            out.append(
                {
                    "education_level": edu,
                    "avg_monthly_earnings_local": round(avg_value, 6),
                    "premium_vs_lowest_level_pct": round(premium_pct, 6)
                    if premium_pct is not None
                    else None,
                }
            )
        return out, picked_year

    def get_dashboard_data(
        self,
        country: str,
        sex: str | None = None,
        reference_year: int | None = None,
        start_year: int | None = None,
        end_year: int | None = None,
    ) -> dict[str, Any]:
        warnings: list[str] = []
        ctx = _FilterContext(
            country=self._normalize_country(country),
            sex=self._to_iso_sex(sex),
            reference_year=reference_year,
            start_year=start_year,
            end_year=end_year,
        )

        minimum_wage, wage_year = self._get_minimum_wage(ctx, warnings)
        sector_growth = self._get_sector_growth(ctx, warnings)
        education_returns, education_year = self._get_education_returns(ctx, warnings)
        avg_edu_earnings = (
            round(
                sum(item["avg_monthly_earnings_local"] for item in education_returns)
                / len(education_returns),
                6,
            )
            if education_returns
            else None
        )

        return {
            "context": {
                "country": ctx.country,
                "sex": ctx.sex,
                "reference_year": ctx.reference_year,
                "start_year": ctx.start_year,
                "end_year": ctx.end_year,
            },
            "kpis": {
                "minimum_wage_monthly_local": round(minimum_wage, 6)
                if minimum_wage is not None
                else None,
                "minimum_wage_year_used": wage_year,
                "avg_monthly_earnings_by_education_overall": avg_edu_earnings,
                "education_earnings_year_used": education_year,
            },
            "sector_growth": sector_growth,
            "education_returns": education_returns,
            "warnings": warnings,
        }


if __name__ == "__main__":
    service = PolicyDataService()
    sample = service.get_dashboard_data(
        country="AFG",
        sex="female",
        reference_year=2020,
        start_year=2018,
        end_year=2022,
    )
    print("kpis:", sample["kpis"])
    print("sector_growth_count:", len(sample["sector_growth"]))
    print("education_returns_count:", len(sample["education_returns"]))
    if sample["warnings"]:
        print("warnings:", sample["warnings"])

