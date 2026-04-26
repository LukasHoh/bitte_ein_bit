from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import duckdb


_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_APP_DB_PATH = _REPO_ROOT / "customer_data" / "app.duckdb"



class CustomerDataService:
    """Provide regional customer/skill aggregates from customer_data DuckDB."""

    def __init__(self, app_db_path: str | Path = _DEFAULT_APP_DB_PATH) -> None:
        self.app_db_path = Path(app_db_path)

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self.app_db_path), read_only=True)

    def get_customer_summary(
        self,
        *,
        country: str,
        region: str | None = None,
        top_n_skills: int = 8,
    ) -> dict[str, Any]:
        country_n = (country or "").strip().upper()
        region_n = (region or "").strip()
        if not self.app_db_path.exists():
            return {
                "context": {
                    "country": country_n,
                    "region": region_n or None,
                    "ref_area": country_n,
                },
                "totals": {
                    "users_total_country": 0,
                    "users_in_region": 0,
                    "avg_skills_per_user_region": 0.0,
                },
                "skill_distribution": [],
                "opportunity_summary": [],
                "customers": [],
            }

        con = self._connect()
        try:
            country_rows = con.execute(
                """
                SELECT
                    p.id,
                    p.full_name,
                    COALESCE(NULLIF(p.region, ''), COALESCE(r.name, 'Unknown')) AS region_name,
                    r.country_code
                FROM profiles p
                LEFT JOIN regions r ON p.region_id = r.id
                WHERE r.country_code = ?
                """,
                [country_n],
            ).fetchall()

            region_rows = (
                [
                    row
                    for row in country_rows
                    if str(row[2]).strip().lower() == region_n.lower()
                ]
                if region_n
                else country_rows
            )

            region_user_ids = [str(row[0]) for row in region_rows]
            if region_user_ids:
                placeholders = ",".join(["?"] * len(region_user_ids))
                skill_rows = con.execute(
                    f"""
                    SELECT us.user_id, s.name
                    FROM user_skills us
                    JOIN skills s ON s.id = us.skill_id
                    WHERE us.user_id IN ({placeholders})
                    """,
                    region_user_ids,
                ).fetchall()
            else:
                skill_rows = []
        finally:
            con.close()

        skills_by_user: dict[str, list[str]] = defaultdict(list)
        skill_counter: Counter[str] = Counter()
        for user_id, skill_name in skill_rows:
            uid = str(user_id)
            skill = str(skill_name)
            skills_by_user[uid].append(skill)
            skill_counter[skill] += 1

        top_skills = [
            {"skill": skill, "count": count}
            for skill, count in skill_counter.most_common(max(top_n_skills, 1))
        ]

        opportunity_counter: Counter[str] = Counter()
        customer_rows: list[dict[str, Any]] = []
        for user_id, full_name, region_name, ccode in region_rows:
            uid = str(user_id)
            user_skills = sorted(skills_by_user.get(uid, []))
            top_suggestion = (
                f"skill-led path: {user_skills[0].lower()}" if user_skills else "no-skill-data"
            )
            opportunity_counter[top_suggestion] += 1
            customer_rows.append(
                {
                    "id": uid,
                    "name": str(full_name) if full_name else "Unknown",
                    "region": str(region_name),
                    "country": str(ccode),
                    "ref_area": str(ccode),
                    "skills": user_skills,
                    "top_occupation_suggestion": top_suggestion,
                }
            )

        top_opportunities = [
            {"occupation": occupation, "count": count}
            for occupation, count in opportunity_counter.most_common(5)
        ]

        total_skills = sum(len(x["skills"]) for x in customer_rows)
        avg_skills = round(total_skills / len(customer_rows), 2) if customer_rows else 0.0

        return {
            "context": {
                "country": country_n,
                "region": region_n or None,
                "ref_area": country_n,
            },
            "totals": {
                "users_total_country": len(country_rows),
                "users_in_region": len(customer_rows),
                "avg_skills_per_user_region": avg_skills,
            },
            "skill_distribution": top_skills,
            "opportunity_summary": top_opportunities,
            "customers": customer_rows,
        }

