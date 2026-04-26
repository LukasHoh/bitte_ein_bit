from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from matching_service.api.schemas import MatchingRunRequest
from matching_service.matching import MatchRequest, MatchingAlgorithm


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.matching_algorithm = MatchingAlgorithm()
    yield


app = FastAPI(
    title="Bitte Ein Bit Matching API",
    version="0.1.0",
    lifespan=lifespan,
)


def _get_algorithm(request: Request) -> MatchingAlgorithm:
    algorithm = getattr(request.app.state, "matching_algorithm", None)
    if algorithm is None:
        algorithm = MatchingAlgorithm()
        request.app.state.matching_algorithm = algorithm
    return algorithm


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/matching/run")
def run_matching(payload: MatchingRunRequest, request: Request) -> dict[str, Any]:
    try:
        algorithm = _get_algorithm(request)
        match_request = MatchRequest(
            skills=payload.skills,
            country=payload.country,
            sex=payload.sex,
            region=payload.region,
            reference_year=payload.reference_year,
            top_k=payload.top_k,
            include_hierarchy=payload.include_hierarchy,
            hierarchy_decay=payload.hierarchy_decay,
            related_decay=payload.related_decay,
        )
        return algorithm.run(match_request)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Matching run failed: {exc}",
        ) from exc

