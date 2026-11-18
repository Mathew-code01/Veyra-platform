-- Commercial Cloud offers must be explicitly published by an authorized
-- operator. Existing fixtures and plans remain unpublished by default.
alter table public.plans
  add column if not exists is_published boolean not null default false;

comment on column public.plans.is_published is
  'Commercial catalogue publication switch. Must remain false until approved price, terms, usage policy, and checkout configuration are ready.';

-- A plan can have one price per billing interval and currency. Existing rows
-- remain intact; the old constraint prevented regional prices for one plan.
alter table public.plan_prices
  drop constraint if exists plan_prices_plan_id_billing_interval_key;

alter table public.plan_prices
  add constraint plan_prices_plan_interval_currency_key
  unique (plan_id, billing_interval, currency);
