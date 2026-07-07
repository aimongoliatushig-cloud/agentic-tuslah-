-- Aggregates a client's successful usage spend in the database instead of
-- shipping every log row to the app on each budget check.
create or replace function public.sum_usage_costs(
  p_client_id uuid,
  p_since timestamptz default null
)
returns table (
  model_id uuid,
  model_name text,
  provider text,
  total_cost_usd numeric
)
language sql
security definer
set search_path = public
as $$
  select
    l.model_id,
    m.name as model_name,
    m.provider,
    coalesce(sum(l.cost_usd), 0)::numeric as total_cost_usd
  from public.api_usage_logs l
  join public.api_models m on m.id = l.model_id
  where l.client_id = p_client_id
    and l.status = 'success'
    and (p_since is null or l.created_at >= p_since)
  group by l.model_id, m.name, m.provider;
$$;

revoke all on function public.sum_usage_costs(uuid, timestamptz) from public;

-- Rate-limit windows are transient; drop stale rows opportunistically so the
-- table does not grow forever. The window_start index keeps the delete cheap.
create index if not exists api_rate_limits_window_start_idx
  on public.api_rate_limits(window_start);

create or replace function public.increment_rate_limit(
  p_key text,
  p_window_start timestamptz
)
returns table (
  count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.api_rate_limits
  where window_start < now() - interval '1 day';

  return query
  insert into public.api_rate_limits (
    key,
    window_start,
    count
  )
  values (
    p_key,
    p_window_start,
    1
  )
  on conflict (key, window_start)
  do update set
    count = public.api_rate_limits.count + 1,
    updated_at = now()
  returning public.api_rate_limits.count;
end;
$$;

revoke all on function public.increment_rate_limit(text, timestamptz) from public;
