create or replace function public.increment_rate_limit(
  p_key text,
  p_window_start timestamptz
)
returns table (
  count integer
)
language sql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.increment_rate_limit(text, timestamptz) from public;

create or replace function public.add_credit_atomic(
  p_client_id uuid,
  p_amount integer,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  transaction_id uuid,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_after integer;
  v_transaction_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  update public.api_clients
  set
    credit_balance = credit_balance + p_amount,
    updated_at = now()
  where id = p_client_id
    and status = 'active'
  returning credit_balance into v_balance_after;

  if v_balance_after is null then
    raise exception 'active client not found';
  end if;

  insert into public.api_credit_transactions (
    client_id,
    amount,
    type,
    balance_after,
    note,
    metadata
  )
  values (
    p_client_id,
    p_amount,
    'credit',
    v_balance_after,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_transaction_id;

  transaction_id := v_transaction_id;
  balance_after := v_balance_after;
  return next;
end;
$$;

revoke all on function public.add_credit_atomic(uuid, integer, text, jsonb) from public;

create or replace function public.refund_credit_for_request(
  p_client_id uuid,
  p_amount integer,
  p_request_id text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  transaction_id uuid,
  balance_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_after integer;
  v_transaction_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  perform 1
  from public.api_clients
  where id = p_client_id
  for update;

  if not found then
    raise exception 'client not found';
  end if;

  if not exists (
    select 1
    from public.api_credit_transactions
    where client_id = p_client_id
      and type = 'debit'
      and metadata->>'request_id' = p_request_id
  ) then
    raise exception 'reserved debit transaction not found';
  end if;

  select id, public.api_credit_transactions.balance_after
  into v_transaction_id, v_balance_after
  from public.api_credit_transactions
  where client_id = p_client_id
    and type = 'credit'
    and metadata->>'refund_of_request_id' = p_request_id
  order by created_at asc
  limit 1;

  if v_transaction_id is not null then
    transaction_id := v_transaction_id;
    balance_after := v_balance_after;
    return next;
    return;
  end if;

  update public.api_clients
  set
    credit_balance = credit_balance + p_amount,
    updated_at = now()
  where id = p_client_id
  returning credit_balance into v_balance_after;

  insert into public.api_credit_transactions (
    client_id,
    amount,
    type,
    balance_after,
    note,
    metadata
  )
  values (
    p_client_id,
    p_amount,
    'credit',
    v_balance_after,
    p_note,
    coalesce(p_metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'request_id', gen_random_uuid()::text,
        'refund_of_request_id', p_request_id
      )
  )
  returning id into v_transaction_id;

  transaction_id := v_transaction_id;
  balance_after := v_balance_after;
  return next;
end;
$$;

revoke all on function public.refund_credit_for_request(uuid, integer, text, text, jsonb) from public;

create or replace function public.create_api_client_with_key(
  p_name text,
  p_api_key_hash text,
  p_api_key_preview text,
  p_key_id text,
  p_initial_credit integer default 0,
  p_metadata jsonb default '{}'::jsonb,
  p_default_budget_limits jsonb default '[]'::jsonb
)
returns table (
  id uuid,
  name text,
  api_key_preview text,
  status text,
  credit_balance integer,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client public.api_clients%rowtype;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'client name is required';
  end if;

  if p_initial_credit < 0 then
    raise exception 'initial credit must be non-negative';
  end if;

  insert into public.api_clients (
    name,
    api_key_hash,
    api_key_preview,
    credit_balance,
    metadata
  )
  values (
    p_name,
    p_api_key_hash,
    p_api_key_preview,
    p_initial_credit,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_client;

  insert into public.api_keys (
    client_id,
    key_id,
    key_hash,
    key_preview,
    status
  )
  values (
    v_client.id,
    p_key_id,
    p_api_key_hash,
    p_api_key_preview,
    'active'
  );

  insert into public.api_client_budget_limits (
    client_id,
    scope_type,
    scope_key,
    period,
    limit_usd,
    metadata
  )
  select
    v_client.id,
    budget.scope_type,
    budget.scope_key,
    budget.period,
    budget.limit_usd,
    coalesce(budget.metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_default_budget_limits, '[]'::jsonb)) as budget(
    scope_type text,
    scope_key text,
    period text,
    limit_usd numeric,
    metadata jsonb
  );

  id := v_client.id;
  name := v_client.name;
  api_key_preview := v_client.api_key_preview;
  status := v_client.status;
  credit_balance := v_client.credit_balance;
  metadata := v_client.metadata;
  created_at := v_client.created_at;
  updated_at := v_client.updated_at;
  return next;
end;
$$;

revoke all on function public.create_api_client_with_key(text, text, text, text, integer, jsonb, jsonb) from public;
