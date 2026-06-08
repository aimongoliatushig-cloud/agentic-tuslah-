# Architecture

The system is a Next.js App Router application with Supabase-backed API Gateway services.

## Request Flow

```text
Client API key
  -> /api/gateway/generate
  -> request validation
  -> rate limit
  -> api_keys key_id lookup
  -> client/model validation
  -> credit + budget checks
  -> provider adapter
  -> atomic credit deduction
  -> usage log
```

## Admin Flow

```text
/admin/login
  -> admin token verification
  -> signed httpOnly cookie
  -> /dashboard/api-gateway
  -> server-side guard
```

## Billing

DeepSeek token billing distinguishes:

- cache-hit input tokens
- cache-miss input tokens
- output tokens

Kie.ai image billing uses image/request units.

Budgets are enforced in USD, while the UI can show percentages or MNT cost snapshots.
