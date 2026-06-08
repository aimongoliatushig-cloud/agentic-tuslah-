# Agentic Tuslah AI Gateway

Next.js App Router + Supabase AI API Gateway admin system.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required server-side env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_GATEWAY_ADMIN_TOKEN`
- `UPSTREAM_AI_API_KEY`
- `UPSTREAM_AI_BASE_URL`

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or upstream provider keys in public clients.

## Supabase Migrations

Run migrations in order from `supabase/migrations/`:

1. `202606060001_api_gateway_credit_system.sql`
2. `202606060002_api_gateway_usage_cost_tracking.sql`
3. `202606060003_api_gateway_usd_pricing_budgets.sql`
4. `202606060004_api_gateway_backfill_usage_costs.sql`
5. `202606080001_security_rate_limits_api_keys.sql`
6. `202606080002_atomic_credit_rpc.sql`
7. `202606080003_admin_audit_logs.sql`

## Admin Auth

Admin APIs and dashboard fail closed by default.

- Production requires `API_GATEWAY_ADMIN_TOKEN`.
- Local unsafe bypass only works when `API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV=true`.
- Browser dashboard login: `/admin/login`.
- API admin calls can use `Authorization: Bearer $API_GATEWAY_ADMIN_TOKEN`.

## Gateway

Public gateway endpoint:

```http
POST /api/gateway/generate
Authorization: Bearer agf_live_<keyId>_<secret>
```

Invalid payloads return:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid gateway request.",
    "details": []
  }
}
```

Rate limit responses return HTTP `429`.

Usage exhausted responses return HTTP `402`:

```json
{
  "error": {
    "code": "usage_exhausted",
    "message": "Таны хэрэглээ дууссан байна."
  }
}
```

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run seed:api-gateway
npm run test:api-gateway
```

## Production Checklist

- Set `API_GATEWAY_ADMIN_TOKEN`.
- Do not enable `API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV`.
- Do not enable mock provider unless intentionally testing.
- Set reverse proxy body size limits.
- Run all Supabase migrations.
- Rotate any leaked API keys immediately.
