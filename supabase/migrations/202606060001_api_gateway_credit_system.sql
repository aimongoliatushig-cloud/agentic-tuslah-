create extension if not exists pgcrypto;

create table if not exists public.api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key_hash text not null unique,
  api_key_preview text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'disabled')),
  credit_balance integer not null default 0 check (credit_balance >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text not null default 'upstream',
  provider_model text not null,
  credit_cost integer not null default 1 check (credit_cost > 0),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.api_clients(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('credit', 'debit')),
  balance_after integer not null check (balance_after >= 0),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.api_clients(id) on delete cascade,
  model_id uuid not null references public.api_models(id) on delete restrict,
  request_id text not null unique,
  status text not null check (status in ('success', 'failed')),
  credit_cost integer not null default 0 check (credit_cost >= 0),
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists api_clients_status_idx on public.api_clients(status);
create index if not exists api_models_name_status_idx on public.api_models(name, status);
create index if not exists api_credit_transactions_client_created_idx
  on public.api_credit_transactions(client_id, created_at desc);
create index if not exists api_usage_logs_client_created_idx
  on public.api_usage_logs(client_id, created_at desc);
create index if not exists api_usage_logs_model_created_idx
  on public.api_usage_logs(model_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_api_clients_updated_at on public.api_clients;
create trigger set_api_clients_updated_at
before update on public.api_clients
for each row execute function public.set_updated_at();

drop trigger if exists set_api_models_updated_at on public.api_models;
create trigger set_api_models_updated_at
before update on public.api_models
for each row execute function public.set_updated_at();

alter table public.api_clients enable row level security;
alter table public.api_models enable row level security;
alter table public.api_credit_transactions enable row level security;
alter table public.api_usage_logs enable row level security;
