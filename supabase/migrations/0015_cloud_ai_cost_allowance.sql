-- Internal monthly provider-cost budget for managed Cloud AI.
-- This is an internal cost ceiling, not customer credits or an unlimited-use promise.
alter table public.plans
  add column if not exists cloud_ai_monthly_cost_limit_cents integer
  check (cloud_ai_monthly_cost_limit_cents is null or cloud_ai_monthly_cost_limit_cents > 0);

update public.plans
set cloud_ai_monthly_cost_limit_cents = 800,
    updated_at = now()
where id = '47f925de-71f1-4b8f-84b8-0f53f823b629'
  and family = 'cloud'
  and is_dev_fixture = false;
