# Local Policy Data Service

Local (non-HTTP) data access for policymaker dashboard.

- Public method: `PolicyDataService.get_dashboard_data(...)`
- Location: `data/api/policy_data_service.py`

## Example

```python
from data.api.policy_data_service import PolicyDataService

service = PolicyDataService()
payload = service.get_dashboard_data(
    country="AFG",
    sex="female",
    reference_year=2020,
    start_year=2018,
    end_year=2022,
)
```

