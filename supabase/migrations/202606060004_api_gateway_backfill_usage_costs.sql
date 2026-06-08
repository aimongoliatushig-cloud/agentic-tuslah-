do $$
declare
  usd_to_mnt_rate numeric := 3569.47;
begin
  update public.api_usage_logs logs
  set
    total_tokens = coalesce(
      logs.total_tokens,
      logs.input_tokens + logs.output_tokens,
      ((logs.provider_response #>> '{usage,total_tokens}')::integer)
    ),
    input_cache_hit_tokens = coalesce(
      logs.input_cache_hit_tokens,
      nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer,
      nullif(logs.provider_response #>> '{usage,prompt_tokens_details,cached_tokens}', '')::integer,
      0
    ),
    input_cache_miss_tokens = coalesce(
      logs.input_cache_miss_tokens,
      nullif(logs.provider_response #>> '{usage,prompt_cache_miss_tokens}', '')::integer,
      greatest(
        0,
        coalesce(logs.input_tokens, 0) - coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0)
      )
    ),
    billable_units = case
      when models.billing_type = 'token' then coalesce(logs.input_tokens, 0) + coalesce(logs.output_tokens, 0)
      when models.billing_type in ('image', 'request') then greatest(logs.billable_units, 1)
      else logs.billable_units
    end,
    cost_usd = case
      when models.billing_type = 'token' then
        (
          coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::numeric, 0)
          / 1000000
          * models.input_cache_hit_1m_token_price_usd
        )
        +
        (
          coalesce(
            nullif(logs.provider_response #>> '{usage,prompt_cache_miss_tokens}', '')::numeric,
            greatest(
              0,
              coalesce(logs.input_tokens, 0)
              - coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0)
            )
          )
          / 1000000
          * models.input_cache_miss_1m_token_price_usd
        )
        +
        (
          coalesce(logs.output_tokens, 0)
          / 1000000
          * models.output_1m_token_price_usd
        )
      when models.billing_type in ('image', 'request') then greatest(logs.billable_units, 1) * models.unit_price_usd
      else logs.cost_usd
    end,
    estimated_cost_usd = case
      when models.billing_type = 'token' then
        (
          coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::numeric, 0)
          / 1000000
          * models.input_cache_hit_1m_token_price_usd
        )
        +
        (
          coalesce(
            nullif(logs.provider_response #>> '{usage,prompt_cache_miss_tokens}', '')::numeric,
            greatest(
              0,
              coalesce(logs.input_tokens, 0)
              - coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0)
            )
          )
          / 1000000
          * models.input_cache_miss_1m_token_price_usd
        )
        +
        (
          coalesce(logs.output_tokens, 0)
          / 1000000
          * models.output_1m_token_price_usd
        )
      when models.billing_type in ('image', 'request') then greatest(logs.billable_units, 1) * models.unit_price_usd
      else logs.estimated_cost_usd
    end,
    cost_mnt = case
      when models.billing_type = 'token' then
        (
          (
            coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::numeric, 0)
            / 1000000
            * models.input_cache_hit_1m_token_price_usd
          )
          +
          (
            coalesce(
              nullif(logs.provider_response #>> '{usage,prompt_cache_miss_tokens}', '')::numeric,
              greatest(
                0,
                coalesce(logs.input_tokens, 0)
                - coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0)
              )
            )
            / 1000000
            * models.input_cache_miss_1m_token_price_usd
          )
          +
          (
            coalesce(logs.output_tokens, 0)
            / 1000000
            * models.output_1m_token_price_usd
          )
        ) * usd_to_mnt_rate
      when models.billing_type in ('image', 'request') then greatest(logs.billable_units, 1) * models.unit_price_usd * usd_to_mnt_rate
      else logs.cost_mnt
    end,
    cost_breakdown = jsonb_build_object(
      'backfilled', true,
      'billingType', models.billing_type,
      'inputTokens', logs.input_tokens,
      'outputTokens', logs.output_tokens,
      'totalTokens', coalesce(logs.total_tokens, logs.input_tokens + logs.output_tokens),
      'inputCacheHitTokens', coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0),
      'inputCacheMissTokens', coalesce(
        nullif(logs.provider_response #>> '{usage,prompt_cache_miss_tokens}', '')::integer,
        greatest(
          0,
          coalesce(logs.input_tokens, 0)
          - coalesce(nullif(logs.provider_response #>> '{usage,prompt_cache_hit_tokens}', '')::integer, 0)
        )
      ),
      'prices', jsonb_build_object(
        'inputCacheHit1mTokenUsd', models.input_cache_hit_1m_token_price_usd,
        'inputCacheMiss1mTokenUsd', models.input_cache_miss_1m_token_price_usd,
        'output1mTokenUsd', models.output_1m_token_price_usd,
        'unitUsd', models.unit_price_usd,
        'usdToMntRate', usd_to_mnt_rate,
        'pricingSourceUrl', models.pricing_source_url,
        'pricingCheckedAt', models.pricing_checked_at
      )
    )
  from public.api_models models
  where logs.model_id = models.id
    and logs.status = 'success'
    and (
      logs.cost_usd = 0
      or logs.cost_mnt = 0
      or logs.total_tokens is null
      or logs.total_tokens = 0
    );
end $$;
