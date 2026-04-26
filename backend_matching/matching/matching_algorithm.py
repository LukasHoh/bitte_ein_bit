from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import sys
from typing import Any

try:
    from backend_matching.matching.demand_based.demand_enricher import (
        OccupationDemandEnricher,
    )
    from backend_matching.matching.earnings_based.earnings_enricher import (
        EarningsEnricher,
    )
    from backend_matching.matching.informality_based.informality_enricher import (
        InformalityEnricher,
    )
    from backend_matching.matching.security_based.security_enricher import (
        OccupationSecurityEnricher,
    )
    from backend_matching.matching.skill_based.skill_matcher import SkillBasedMatcher
    from backend_matching.matching.workload_based.workload_enricher import (
        OccupationWorkloadEnricher,
    )
except ModuleNotFoundError:
    # Allow direct script execution:
    # python backend_matching/matching/matching_algorithm.py
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from backend_matching.matching.demand_based.demand_enricher import (
        OccupationDemandEnricher,
    )
    from backend_matching.matching.earnings_based.earnings_enricher import (
        EarningsEnricher,
    )
    from backend_matching.matching.informality_based.informality_enricher import (
        InformalityEnricher,
    )
    from backend_matching.matching.security_based.security_enricher import (
        OccupationSecurityEnricher,
    )
    from backend_matching.matching.skill_based.skill_matcher import SkillBasedMatcher
    from backend_matching.matching.workload_based.workload_enricher import (
        OccupationWorkloadEnricher,
    )


@dataclass
class MatchRequest:
    skills: dict[str, float]
    country: str
    sex: str | None = None
    region: str | None = None
    reference_year: int | None = None
    top_k: int = 20
    include_hierarchy: bool = True
    hierarchy_decay: float = 0.6
    related_decay: float = 0.5


@dataclass
class OccupationSignals:
    occupation_uri: str
    occupation_label: str | None
    base_skill_score: float
    essential_coverage: float
    optional_coverage: float
    matched_essential_count: int
    total_essential_count: int
    matched_optional_count: int
    total_optional_count: int
    matched_input_skills: list[str]
    missing_essential_skills: list[str]
    earnings_value_local: float | None = None
    occupation_demand_level: float | None = None
    occupation_unemployment_risk: float | None = None
    hours_worked: float | None = None
    informality_rate: float | None = None


class MatchingAlgorithm:
    """Orchestrates skill matching + enrichers and returns frontend-ready JSON."""

    def __init__(
        self,
        *,
        skill_matcher: SkillBasedMatcher | None = None,
        earnings_enricher: EarningsEnricher | None = None,
        demand_enricher: OccupationDemandEnricher | None = None,
        security_enricher: OccupationSecurityEnricher | None = None,
        workload_enricher: OccupationWorkloadEnricher | None = None,
        informality_enricher: InformalityEnricher | None = None,
    ) -> None:
        self.skill_matcher = skill_matcher or SkillBasedMatcher()
        self.earnings_enricher = earnings_enricher or EarningsEnricher()
        self.demand_enricher = demand_enricher or OccupationDemandEnricher()
        self.security_enricher = security_enricher or OccupationSecurityEnricher()
        self.workload_enricher = workload_enricher or OccupationWorkloadEnricher()
        self.informality_enricher = informality_enricher or InformalityEnricher()

    def run(self, request: MatchRequest) -> dict[str, Any]:
        if not request.skills:
            return self._to_response_json(request, [])

        matches = self.skill_matcher.match(
            request.skills,
            top_k=request.top_k,
            include_hierarchy=request.include_hierarchy,
            hierarchy_decay=request.hierarchy_decay,
            related_decay=request.related_decay,
        )
        merged = self._merge_by_occupation_uri(matches, request)
        return self._to_response_json(request, merged)

    def _safe_enrich(
        self,
        enricher: Any,
        occupations: list[Any],
        request: MatchRequest,
    ) -> list[Any]:
        try:
            return enricher.enrich(
                occupations,
                country=request.country,
                sex=request.sex,
                region=request.region,
                reference_year=request.reference_year,
            )
        except Exception:
            return []

    def _merge_by_occupation_uri(
        self, matches: list[Any], request: MatchRequest
    ) -> list[OccupationSignals]:
        by_uri: dict[str, OccupationSignals] = {}
        for match in matches:
            by_uri[match.occupation_uri] = OccupationSignals(
                occupation_uri=match.occupation_uri,
                occupation_label=match.occupation_label,
                base_skill_score=match.base_skill_score,
                essential_coverage=match.essential_coverage,
                optional_coverage=match.optional_coverage,
                matched_essential_count=match.matched_essential_count,
                total_essential_count=match.total_essential_count,
                matched_optional_count=match.matched_optional_count,
                total_optional_count=match.total_optional_count,
                matched_input_skills=match.matched_input_skills,
                missing_essential_skills=match.missing_essential_skills,
            )

        enrichers = [
            self.earnings_enricher,
            self.demand_enricher,
            self.security_enricher,
            self.workload_enricher,
            self.informality_enricher,
        ]
        for enricher in enrichers:
            enriched_rows = self._safe_enrich(enricher, matches, request)
            for row in enriched_rows:
                item = by_uri.get(getattr(row, "occupation_uri", ""))
                if not item:
                    continue
                for key, value in asdict(row).items():
                    if key in {"occupation_uri", "occupation_label"}:
                        continue
                    if hasattr(item, key):
                        setattr(item, key, value)

        return list(by_uri.values())

    def _to_response_json(
        self, request: MatchRequest, occupations: list[OccupationSignals]
    ) -> dict[str, Any]:
        return {
            "context": {
                "country": request.country,
                "sex": request.sex,
                "region": request.region,
                "reference_year": request.reference_year,
                "top_k": request.top_k,
            },
            "occupations": [asdict(o) for o in occupations],
        }


def example_usage() -> dict[str, Any]:
    """Backward-compatible single example."""
    algorithm = MatchingAlgorithm()
    request = MatchRequest(
        skills={
            "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.9,
            "http://data.europa.eu/esco/skill/47ed1d37-971b-472c-86be-26f893991274": 0.8,
            "http://data.europa.eu/esco/skill/fed5b267-73fa-461d-9f69-827c78beb39d": 0.7,
        },
        country="AFG",
        sex="female",
        reference_year=2020,
        top_k=5,
    )
    return algorithm.run(request)


def example_usage_multiple() -> list[tuple[str, dict[str, Any]]]:
    """Multiple smoke-test scenarios for the full orchestration pipeline."""
    algorithm = MatchingAlgorithm()
    scenarios = [
        (
            "performing_arts_technical_afg_female",
            MatchRequest(
                skills={
                    "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.9,
                    "http://data.europa.eu/esco/skill/47ed1d37-971b-472c-86be-26f893991274": 0.8,
                    "http://data.europa.eu/esco/skill/fed5b267-73fa-461d-9f69-827c78beb39d": 0.7,
                },
                country="AFG",
                sex="female",
                reference_year=2020,
                top_k=5,
            ),
        ),
        (
            "metal_operator_afg_male",
            MatchRequest(
                skills={
                    "http://data.europa.eu/esco/skill/3b3b7373-220a-4287-87cf-e24a208b63c6": 0.9,
                    "http://data.europa.eu/esco/skill/8d4271ca-c9fd-40b3-875f-15f78332a49e": 0.8,
                    "http://data.europa.eu/esco/skill/334e3e49-fb02-4051-809a-f06adfdc1c40": 0.85,
                },
                country="AFG",
                sex="male",
                reference_year=2021,
                top_k=5,
            ),
        ),
        (
            "safety_compliance_bra_total",
            MatchRequest(
                skills={
                    "http://data.europa.eu/esco/skill/93a68dcb-3dc6-4dbe-b196-f6d212228a50": 0.95,
                    "http://data.europa.eu/esco/skill/860be36a-d19b-4ba8-ae74-bc61b9f0bf63": 0.7,
                    "http://data.europa.eu/esco/skill/271a36a0-bc7a-43a9-ad29-0a3f3cac4e57": 0.65,
                },
                country="BRA",
                sex="total",
                reference_year=2019,
                top_k=5,
            ),
        ),
        (
            "empty_skills_guardrail",
            MatchRequest(
                skills={},
                country="AFG",
                sex="female",
                reference_year=2020,
                top_k=5,
            ),
        ),
    ]
    return [(name, algorithm.run(request)) for name, request in scenarios]


if __name__ == "__main__":
    for scenario_name, result in example_usage_multiple():
        print(f"\n=== {scenario_name} ===")
        print(f"occupations: {len(result['occupations'])}")
        for row in result["occupations"][:3]:
            print(
                row["occupation_label"],
                "| base=",
                row["base_skill_score"],
                "| earnings=",
                row["earnings_value_local"],
                "| demand=",
                row["occupation_demand_level"],
                "| security=",
                row["occupation_unemployment_risk"],
                "| hours=",
                row["hours_worked"],
                "| informality=",
                row["informality_rate"],
            )
