-- Correlate a provider checkout to the exact account and published regional
-- offer. Subscription state is created only after a verified provider event.
create table if not exists public.subscription_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (length(currency) = 3),
  provider text not null,
  provider_reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  paid_at timestamptz
);

create index if not exists idx_checkout_intents_user on public.subscription_checkout_intents(user_id, created_at desc);
create index if not exists idx_checkout_intents_pending on public.subscription_checkout_intents(provider_reference) where status = 'pending';
alter table public.subscription_checkout_intents enable row level security;

drop policy if exists checkout_intents_owner_read on public.subscription_checkout_intents;
create policy checkout_intents_owner_read on public.subscription_checkout_intents
  for select using (user_id = auth.uid());
