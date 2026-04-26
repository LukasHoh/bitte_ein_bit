# Policymaker Dashboard (Local Demo)

This dashboard is a separate frontend for policymaker/program-officer use.

It surfaces:
- labor market parameters from `data/api/policy_data_service.py`
- customer skill profiles and simple admin-region user stats

## Run

```bash
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- The current dashboard uses local demo data from `src/lib/policyClient.ts`.
- Replace that client with real runtime integration to `PolicyDataService` when wiring your final local demo flow.

