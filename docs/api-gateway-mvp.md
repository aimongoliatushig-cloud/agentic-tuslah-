# AI API Gateway + Credit System MVP

This project contains the backend foundation for an AI API Gateway with API
clients, hashed API keys, model costs, credit balances, transactions, and usage
logs.

## 1. Create A Supabase Project

1. Open the Supabase dashboard.
2. Create a new project.
3. Save the project URL, publishable key, and service-role key from Project
   Settings > API.
4. Keep the service-role key server-side only. Do not expose it in browser code.

For this MVP, the backend needs service-role access because API key validation,
credit deduction, and usage logging run on the server.

## 2. Configure Environment Values

Create `.env` in the project root and paste the values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
API_GATEWAY_ADMIN_TOKEN=
UPSTREAM_AI_API_KEY=
UPSTREAM_AI_BASE_URL=
UPSTREAM_AI_REQUEST_MODE=generic
UPSTREAM_AI_TIMEOUT_MS=30000
UPSTREAM_AI_RETRY_COUNT=1
UPSTREAM_AI_EXTRA_HEADERS_JSON=
API_GATEWAY_TEST_BASE_URL=http://localhost:3000
API_GATEWAY_DEMO_API_KEY=
API_GATEWAY_CREDIT_VALUE=1000
```

`UPSTREAM_AI_API_KEY` and `UPSTREAM_AI_BASE_URL` are optional for the MVP. When
either is missing, `/api/gateway/generate` stays in mock provider mode.

## Production Provider Setup

To test with a real provider, set these server-side values:

```bash
UPSTREAM_AI_API_KEY=YOUR_REAL_PROVIDER_KEY
UPSTREAM_AI_BASE_URL=https://YOUR_PROVIDER_ENDPOINT
UPSTREAM_AI_REQUEST_MODE=generic
UPSTREAM_AI_TIMEOUT_MS=30000
UPSTREAM_AI_RETRY_COUNT=1
```

Use `UPSTREAM_AI_REQUEST_MODE=openai-compatible` when the provider accepts a
Chat Completions style request:

```json
{
  "model": "provider-model-id",
  "messages": [{ "role": "user", "content": "prompt" }]
}
```

Use `UPSTREAM_AI_REQUEST_MODE=generic` when the provider accepts this gateway
payload:

```json
{
  "model": "provider-model-id",
  "prompt": "prompt",
  "input": {},
  "parameters": {}
}
```

If the provider requires extra static headers, set:

```bash
UPSTREAM_AI_EXTRA_HEADERS_JSON={"X-Custom-Header":"value"}
```

After setting the real provider env values, restart the server and check:

```bash
curl http://localhost:3000/api/gateway/health
```

For production provider mode, expect:

```json
{
  "database_connected": true,
  "mock_provider_mode": false,
  "provider_ready": true
}
```

Set `API_GATEWAY_ADMIN_TOKEN` in production to require `x-admin-token` or
`Authorization: Bearer TOKEN` on admin API routes. The dashboard UI still needs
the project's real auth/session layer before exposing it publicly.

## 3. Run The Database Migration

Migration file:

```text
supabase/migrations/202606060001_api_gateway_credit_system.sql
```

### Option A: Supabase CLI

Do not assume the CLI is installed. Check first:

```bash
supabase --version
```

If missing, either install it from the official Supabase CLI instructions for
your OS or run it with `npx`:

```bash
npx supabase --version
```

Then run:

```bash
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Equivalent `npx` commands:

```bash
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

`supabase link` requires either `supabase login` or a
`SUPABASE_ACCESS_TOKEN` environment variable. If the CLI asks for a database
password, use the password configured for the Supabase project database.

### Option B: Manual SQL Copy-Paste

If you do not have the Supabase CLI:

1. Open the Supabase dashboard.
2. Go to SQL Editor.
3. Open `supabase/migrations/202606060001_api_gateway_credit_system.sql`.
4. Copy the full SQL contents.
5. Paste it into SQL Editor.
6. Run the query.

After running the migration, these tables should exist:

- `api_clients`
- `api_models`
- `api_credit_transactions`
- `api_usage_logs`

Then run the cost tracking migration:

```text
supabase/migrations/202606060002_api_gateway_usage_cost_tracking.sql
```

This adds token, image/request unit, and MNT cost tracking:

- `api_models.billing_type`
- `api_models.input_1k_token_price_mnt`
- `api_models.output_1k_token_price_mnt`
- `api_models.unit_price_mnt`
- `api_usage_logs.total_tokens`
- `api_usage_logs.billable_units`
- `api_usage_logs.cost_mnt`
- `api_usage_logs.cost_breakdown`

Example text model pricing:

```sql
update public.api_models
set
  billing_type = 'token',
  input_1k_token_price_mnt = 1.50,
  output_1k_token_price_mnt = 6.00,
  unit_price_mnt = 0
where name = 'deepseek-chat';
```

Example image model pricing:

```sql
update public.api_models
set
  billing_type = 'image',
  input_1k_token_price_mnt = 0,
  output_1k_token_price_mnt = 0,
  unit_price_mnt = 250
where name = 'nano-banana';
```

Then run the USD pricing and budget migration:

```text
supabase/migrations/202606060003_api_gateway_usd_pricing_budgets.sql
```

This adds:

- DeepSeek input cache-hit, input cache-miss, and output token USD pricing.
- Kie.ai image model USD pricing for Nano Banana 2, Nano Banana Pro, and GPT Image 2.
- Per-client budget limits.
- Default lifetime budgets for every existing client:
  - Total usage: `$10`
  - DeepSeek provider usage: `$5`
  - Kie.ai provider usage: `$5`

Pricing sources checked:

- DeepSeek: `https://api-docs.deepseek.com/quick_start/pricing`
- Kie.ai pricing: `https://kie.ai/pricing`
- Kie.ai Nano Banana Pro: `https://kie.ai/nano-banana-pro`

Budget limits are enforced before provider calls. Text requests use a conservative estimate based on input text length and `max_tokens`; image requests use the model `unit_price_usd`.

Then run the production hardening migrations:

```text
supabase/migrations/202606080001_security_rate_limits_api_keys.sql
supabase/migrations/202606080002_atomic_credit_rpc.sql
supabase/migrations/202606080003_admin_audit_logs.sql
```

These add indexed API keys, rate limit counters, atomic credit deduction RPC, and admin audit logs.

## 4. Run The Demo Seed

```bash
npm run seed:api-gateway
```

The seed creates:

- Demo client: `Demo API Gateway Client`
- Demo model: `image-basic`
- Starting credit balance: `100`
- Model cost: `1` credit

The seed prints the raw demo API key only once, when the client is first
created. Store it safely, then paste it into `.env`:

```bash
API_GATEWAY_DEMO_API_KEY=agf_live_...
```

The database stores only the API key hash and preview.

## 5. Start The App

```bash
npm run dev
```

If the app runs on a different port, update:

```bash
API_GATEWAY_TEST_BASE_URL=http://localhost:YOUR_PORT
```

## 6. Health Check

```bash
curl http://localhost:3000/api/gateway/health
```

Expected response:

```json
{
  "status": "ok",
  "database_connected": true,
  "mock_provider_mode": true,
  "timestamp": "2026-06-06T00:00:00.000Z"
}
```

`mock_provider_mode` is `true` when provider env values are missing.

If the migration has not been applied yet, the health endpoint returns:

```json
{
  "status": "degraded",
  "database_connected": false,
  "mock_provider_mode": true,
  "timestamp": "2026-06-06T00:00:00.000Z"
}
```

## 7. Test Gateway With Curl

```bash
curl -X POST http://localhost:3000/api/gateway/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DEMO_CLIENT_API_KEY" \
  -d '{
    "model": "image-basic",
    "prompt": "Create a clean product image concept"
  }'
```

Expected success response:

```json
{
  "ok": true,
  "data": {
    "requestId": "uuid",
    "model": "image-basic",
    "creditCost": 1,
    "balanceAfter": 99,
    "provider": {
      "mode": "mock",
      "model": "image-basic",
      "providerModel": "image-basic",
      "prompt": "Create a clean product image concept",
      "output": "Mock provider response. Configure UPSTREAM_AI_API_KEY and UPSTREAM_AI_BASE_URL to call a real provider."
    }
  }
}
```

## 8. Verify Credit Deduction

Before and after calling `/api/gateway/generate`, check the demo client:

```bash
curl http://localhost:3000/api/admin/api-gateway/clients
```

The `credit_balance` should decrease by the model `credit_cost`. For the demo
model, each successful request deducts `1` credit.

## 9. Verify Usage Logs

```bash
curl http://localhost:3000/api/admin/api-gateway/usage?limit=20
```

Expected response shape:

```json
{
  "usage": [
    {
      "id": "uuid",
      "client_id": "uuid",
      "model_id": "uuid",
      "request_id": "uuid",
      "status": "success",
      "credit_cost": 1,
      "latency_ms": 123,
      "created_at": "2026-06-06T00:00:00.000Z"
    }
  ]
}
```

## 10. Run Automated Smoke Test

After `.env` includes `API_GATEWAY_DEMO_API_KEY` and the app is running:

```bash
npm run test:api-gateway
```

The script verifies:

- health endpoint returns `database_connected: true`
- `/api/gateway/generate` succeeds
- credit balance is deducted
- usage log exists for the gateway request
- an insufficient-credit failed request creates a failed usage log

## Insufficient Credit Response

When the client does not have enough balance for the selected model, the gateway
returns HTTP `402`:

```json
{
  "error": "Insufficient credit balance."
}
```
