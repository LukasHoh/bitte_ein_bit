# Matching API

## Run locally

From the `backend_matching/` directory:

```bash
uv run uvicorn matching_service.api.main:app --reload
```

## Endpoints

- `GET /health`
- `POST /api/v1/matching/run`

## Example request

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/matching/run" \
  -H "Content-Type: application/json" \
  -d '{
    "skills": {
      "http://data.europa.eu/esco/skill/05bc7677-5a64-4e0c-ade3-0140348d4125": 0.9,
      "http://data.europa.eu/esco/skill/47ed1d37-971b-472c-86be-26f893991274": 0.8
    },
    "country": "AFG",
    "sex": "female",
    "reference_year": 2020,
    "top_k": 5
  }'
```

The response includes:

- `context`
- `occupations` with base skill fields plus enrichment signals (`earnings_value_local`, `occupation_demand_level`, `occupation_unemployment_risk`, `hours_worked`, `informality_rate`).

