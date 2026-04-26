# Skill-Based Matching Component

This component maps a user skill profile to relevant ESCO occupations.

## Input

The matcher expects a dictionary where:

- key: ESCO skill URI (`conceptUri`)
- value: proficiency in range `0.0` to `1.0`

Example:

```python
{
    "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.9,
    "http://data.europa.eu/esco/skill/fed5b267-73fa-461d-9f69-827c78beb39d": 0.7,
}
```

## Data Sources (DuckDB)

The component reads from `backend_matching/data/esco.duckdb`:

- `occupations_en` (occupation labels)
- `occupationSkillRelations_en` (essential/optional skill requirements)
- `skillSkillRelations_en` (related skills)
- `broaderRelationsSkillPillar_en` (broader/narrower skill hierarchy)

## How Matching Works

1. Normalize and clamp input proficiencies to `[0, 1]`.
2. Optionally expand input skills using hierarchy and related-skill links.
   - broader/narrower expansion uses `hierarchy_decay`
   - related skill expansion uses `related_decay`
3. For each occupation:
   - compute essential coverage from matched essential skills
   - compute optional coverage from matched optional skills
4. Compute base score:

`base_skill_score = essential_weight * essential_coverage + optional_weight * optional_coverage`

5. Filter low-quality matches with `essential_floor`.
6. Return top `k` ranked occupations with explainability fields.

## Output (per match)

Each `MatchResult` includes:

- `occupation_uri`, `occupation_label`
- `base_skill_score`
- `essential_coverage`, `optional_coverage`
- matched vs total essential/optional counts
- `matched_input_skills`
- `missing_essential_skills`

This keeps the core step transparent and ready for later plugin-based reranking (e.g., ILOSTAT signals).
