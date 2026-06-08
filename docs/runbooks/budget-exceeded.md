# Budget Exceeded

When a user sees:

```json
{ "error": { "code": "usage_exhausted", "message": "Таны хэрэглээ дууссан байна." } }
```

Check:

1. `api_client_budget_limits` for total/provider/model caps.
2. `api_usage_logs.cost_usd` for the client.
3. Provider-specific spend for `deepseek` and `kie.ai`.
4. Increase the budget limit or suspend the client intentionally.
