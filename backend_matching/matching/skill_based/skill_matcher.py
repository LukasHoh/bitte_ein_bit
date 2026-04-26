from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import duckdb


_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_ESCO_DB_PATH = _REPO_ROOT / "data" / "esco.duckdb"


@dataclass
class MatchResult:
    occupation_uri: str
    occupation_label: str
    base_skill_score: float
    essential_coverage: float
    optional_coverage: float
    matched_essential_count: int
    total_essential_count: int
    matched_optional_count: int
    total_optional_count: int
    matched_input_skills: List[str]
    missing_essential_skills: List[str]


class SkillBasedMatcher:
    """ESCO skill-based occupation matcher.

    Input format:
        {
            "http://data.europa.eu/esco/skill/<uuid>": proficiency_float_0_to_1,
            ...
        }
    """

    def __init__(
        self,
        esco_db_path: str | Path = _DEFAULT_ESCO_DB_PATH,
        essential_weight: float = 0.75,
        optional_weight: float = 0.25,
        essential_floor: float = 0.1,
    ) -> None:
        self.db_path = str(esco_db_path)
        self.essential_weight = essential_weight
        self.optional_weight = optional_weight
        self.essential_floor = essential_floor

        self._occupation_labels: Dict[str, str] = {}
        self._occupation_requirements: Dict[str, Dict[str, set[str]]] = {}
        self._skill_related: Dict[str, set[str]] = {}
        self._skill_broader: Dict[str, set[str]] = {}
        self._skill_narrower: Dict[str, set[str]] = {}
        self._skill_labels: Dict[str, str] = {}

        self._load_indices()

    @property
    def skill_labels(self) -> Dict[str, str]:
        """Read-only view of ESCO skill URI -> preferred English label."""
        return self._skill_labels

    def _load_indices(self) -> None:
        con = duckdb.connect(self.db_path, read_only=True)
        try:
            occ_rows = con.execute(
                """
                SELECT conceptUri AS occupation_uri, preferredLabel AS occupation_label
                FROM occupations_en
                """
            ).fetchall()
            self._occupation_labels = {r[0]: (r[1] or "") for r in occ_rows}

            skill_rows = con.execute(
                """
                SELECT conceptUri AS skill_uri, preferredLabel AS skill_label
                FROM skills_en
                WHERE conceptUri IS NOT NULL
                """
            ).fetchall()
            self._skill_labels = {r[0]: (r[1] or "") for r in skill_rows}

            req_rows = con.execute(
                """
                SELECT occupationUri, relationType, skillUri
                FROM occupationSkillRelations_en
                WHERE occupationUri IS NOT NULL
                  AND skillUri IS NOT NULL
                  AND relationType IN ('essential', 'optional')
                """
            ).fetchall()

            requirements: Dict[str, Dict[str, set[str]]] = {}
            for occ_uri, relation_type, skill_uri in req_rows:
                occ = requirements.setdefault(
                    occ_uri, {"essential": set(), "optional": set()}
                )
                occ[relation_type].add(skill_uri)
            self._occupation_requirements = requirements

            rel_rows = con.execute(
                """
                SELECT originalSkillUri, relatedSkillUri
                FROM skillSkillRelations_en
                WHERE originalSkillUri IS NOT NULL
                  AND relatedSkillUri IS NOT NULL
                """
            ).fetchall()
            for source_uri, target_uri in rel_rows:
                self._skill_related.setdefault(source_uri, set()).add(target_uri)
                self._skill_related.setdefault(target_uri, set()).add(source_uri)

            broader_rows = con.execute(
                """
                SELECT conceptUri, broaderUri
                FROM broaderRelationsSkillPillar_en
                WHERE conceptUri IS NOT NULL
                  AND broaderUri IS NOT NULL
                """
            ).fetchall()
            for skill_uri, broader_uri in broader_rows:
                self._skill_broader.setdefault(skill_uri, set()).add(broader_uri)
                self._skill_narrower.setdefault(broader_uri, set()).add(skill_uri)
        finally:
            con.close()

    @staticmethod
    def _clamp_01(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    def _expand_profile(
        self,
        skill_profile: Dict[str, float],
        include_hierarchy: bool,
        hierarchy_decay: float,
        related_decay: float,
    ) -> Dict[str, float]:
        expanded: Dict[str, float] = {}

        for skill_uri, proficiency in skill_profile.items():
            p = self._clamp_01(proficiency)
            expanded[skill_uri] = max(expanded.get(skill_uri, 0.0), p)

        if not include_hierarchy:
            return expanded

        for skill_uri, proficiency in list(skill_profile.items()):
            p = self._clamp_01(proficiency)
            p_h = p * hierarchy_decay
            p_r = p * related_decay

            for broader_uri in self._skill_broader.get(skill_uri, set()):
                expanded[broader_uri] = max(expanded.get(broader_uri, 0.0), p_h)

            for narrower_uri in self._skill_narrower.get(skill_uri, set()):
                expanded[narrower_uri] = max(expanded.get(narrower_uri, 0.0), p_h)

            for related_uri in self._skill_related.get(skill_uri, set()):
                expanded[related_uri] = max(expanded.get(related_uri, 0.0), p_r)

        return expanded

    def match(
        self,
        skill_profile: Dict[str, float],
        top_k: int = 20,
        include_hierarchy: bool = True,
        hierarchy_decay: float = 0.6,
        related_decay: float = 0.5,
        essential_floor: float | None = None,
    ) -> List[MatchResult]:
        if not skill_profile:
            return []

        # Per-call override wins over the matcher-wide default. We clamp to keep
        # callers honest (e.g. negative or >1 floors are treated as 0/1).
        active_floor = self._clamp_01(
            self.essential_floor if essential_floor is None else essential_floor
        )

        expanded = self._expand_profile(
            skill_profile=skill_profile,
            include_hierarchy=include_hierarchy,
            hierarchy_decay=self._clamp_01(hierarchy_decay),
            related_decay=self._clamp_01(related_decay),
        )

        results: List[MatchResult] = []
        input_skill_uris = set(skill_profile.keys())

        for occ_uri, req in self._occupation_requirements.items():
            essential_skills = req["essential"]
            optional_skills = req["optional"]

            if not essential_skills and not optional_skills:
                continue

            essential_total = len(essential_skills)
            optional_total = len(optional_skills)

            essential_hits = [
                expanded[s] for s in essential_skills if s in expanded and expanded[s] > 0
            ]
            optional_hits = [
                expanded[s] for s in optional_skills if s in expanded and expanded[s] > 0
            ]

            essential_coverage = (
                sum(essential_hits) / essential_total if essential_total > 0 else 0.0
            )
            optional_coverage = (
                sum(optional_hits) / optional_total if optional_total > 0 else 0.0
            )

            if essential_total > 0 and essential_coverage < active_floor:
                continue

            base_score = (
                self.essential_weight * essential_coverage
                + self.optional_weight * optional_coverage
            )

            # When the floor is relaxed (e.g. 0.0), still skip occupations with
            # absolutely no overlap so the result list isn't padded with noise.
            if base_score <= 0.0:
                continue

            matched_input_skills = sorted(
                (essential_skills | optional_skills) & input_skill_uris
            )
            missing_essential = sorted(s for s in essential_skills if s not in expanded)

            results.append(
                MatchResult(
                    occupation_uri=occ_uri,
                    occupation_label=self._occupation_labels.get(occ_uri, occ_uri),
                    base_skill_score=round(base_score, 6),
                    essential_coverage=round(essential_coverage, 6),
                    optional_coverage=round(optional_coverage, 6),
                    matched_essential_count=len(essential_hits),
                    total_essential_count=essential_total,
                    matched_optional_count=len(optional_hits),
                    total_optional_count=optional_total,
                    matched_input_skills=matched_input_skills,
                    missing_essential_skills=missing_essential[:20],
                )
            )

        results.sort(
            key=lambda x: (
                x.base_skill_score,
                x.essential_coverage,
                x.matched_essential_count,
            ),
            reverse=True,
        )
        return results[:top_k]


def example_usage() -> List[Tuple[str, List[MatchResult]]]:
    matcher = SkillBasedMatcher()
    example_profiles: List[Tuple[str, Dict[str, float]]] = [
        (
            "performing_arts_technical",
            {
                "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.9,
                "http://data.europa.eu/esco/skill/47ed1d37-971b-472c-86be-26f893991274": 0.8,
                "http://data.europa.eu/esco/skill/fed5b267-73fa-461d-9f69-827c78beb39d": 0.7,
            },
        ),
        (
            "metal_drawing_operator",
            {
                "http://data.europa.eu/esco/skill/3b3b7373-220a-4287-87cf-e24a208b63c6": 0.9,
                "http://data.europa.eu/esco/skill/8d4271ca-c9fd-40b3-875f-15f78332a49e": 0.8,
                "http://data.europa.eu/esco/skill/334e3e49-fb02-4051-809a-f06adfdc1c40": 0.85,
            },
        ),
        (
            "safety_and_compliance",
            {
                "http://data.europa.eu/esco/skill/93a68dcb-3dc6-4dbe-b196-f6d212228a50": 0.95,
                "http://data.europa.eu/esco/skill/860be36a-d19b-4ba8-ae74-bc61b9f0bf63": 0.7,
                "http://data.europa.eu/esco/skill/271a36a0-bc7a-43a9-ad29-0a3f3cac4e57": 0.65,
            },
        ),
        (
            "artistic_production_coordination",
            {
                "http://data.europa.eu/esco/skill/591dd514-735b-46e4-a28d-3a4c42f49b72": 0.8,
                "http://data.europa.eu/esco/skill/892f8e2f-189a-41d5-a4b6-b8e2afb99974": 0.75,
                "http://data.europa.eu/esco/skill/f64fe2c2-d090-4e91-ba74-1355d96b9bca": 0.9,
            },
        ),
        (
            "basic_multi_domain_profile",
            {
                "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.5,
                "http://data.europa.eu/esco/skill/285cac9e-dad3-4b7b-848f-9bd2860ae345": 0.55,
                "http://data.europa.eu/esco/skill/31f01be9-7bbf-4afb-a647-bcd4931cfc8b": 0.5,
            },
        ),
    ]

    outputs: List[Tuple[str, List[MatchResult]]] = []
    for profile_name, profile_skills in example_profiles:
        outputs.append((profile_name, matcher.match(profile_skills, top_k=5)))
    return outputs


if __name__ == "__main__":
    for profile_name, results in example_usage():
        print(f"\n=== Example: {profile_name} ===")
        if not results:
            print("No occupations matched the current thresholds.")
            continue
        for rank, result in enumerate(results, start=1):
            print(
                f"{rank:>2}. {result.occupation_label} | "
                f"score={result.base_skill_score:.3f} | "
                f"essential={result.matched_essential_count}/{result.total_essential_count} | "
                f"optional={result.matched_optional_count}/{result.total_optional_count}"
            )
