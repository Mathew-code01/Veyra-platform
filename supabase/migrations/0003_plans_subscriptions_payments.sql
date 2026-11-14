-- Veyra Platform Phase 5: Plans, Subscriptions, and Payments schema
--
-- Tables:
--   plans            - Configurable plan catalogue (Local, Hybrid, Cloud families)
--   plan_prices      - Price references per plan/billing interval
--   subscriptions    - User subscription state machine
--   payment_customers - Payment provider customer references
--   payment_transactions - Payment transaction records
--   webhook_events   - Persisted webhook events for idempotency
--
-- All tables use UUID primary keys, foreign keys, unique constraints, indexes,
-- timestamps, ownership, and Row Level Security (RLS) where relevant.
--
-- No production users, payment records, or secrets are seeded here.
-- Sample plan records are marked as development fixtures.

-- ---------------------------------------------------------------------------
-- plans: configurable plan catalogue
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  family text not null check (family in ('local', 'hybrid', 'cloud')),
  description text,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'USD' check (length(currency) = 3),
  features jsonb not null default '{}'::jsonb,
  device_limit integer not null check (device_limit > 0),
  is_active boolean not null default true,
  is_dev_fixture boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- plan_prices: price references per plan/billing interval
-- ---------------------------------------------------------------------------
create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'USD' check (length(currency) = 3),
  provider_price_id text, -- external provider price reference (stripe, etc.)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, billing_interval)
);

-- ---------------------------------------------------------------------------
-- subscriptions: user subscription state machine
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  status text not null check (status in (
    'inactive', 'trialing', 'active', 'past_due', 'canceled',
    'unpaid', 'incomplete', 'incomplete_expired', 'grace_period'
  )),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  provider_subscription_id text, -- external provider subscription reference
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id) -- one active subscription per user
);

-- ---------------------------------------------------------------------------
-- payment_customers: payment provider customer references
-- ---------------------------------------------------------------------------
create table public.payment_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_customer_id text not null, -- external provider customer reference
  provider text not null default 'mock', -- payment provider identifier
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- ---------------------------------------------------------------------------
-- payment_transactions: payment transaction records
-- ---------------------------------------------------------------------------
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  customer_id uuid references public.payment_customers(id) on delete set null,
  amount_cents bigint not null,
  currency text not null default 'USD' check (length(currency) = 3),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
  provider_transaction_id text, -- external provider transaction reference
  payment_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- webhook_events: persisted webhook events for idempotency
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mock',
  event_id text not null, -- external provider event ID
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_plans_family on public.plans(family);
create index idx_plans_active on public.plans(is_active) where is_active = true;
create index idx_plan_prices_plan_id on public.plan_prices(plan_id);
create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_status on public.subscriptions(status);
create index idx_subscriptions_provider_id on public.subscriptions(provider_subscription_id);
create index idx_payment_customers_user_id on public.payment_customers(user_id);
create index idx_payment_transactions_subscription_id on public.payment_transactions(subscription_id);
create index idx_payment_transactions_status on public.payment_transactions(status);
create index idx_webhook_events_provider_event on public.webhook_events(provider, event_id);
create index idx_webhook_events_processed on public.webhook_events(processed) where processed = false;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_customers enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.webhook_events enable row level security;

-- Plans: readable by all authenticated users (plan catalogue is public)
create policy plans_read_all on public.plans
  for select using (auth.uid() is not null);

-- Plan prices: readable by all authenticated users
create policy plan_prices_read_all on public.plan_prices
  for select using (auth.uid() is not null);

-- Subscriptions: users read their own subscription only
create policy subscriptions_own_read on public.subscriptions
  for select using (auth.uid() = user_id);

-- Payment customers: users read their own customer record only
create policy payment_customers_own_read on public.payment_customers
  for select using (auth.uid() = user_id);

-- Payment transactions: users read their own transactions only
create policy payment_transactions_own_read on public.payment_transactions
  for select using (
    exists (
      select 1 from public.subscriptions s
      where s.id = payment_transactions.subscription_id and s.user_id = auth.uid()
    )
  );

-- Webhook events: no client access (server-side only)
-- No policies created for webhook_events; service_role bypasses RLS

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

create trigger plan_prices_set_updated_at
  before update on public.plan_prices
  for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger payment_customers_set_updated_at
  before update on public.payment_customers
  for each row execute function public.set_updated_at();
