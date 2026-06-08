create or replace function public.deduct_credit_if_sufficient(
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
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;

  update public.api_clients
  set
    credit_balance = credit_balance - p_amount,
    updated_at = now()
  where id = p_client_id
    and status = 'active'
    and credit_balance >= p_amount
  returning credit_balance into v_balance_after;

  if v_balance_after is null then
    return;
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
    'debit',
    v_balance_after,
    p_note,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  )
  returning id into v_transaction_id;

  transaction_id := v_transaction_id;
  balance_after := v_balance_after;
  return next;
end;
$$;

revoke all on function public.deduct_credit_if_sufficient(uuid, integer, text, text, jsonb) from public;
