alter table public.api_models
  add column if not exists billing_type text not null default 'credit'
    check (billing_type in ('credit', 'token', 'image', 'request')),
  add column if not exists input_1k_token_price_mnt numeric(14, 4) not null default 0
    check (input_1k_token_price_mnt >= 0),
  add column if not exists output_1k_token_price_mnt numeric(14, 4) not null default 0
    check (output_1k_token_price_mnt >= 0),
  add column if not exists unit_price_mnt numeric(14, 4) not null default 0
    check (unit_price_mnt >= 0);

alter table public.api_usage_logs
  add column if not exists total_tokens integer,
  add column if not exists billable_units numeric(14, 4) not null default 0
    check (billable_units >= 0),
  add column if not exists cost_mnt numeric(14, 4) not null default 0
    check (cost_mnt >= 0),
  add column if not exists cost_breakdown jsonb not null default '{}'::jsonb;

update public.api_usage_logs
set total_tokens = coalesce(input_tokens, 0) + coalesce(output_tokens, 0)
where total_tokens is null
  and (input_tokens is not null or output_tokens is not null);

create index if not exists api_usage_logs_cost_created_idx
  on public.api_usage_logs(cost_mnt, created_at desc);

create index if not exists api_usage_logs_total_tokens_created_idx
  on public.api_usage_logs(total_tokens, created_at desc);
