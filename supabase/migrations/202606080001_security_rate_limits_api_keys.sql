create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, window_start)
);

create index if not exists api_rate_limits_key_window_idx
  on public.api_rate_limits(key, window_start desc);

drop trigger if exists set_api_rate_limits_updated_at on public.api_rate_limits;
create trigger set_api_rate_limits_updated_at
before update on public.api_rate_limits
for each row execute function public.set_updated_at();

alter table public.api_rate_limits enable row level security;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.api_clients(id) on delete cascade,
  key_id text not null unique,
  key_hash text not null,
  key_preview text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked')),
  scopes jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_keys_key_id_idx on public.api_keys(key_id);
create index if not exists api_keys_client_status_idx on public.api_keys(client_id, status);

drop trigger if exists set_api_keys_updated_at on public.api_keys;
create trigger set_api_keys_updated_at
before update on public.api_keys
for each row execute function public.set_updated_at();

alter table public.api_keys enable row level security;
