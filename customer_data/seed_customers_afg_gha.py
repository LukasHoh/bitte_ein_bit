from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path
from uuid import NAMESPACE_DNS, uuid5

import duckdb


DB_PATH = Path(__file__).resolve().parent / "app.duckdb"


@dataclass(frozen=True)
class Persona:
    seed_key: str
    full_name: str
    country_code: str
    region_name: str
    sex: str
    age: int
    salary_importance: int
    skill_labels: tuple[str, ...]
    proficiencies: tuple[str, ...]


PASSWORD_HASH = hashlib.sha256("seed-password-2026".encode("utf-8")).hexdigest()

AFG_PERSONAS: tuple[Persona, ...] = (
    Persona("afg-01", "Amina Rahimi", "AFG", "Kabul", "female", 22, 9, ("teach housekeeping skills", "maintain inventory of cleaning supplies", "maintain personal hygiene standards when cleaning", "guarantee customer satisfaction", "organise labour"), ("intermediate", "intermediate", "advanced", "intermediate", "beginner")),
    Persona("afg-02", "Farid Ahmadi", "AFG", "Kandahar", "male", 24, 8, ("operate agricultural machinery", "maintain aquaculture ponds", "handle fish harvesting waste", "adopt ways to foster biodiversity and animal welfare", "organise labour"), ("advanced", "intermediate", "intermediate", "beginner", "intermediate")),
    Persona("afg-03", "Laila Mohammadi", "AFG", "Kabul", "female", 21, 8, ("perform street interventions in social work", "apply anti-oppressive practices", "identify available services", "develop a rehabilitation programme", "show initiative"), ("advanced", "advanced", "intermediate", "intermediate", "advanced")),
    Persona("afg-04", "Jamal Karimi", "AFG", "Herat", "male", 27, 7, ("install heat pump", "maintain rotating equipment", "repair electric bicycles", "purchase supplies", "act as contact person during equipment incident"), ("intermediate", "intermediate", "advanced", "beginner", "intermediate")),
    Persona("afg-05", "Nasrin Hamidi", "AFG", "Kabul", "female", 23, 9, ("train staff to reduce food waste", "pursue excellence in the creation of food products", "manufacture ingredients", "prepare oils", "guarantee customer satisfaction"), ("advanced", "intermediate", "intermediate", "intermediate", "advanced")),
    Persona("afg-06", "Sahar Najafi", "AFG", "Mazar-e-Sharif", "female", 20, 8, ("manage time in landscaping", "adopt ways to foster biodiversity and animal welfare", "perform a feasibility study for building management systems", "develop energy saving concepts", "show initiative"), ("intermediate", "intermediate", "beginner", "beginner", "advanced")),
    Persona("afg-07", "Qasim Sediqi", "AFG", "Jalalabad", "male", 29, 7, ("operate wrecking ball", "handle equipment while suspended", "maintain sorting equipment", "inspect offshore constructions", "advise on construction materials"), ("intermediate", "advanced", "intermediate", "beginner", "intermediate")),
    Persona("afg-08", "Mariam Azizi", "AFG", "Kabul", "female", 25, 8, ("explain features in accommodation venue", "guarantee customer satisfaction", "manage university department", "liaise with typists", "show initiative"), ("advanced", "advanced", "beginner", "intermediate", "advanced")),
    Persona("afg-09", "Bilal Noori", "AFG", "Kandahar", "male", 26, 8, ("control compliance of railway vehicles regulations", "check train engines", "assess railway operations", "handle customer requests related to cargo", "advise on customs regulations"), ("intermediate", "intermediate", "advanced", "intermediate", "intermediate")),
    Persona("afg-10", "Parisa Wardak", "AFG", "Herat", "female", 24, 9, ("draft scientific or academic papers and technical documentation", "conduct research on flora", "develop terminology databases", "influence public policies", "show initiative"), ("advanced", "intermediate", "intermediate", "beginner", "advanced")),
    Persona("afg-11", "Ehsan Hakimi", "AFG", "Mazar-e-Sharif", "male", 30, 8, ("enterprise risk management", "apply credit risk policy", "advise on customs regulations", "purchase vehicle parts", "purchase supplies"), ("advanced", "advanced", "intermediate", "intermediate", "advanced")),
    Persona("afg-12", "Roya Sadat", "AFG", "Jalalabad", "female", 22, 7, ("provide chaperone for children on set", "work with soloists", "use of special equipment for daily activities", "show initiative", "organise labour"), ("intermediate", "beginner", "intermediate", "advanced", "intermediate")),
    Persona("afg-13", "Hamidullah Popal", "AFG", "Kabul", "male", 28, 7, ("manufacture wearing apparel products", "evaluate garment quality", "adjust envelope cutting settings", "sawing techniques", "organise labour"), ("advanced", "advanced", "intermediate", "intermediate", "intermediate")),
)

GHA_PERSONAS: tuple[Persona, ...] = (
    Persona("gha-01", "Akosua Mensah", "GHA", "Accra", "female", 23, 8, ("manufacture ingredients", "prepare oils", "train staff to reduce food waste", "guarantee customer satisfaction", "show initiative"), ("advanced", "intermediate", "intermediate", "intermediate", "advanced")),
    Persona("gha-02", "Kwame Asare", "GHA", "Kumasi", "male", 27, 7, ("operate agricultural machinery", "maintain aquaculture ponds", "handle fish harvesting waste", "adopt ways to foster biodiversity and animal welfare", "organise labour"), ("advanced", "intermediate", "intermediate", "intermediate", "intermediate")),
    Persona("gha-03", "Abena Owusu", "GHA", "Accra", "female", 25, 8, ("perform street interventions in social work", "apply anti-oppressive practices", "identify available services", "develop a rehabilitation programme", "show initiative"), ("advanced", "advanced", "intermediate", "intermediate", "advanced")),
    Persona("gha-04", "Kojo Boateng", "GHA", "Tamale", "male", 24, 8, ("repair electric bicycles", "maintain rotating equipment", "purchase vehicle parts", "purchase supplies", "act as contact person during equipment incident"), ("advanced", "intermediate", "intermediate", "intermediate", "intermediate")),
    Persona("gha-05", "Efua Adjei", "GHA", "Accra", "female", 26, 9, ("explain features in accommodation venue", "guarantee customer satisfaction", "liaise with typists", "manage time in landscaping", "show initiative"), ("advanced", "advanced", "intermediate", "beginner", "advanced")),
    Persona("gha-06", "Kofi Ofori", "GHA", "Kumasi", "male", 31, 8, ("enterprise risk management", "apply credit risk policy", "influence public policies", "advise on customs regulations", "show initiative"), ("advanced", "advanced", "intermediate", "intermediate", "advanced")),
    Persona("gha-07", "Ama Serwaa", "GHA", "Takoradi", "female", 22, 8, ("draft scientific or academic papers and technical documentation", "conduct research on flora", "develop terminology databases", "perform toxicological studies", "show initiative"), ("advanced", "intermediate", "intermediate", "beginner", "advanced")),
    Persona("gha-08", "Yaw Antwi", "GHA", "Tamale", "male", 29, 7, ("operate wrecking ball", "handle equipment while suspended", "inspect offshore constructions", "advise on construction materials", "organise labour"), ("intermediate", "advanced", "intermediate", "intermediate", "intermediate")),
    Persona("gha-09", "Nana Opoku", "GHA", "Kumasi", "male", 28, 7, ("manufacture wearing apparel products", "evaluate garment quality", "sawing techniques", "adjust envelope cutting settings", "organise labour"), ("advanced", "advanced", "intermediate", "intermediate", "intermediate")),
    Persona("gha-10", "Adwoa Kusi", "GHA", "Accra", "female", 21, 8, ("teach housekeeping skills", "maintain inventory of cleaning supplies", "maintain personal hygiene standards when cleaning", "guarantee customer satisfaction", "show initiative"), ("advanced", "intermediate", "advanced", "intermediate", "advanced")),
    Persona("gha-11", "Daniel Tetteh", "GHA", "Takoradi", "male", 26, 8, ("handle customer requests related to cargo", "advise on customs regulations", "control compliance of railway vehicles regulations", "assess railway operations", "organise labour"), ("advanced", "intermediate", "beginner", "beginner", "intermediate")),
)

PERSONAS = AFG_PERSONAS + GHA_PERSONAS
PROF_ALLOWED = {"beginner", "intermediate", "advanced", "expert"}


def _id(namespace: str, key: str) -> str:
    return str(uuid5(NAMESPACE_DNS, f"unmapped::{namespace}::{key}"))


def _require_region_ids(con: duckdb.DuckDBPyConnection) -> dict[str, str]:
    rows = con.execute(
        """
        SELECT country_code, id
        FROM regions
        WHERE country_code IN ('AFG', 'GHA')
        """
    ).fetchall()
    mapping = {str(cc): str(rid) for cc, rid in rows}
    missing = [cc for cc in ("AFG", "GHA") if cc not in mapping]
    if missing:
        raise RuntimeError(f"Missing regions for country codes: {missing}")
    return mapping


def _ensure_schema(con: duckdb.DuckDBPyConnection) -> None:
    required = {"users", "profiles", "skills", "user_skills", "regions", "user_roles"}
    rows = con.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()
    existing = {str(r[0]) for r in rows}
    missing = required - existing
    if missing:
        raise RuntimeError(f"Missing required tables in app.duckdb: {sorted(missing)}")


def _upsert_skill(con: duckdb.DuckDBPyConnection, skill_name: str, dry_run: bool) -> tuple[str, bool]:
    existing = con.execute("SELECT id FROM skills WHERE name = ?", [skill_name]).fetchone()
    if existing:
        return str(existing[0]), False
    skill_id = _id("skill", skill_name.lower())
    if not dry_run:
        con.execute(
            "INSERT INTO skills (id, name, category) VALUES (?, ?, ?)",
            [skill_id, skill_name, "seed_esco"],
        )
    return skill_id, True


def seed(dry_run: bool) -> dict[str, int]:
    con = duckdb.connect(str(DB_PATH))
    stats = {
        "profiles_upserted": 0,
        "skills_inserted": 0,
        "user_skills_inserted": 0,
        "afg_profiles": 0,
        "gha_profiles": 0,
    }
    try:
        _ensure_schema(con)
        region_ids = _require_region_ids(con)

        for p in PERSONAS:
            if len(p.skill_labels) != len(p.proficiencies):
                raise ValueError(f"Skill/proficiency mismatch for {p.seed_key}")
            if not all(x in PROF_ALLOWED for x in p.proficiencies):
                raise ValueError(f"Invalid proficiency in {p.seed_key}")

            user_id = _id("user", p.seed_key)
            role_id = _id("role", p.seed_key)
            email = f"{p.seed_key}@seed.unmapped.local"
            region_id = region_ids[p.country_code]

            if not dry_run:
                con.execute(
                    """
                    INSERT INTO users (id, email, password_hash)
                    VALUES (?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash
                    """,
                    [user_id, email, PASSWORD_HASH],
                )
                con.execute(
                    """
                    INSERT INTO user_roles (id, user_id, role)
                    VALUES (?, ?, 'seeker')
                    ON CONFLICT (id) DO UPDATE SET user_id = excluded.user_id, role = excluded.role
                    """,
                    [role_id, user_id],
                )
                con.execute(
                    """
                    INSERT INTO profiles (id, full_name, language, region_id, region, sex, salary_importance, age)
                    VALUES (?, ?, 'en', ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        full_name = excluded.full_name,
                        language = excluded.language,
                        region_id = excluded.region_id,
                        region = excluded.region,
                        sex = excluded.sex,
                        salary_importance = excluded.salary_importance,
                        age = excluded.age,
                        updated_at = now()
                    """,
                    [user_id, p.full_name, region_id, p.region_name, p.sex, p.salary_importance, p.age],
                )
            stats["profiles_upserted"] += 1
            if p.country_code == "AFG":
                stats["afg_profiles"] += 1
            elif p.country_code == "GHA":
                stats["gha_profiles"] += 1

            for skill_name, proficiency in zip(p.skill_labels, p.proficiencies):
                skill_id, created = _upsert_skill(con, skill_name, dry_run)
                if created:
                    stats["skills_inserted"] += 1
                user_skill_id = _id("user-skill", f"{p.seed_key}:{skill_name.lower()}")
                existing_link = con.execute(
                    "SELECT id FROM user_skills WHERE user_id = ? AND skill_id = ?",
                    [user_id, skill_id],
                ).fetchone()
                if existing_link:
                    if not dry_run:
                        con.execute(
                            """
                            UPDATE user_skills
                            SET proficiency = ?, source = 'imported', llm_level = NULL, user_quote = NULL
                            WHERE user_id = ? AND skill_id = ?
                            """,
                            [proficiency, user_id, skill_id],
                        )
                else:
                    if not dry_run:
                        con.execute(
                            """
                            INSERT INTO user_skills (id, user_id, skill_id, proficiency, source, llm_level, user_quote)
                            VALUES (?, ?, ?, ?, 'imported', NULL, NULL)
                            """,
                            [user_skill_id, user_id, skill_id, proficiency],
                        )
                    stats["user_skills_inserted"] += 1
        return stats
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed 13 AFG and 11 GHA customer profiles into app.duckdb")
    parser.add_argument("--dry-run", action="store_true", help="Compute and print changes without writing")
    args = parser.parse_args()

    stats = seed(dry_run=args.dry_run)
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] Seed summary")
    for k, v in stats.items():
        print(f"- {k}: {v}")


if __name__ == "__main__":
    main()

