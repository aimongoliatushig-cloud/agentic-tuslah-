-- Kie.ai video models: Google Veo 3 (dedicated /api/v1/veo API, config.kie_flow=veo)
-- and Kling 2.6 text-to-video (generic jobs/createTask market API).
--
-- Billing:
--   veo3 / veo3-fast — unit_price_usd is the per-video price (billable unit = 1 video).
--   kling-2.6 — unit_price_usd 0.005 = price of ONE Kie credit; the provider
--     reports creditsConsumed per task, which becomes billable_units, so the
--     charge follows Kie's own metering (duration/mode-dependent).
-- credit_cost is only the up-front reservation; reconcileReservedCredit settles
-- the final charge from actual billable units.

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
    'veo3-fast',
    'kie.ai',
    'veo3_fast',
    1,
    'image',
    0.40,
    'active',
    '{"kie_flow": "veo", "poll_timeout_ms": 600000, "kind": "video"}'::jsonb,
    'https://docs.kie.ai/veo3-api/quickstart',
    now()
  ),
  (
    'veo3',
    'kie.ai',
    'veo3',
    1,
    'image',
    2.00,
    'active',
    '{"kie_flow": "veo", "poll_timeout_ms": 900000, "kind": "video"}'::jsonb,
    'https://docs.kie.ai/veo3-api/quickstart',
    now()
  ),
  (
    'kling-2.6',
    'kie.ai',
    'kling-2.6/text-to-video',
    60,
    'image',
    0.005,
    'active',
    '{"poll_timeout_ms": 600000, "kind": "video", "input_defaults": {"sound": false, "duration": "5"}}'::jsonb,
    'https://docs.kie.ai/market/kling/text-to-video',
    now()
  )
on conflict (name) do update set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  credit_cost = excluded.credit_cost,
  billing_type = excluded.billing_type,
  unit_price_usd = excluded.unit_price_usd,
  status = excluded.status,
  config = excluded.config,
  pricing_source_url = excluded.pricing_source_url,
  pricing_checked_at = excluded.pricing_checked_at;
