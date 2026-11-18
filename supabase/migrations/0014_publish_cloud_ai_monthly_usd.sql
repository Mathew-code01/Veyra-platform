-- Publish the explicitly approved initial VEYRA Cloud AI monthly offer.
-- USD pricing is independent of regional currencies; no exchange rate or
-- South African price is inferred here. This migration must be applied only
-- to a confirmed development database until its normal review/application.

insert into public.plans (
  id,
  name,
  family,
  description,
  billing_interval,
  price_cents,
  currency,
  features,
  device_limit,
  is_active,
  is_dev_fixture,
  is_published
) values (
  '47f925de-71f1-4b8f-84b8-0f53f823b629',
  'VEYRA Cloud AI',
  'cloud',
  'Monthly access to VEYRA-managed Cloud AI. Local AI and BYOK remain separate usage methods.',
  'monthly',
  2999,
  'USD',
  '{"cloudInference":true}'::jsonb,
  10,
  true,
  false,
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  features = excluded.features,
  is_active = excluded.is_active,
  is_dev_fixture = excluded.is_dev_fixture,
  is_published = excluded.is_published,
  updated_at = now();

insert into public.plan_prices (
  id,
  plan_id,
  billing_interval,
  price_cents,
  currency,
  is_active
) values (
  '5abc3769-7c19-48e9-9a7d-3036f68ac9a0',
  '47f925de-71f1-4b8f-84b8-0f53f823b629',
  'monthly',
  2999,
  'USD',
  true
)
on conflict (plan_id, billing_interval, currency) do update set
  price_cents = excluded.price_cents,
  is_active = excluded.is_active,
  updated_at = now();
