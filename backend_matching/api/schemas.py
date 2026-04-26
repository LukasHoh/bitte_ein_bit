from __future__ import annotations

from pydantic import BaseModel, Field, validator


class MatchingRunRequest(BaseModel):
    skills: dict[str, float] = Field(
        default_factory=dict,
        description="Map of ESCO skill URI to proficiency in range [0, 1].",
    )
    country: str = Field(min_length=2, max_length=3, description="ISO country code.")
    sex: str | None = Field(default=None, description="male|female|total")
    region: str | None = None
    reference_year: int | None = Field(default=None, ge=1900, le=2100)
    top_k: int = Field(default=20, gt=0, le=200)
    include_hierarchy: bool = True
    hierarchy_decay: float = Field(default=0.6, ge=0.0, le=1.0)
    related_decay: float = Field(default=0.5, ge=0.0, le=1.0)
    essential_floor: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Minimum essential-skill coverage [0, 1] required for an occupation to "
            "appear in the results. 0.0 (default) lets top_k + sort decide; raise it "
            "to filter for tightly-targeted skill profiles."
        ),
    )

    @validator("country")
    def normalize_country(cls, value: str) -> str:
        return value.strip().upper()

    @validator("sex")
    def validate_sex(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        valid = {"male", "female", "total"}
        if normalized not in valid:
            raise ValueError("sex must be one of: male, female, total")
        return normalized

    @validator("skills")
    def validate_skills_range(cls, value: dict[str, float]) -> dict[str, float]:
        for skill_uri, proficiency in value.items():
            if not 0.0 <= float(proficiency) <= 1.0:
                raise ValueError(
                    f"Skill proficiency for '{skill_uri}' must be in range [0, 1]."
                )
        return value

