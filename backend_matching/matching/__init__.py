"""Matching components for ESCO-based occupation recommendation."""

from .skill_based.skill_matcher import MatchResult, SkillBasedMatcher
from .earnings_based.earnings_enricher import (
    EarningsEnrichedResult,
    EarningsEnricher,
)
from .demand_based.demand_enricher import DemandEnrichedResult, OccupationDemandEnricher
from .informality_based.informality_enricher import (
    InformalityEnrichedResult,
    InformalityEnricher,
)
from .security_based.security_enricher import (
    OccupationSecurityEnricher,
    SecurityEnrichedResult,
)
from .matching_algorithm import MatchRequest, MatchingAlgorithm, OccupationSignals
from .workload_based.workload_enricher import (
    OccupationWorkloadEnricher,
    WorkloadEnrichedResult,
)

__all__ = [
    "SkillBasedMatcher",
    "MatchResult",
    "EarningsEnricher",
    "EarningsEnrichedResult",
    "OccupationDemandEnricher",
    "DemandEnrichedResult",
    "OccupationSecurityEnricher",
    "SecurityEnrichedResult",
    "MatchingAlgorithm",
    "MatchRequest",
    "OccupationSignals",
    "OccupationWorkloadEnricher",
    "WorkloadEnrichedResult",
    "InformalityEnricher",
    "InformalityEnrichedResult",
]
