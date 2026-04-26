from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from backend_matching.api.schemas import AdminSignInRequest, AdminSignUpRequest, MatchingRunRequest
from backend_matching.matching import MatchRequest, MatchingAlgorithm
from admin_data.admin_auth_service import AdminAuthService
from data.api.customer_data_service import CustomerDataService
from data.api.policy_data_service import PolicyDataService


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.matching_algorithm = MatchingAlgorithm()
    app.state.policy_data_service = PolicyDataService()
    app.state.customer_data_service = CustomerDataService()
    app.state.admin_auth_service = AdminAuthService()
    yield


app = FastAPI(
    title="Bitte Ein Bit Matching API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_algorithm(request: Request) -> MatchingAlgorithm:
    algorithm = getattr(request.app.state, "matching_algorithm", None)
    if algorithm is None:
        algorithm = MatchingAlgorithm()
        request.app.state.matching_algorithm = algorithm
    return algorithm


def _get_policy_data_service(request: Request) -> PolicyDataService:
    service = getattr(request.app.state, "policy_data_service", None)
    if service is None:
        service = PolicyDataService()
        request.app.state.policy_data_service = service
    return service


def _get_admin_auth_service(request: Request) -> AdminAuthService:
    service = getattr(request.app.state, "admin_auth_service", None)
    if service is None:
        service = AdminAuthService()
        request.app.state.admin_auth_service = service
    return service


def _get_customer_data_service(request: Request) -> CustomerDataService:
    service = getattr(request.app.state, "customer_data_service", None)
    if service is None:
        service = CustomerDataService()
        request.app.state.customer_data_service = service
    return service


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="missing authorization header")
    prefix = "bearer "
    if not authorization.lower().startswith(prefix):
        raise HTTPException(status_code=401, detail="invalid authorization scheme")
    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing bearer token")
    return token


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
            essential_floor=payload.essential_floor,
        )
        return algorithm.run(match_request)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Matching run failed: {exc}",
        ) from exc


@app.get("/api/v1/policy/dashboard")
def get_policy_dashboard(
    request: Request,
    country: str,
    authorization: str | None = Header(default=None),
    sex: str | None = None,
    reference_year: int | None = None,
    start_year: int | None = None,
    end_year: int | None = None,
) -> dict[str, Any]:
    try:
        token = _extract_bearer_token(authorization)
        auth_service = _get_admin_auth_service(request)
        session = auth_service.get_session(token=token)
        if session is None:
            raise HTTPException(status_code=401, detail="invalid or expired session")

        requested_country = country.strip().upper()
        if requested_country != session.country_code:
            raise HTTPException(status_code=403, detail="country not allowed for this admin")

        service = _get_policy_data_service(request)
        return service.get_dashboard_data(
            country=requested_country,
            sex=sex,
            reference_year=reference_year,
            start_year=start_year,
            end_year=end_year,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Policy dashboard data failed: {exc}",
        ) from exc


@app.post("/api/v1/admin/signup")
def admin_sign_up(payload: AdminSignUpRequest, request: Request) -> dict[str, Any]:
    try:
        service = _get_admin_auth_service(request)
        admin_id = service.sign_up(
            email=payload.email,
            password=payload.password,
            country_code=payload.country_code,
            region=payload.region,
        )
        token = service.sign_in(email=payload.email, password=payload.password)
        session = service.get_session(token=token)
        return {
            "admin_id": admin_id,
            "token": token,
            "admin": {
                "email": session.email if session else payload.email,
                "country_code": session.country_code if session else payload.country_code,
                "region": session.region if session else payload.region,
            },
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v1/admin/signin")
def admin_sign_in(payload: AdminSignInRequest, request: Request) -> dict[str, Any]:
    try:
        service = _get_admin_auth_service(request)
        token = service.sign_in(email=payload.email, password=payload.password)
        session = service.get_session(token=token)
        if session is None:
            raise HTTPException(status_code=401, detail="could not create session")
        return {
            "token": token,
            "admin": {
                "email": session.email,
                "country_code": session.country_code,
                "region": session.region,
            },
        }
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/v1/admin/me")
def admin_me(request: Request, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = _extract_bearer_token(authorization)
    service = _get_admin_auth_service(request)
    session = service.get_session(token=token)
    if session is None:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return {
        "admin": {
            "admin_id": session.admin_id,
            "email": session.email,
            "country_code": session.country_code,
            "region": session.region,
        }
    }


@app.post("/api/v1/admin/signout")
def admin_sign_out(request: Request, authorization: str | None = Header(default=None)) -> dict[str, bool]:
    token = _extract_bearer_token(authorization)
    service = _get_admin_auth_service(request)
    service.sign_out(token=token)
    return {"ok": True}


@app.get("/api/v1/policy/customer-summary")
def get_customer_summary(
    request: Request,
    country: str,
    authorization: str | None = Header(default=None),
    region: str | None = None,
) -> dict[str, Any]:
    token = _extract_bearer_token(authorization)
    auth_service = _get_admin_auth_service(request)
    session = auth_service.get_session(token=token)
    if session is None:
        raise HTTPException(status_code=401, detail="invalid or expired session")

    requested_country = country.strip().upper()
    if requested_country != session.country_code:
        raise HTTPException(status_code=403, detail="country not allowed for this admin")

    requested_region = (region or session.region).strip()
    service = _get_customer_data_service(request)
    return service.get_customer_summary(country=requested_country, region=requested_region)

