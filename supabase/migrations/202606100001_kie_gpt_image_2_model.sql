update public.api_models
set status = 'inactive'
where provider = 'kie.ai'
  and name <> 'gpt-image-2';

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
values (
  'gpt-image-2',
  'kie.ai',
  'gpt-image-2-text-to-image',
  6,
  'image',
  0.005,
  'active',
  '{"type":"Image","mode":"text-to-image","endpoint":"/api/v1/jobs/createTask","query_endpoint":"/api/v1/jobs/recordInfo","default_aspect_ratio":"auto","default_resolution":"1K"}',
  'https://kie.ai/gpt-image-2',
  now()
)
on conflict (name) do update
set
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  credit_cost = excluded.credit_cost,
  billing_type = excluded.billing_type,
  unit_price_usd = excluded.unit_price_usd,
  status = excluded.status,
  config = excluded.config,
  pricing_source_url = excluded.pricing_source_url,
  pricing_checked_at = excluded.pricing_checked_at,
  updated_at = now();
