from __future__ import annotations

import json
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from backend_matching.api.schemas import MatchingRunRequest
from backend_matching.matching import MatchRequest, MatchingAlgorithm


# region agent log
def _debug_log(hypothesis_id: str, message: str, data: dict) -> None:
    try:
        payload = {
            "sessionId": "8733c2",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": "backend_matching/api/main.py",
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with Path("/Users/lukashohenloechter/Desktop/bitte_ein_bit/.cursor/debug-8733c2.log").open(
            "a", encoding="utf-8"
        ) as handle:
            handle.write(json.dumps(payload) + "\n")
    except Exception:
        pass


_debug_log(
    "H2",
    "api.main module import reached",
    {
        "__file__": __file__,
        "cwd": str(Path.cwd()),
        "sys_path_head": sys.path[:8],
    },
)
# endregion

# region agent log
def _debug_log_4103d1(hypothesis_id: str, message: str, data: dict) -> None:
    try:
        payload = {
            "sessionId": "4103d1",
            "runId": "pre-fix",
            "hypothesisId": hypothesis_id,
            "location": "backend_matching/api/main.py",
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with Path("/Users/lukashohenloechter/Desktop/bitte_ein_bit/.cursor/debug-4103d1.log").open(
            "a", encoding="utf-8"
        ) as handle:
            handle.write(json.dumps(payload) + "\n")
    except Exception:
        pass


_debug_log_4103d1(
    "H2",
    "api.main module import reached",
    {
        "__file__": __file__,
        "cwd": str(Path.cwd()),
        "sys_path_head": sys.path[:8],
    },
)
# endregion


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

