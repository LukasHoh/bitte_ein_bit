import logging
from fastapi import FastAPI
from fastapi import HTTPException
from pydantic import BaseModel, Field

from skills.skills import get_similar_skills

app = FastAPI()

@app.get("/hello")
def read_root():
    return {"Hello": "World"}


class ManualSkillSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=5, ge=1, le=20)


@app.post("/skills/manual-search")
def manual_search_skills(payload: ManualSkillSearchRequest) -> dict:
    """Search skills manually using vector similarity_search."""
    try:
        docs = get_similar_skills(payload.query, k=payload.limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Skill search failed: {exc}") from exc

    candidates: list[dict] = []
    for index, doc in enumerate(docs, start=1):
        metadata = getattr(doc, "metadata", {}) or {}
        skill_id = (
            str(getattr(doc, "id", "")).strip()
            or str(metadata.get("id", "")).strip()
            or str(metadata.get("skill_id", "")).strip()
            or str(metadata.get("code", "")).strip()
            or f"result_{index}"
        )
        label = (
            metadata.get("preferredLabel")
            or metadata.get("skill")
            or metadata.get("name")
            or metadata.get("title")
            or metadata.get("label")
            or "Unknown skill"
        )
        description = (
            metadata.get("description")
            or metadata.get("definition")
            or metadata.get("summary")
            or metadata.get("embedding_text")
            or ""
        )
        candidates.append(
            {
                "skill_id": str(skill_id),
                "skill_label": str(label),
                "description": str(description),
                "concept_uri": str(metadata.get("conceptUri", "")).strip(),
                "full_metadata": {k: str(v) for k, v in metadata.items()},
            }
        )

    return {"query": payload.query, "candidates": candidates}