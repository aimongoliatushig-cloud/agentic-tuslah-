alter table public.api_models
  add column if not exists input_cache_hit_1m_token_price_usd numeric(14, 8) not null default 0
    check (input_cache_hit_1m_token_price_usd >= 0),
  add column if not exists input_cache_miss_1m_token_price_usd numeric(14, 8) not null default 0
    check (input_cache_miss_1m_token_price_usd >= 0),
  add column if not exists output_1m_token_price_usd numeric(14, 8) not null default 0
    check (output_1m_token_price_usd >= 0),
  add column if not exists unit_price_usd numeric(14, 8) not null default 0
    check (unit_price_usd >= 0),
  add column if not exists pricing_source_url text,
  add column if not exists pricing_checked_at timestamptz;

alter table public.api_usage_logs
  add column if not exists input_cache_hit_tokens integer,
  add column if not exists input_cache_miss_tokens integer,
  add column if not exists cost_usd numeric(14, 8) not null default 0
    check (cost_usd >= 0),
  add column if not exists estimated_cost_usd numeric(14, 8) not null default 0
    check (estimated_cost_usd >= 0);

create table if not exists public.api_client_budget_limits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.api_clients(id) on delete cascade,
  scope_type text not null check (scope_type in ('total', 'provider', 'model')),
  scope_key text not null default '*',
  period text not null default 'lifetime'
    check (period in ('daily', 'weekly', 'monthly', 'lifetime')),
  limit_usd numeric(14, 8) not null check (limit_usd >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, scope_type, scope_key, period)
);

create index if not exists api_client_budget_limits_client_idx
  on public.api_client_budget_limits(client_id, status);

create index if not exists api_usage_logs_cost_usd_created_idx
  on public.api_usage_logs(cost_usd, created_at desc);

drop trigger if exists set_api_client_budget_limits_updated_at on public.api_client_budget_limits;
create trigger set_api_client_budget_limits_updated_at
before update on public.api_client_budget_limits
for each row execute function public.set_updated_at();

alter table public.api_client_budget_limits enable row level security;

update public.api_models
set
  provider = 'deepseek',
  billing_type = 'token',
  input_cache_hit_1m_token_price_usd = 0.0028,
  input_cache_miss_1m_token_price_usd = 0.14,
  output_1m_token_price_usd = 0.28,
  input_1k_token_price_mnt = 0,
  output_1k_token_price_mnt = 0,
  unit_price_usd = 0,
  pricing_source_url = 'https://api-docs.deepseek.com/quick_start/pricing',
  pricing_checked_at = now()
where name in ('deepseek-chat', 'deepseek-v4-flash');

insert into public.api_models (
  name,
  provider,
  provider_model,
  credit_cost,
  billing_type,
  unit_price_usd,
  status,
  config,
  pricing_source_url,
  pricing_checked_at
)
values
  (
    'nano-banana-2-1k',
    'kie.ai',
    'google/nano-banana',
    1,
    'image',
    0.04,
    'active',
    '{"type":"Image","resolution":"1K","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/pricing',
    now()
  ),
  (
    'nano-banana-2-2k',
    'kie.ai',
    'google/nano-banana',
    1,
    'image',
    0.06,
    'active',
    '{"type":"Image","resolution":"2K","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/pricing',
    now()
  ),
  (
    'nano-banana-2-4k',
    'kie.ai',
    'google/nano-banana',
    1,
    'image',
    0.09,
    'active',
    '{"type":"Image","resolution":"4K","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/pricing',
    now()
  ),
  (
    'nano-banana-pro-2k',
    'kie.ai',
    'google/nano-banana-pro',
    1,
    'image',
    0.09,
    'active',
    '{"type":"Image","resolution":"1K/2K","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/nano-banana-pro',
    now()
  ),
  (
    'nano-banana-pro-4k',
    'kie.ai',
    'google/nano-banana-pro',
    1,
    'image',
    0.12,
    'active',
    '{"type":"Image","resolution":"4K","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/nano-banana-pro',
    now()
  ),
  (
    'gpt-image-2',
    'kie.ai',
    'openai/gpt-image-2',
    1,
    'image',
    0.03,
    'active',
    '{"type":"Image","endpoint":"/api/v1/jobs/createTask"}',
    'https://kie.ai/pricing',
    now()
  )
on conflict (name) do update
set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  billing_type = excluded.billing_type,
  unit_price_usd = excluded.unit_price_usd,
  config = excluded.config,
  pricing_source_url = excluded.pricing_source_url,
  pricing_checked_at = excluded.pricing_checked_at;

insert into public.api_client_budget_limits (client_id, scope_type, scope_key, period, limit_usd, metadata)
select id, 'total', '*', 'lifetime', 10, '{"default":true,"source":"api-gateway-mvp"}'
from public.api_clients
on conflict (client_id, scope_type, scope_key, period) do nothing;

insert into public.api_client_budget_limits (client_id, scope_type, scope_key, period, limit_usd, metadata)
select id, 'provider', 'deepseek', 'lifetime', 5, '{"default":true,"source":"api-gateway-mvp"}'
from public.api_clients
on conflict (client_id, scope_type, scope_key, period) do nothing;

insert into public.api_client_budget_limits (client_id, scope_type, scope_key, period, limit_usd, metadata)
select id, 'provider', 'kie.ai', 'lifetime', 5, '{"default":true,"source":"api-gateway-mvp"}'
from public.api_clients
on conflict (client_id, scope_type, scope_key, period) do nothing;
