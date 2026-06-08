create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_subject text not null,
  admin_role text not null default 'owner',
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_entity_created_idx
  on public.admin_audit_logs(entity_type, entity_id, created_at desc);

create index if not exists admin_audit_logs_action_created_idx
  on public.admin_audit_logs(action, created_at desc);

alter table public.admin_audit_logs enable row level security;
