-- Veyra Platform Phase 6: Credits and Usage Ledger schema
--
-- Tables:
--   credit_accounts          - Per-user credit balance (mutable current state)
--   credit_ledger_transactions - Immutable transaction log (append-only)
--   usage_reservations       - Pending credit reservations (locking mechanism)
--   usage_records            - Settled usage records
--
-- Design principles:
--   * Durable ledger, not just a mutable balance
--   * All mutations go through transactions with row-level locking
--   * Idempotency keys prevent double spending
--   * Reservations can be released after failed requests
--   * Every transaction is auditable
--
-- No production credit records are seeded here.

-- ---------------------------------------------------------------------------
-- credit_accounts: per-user credit balance
-- ---------------------------------------------------------------------------
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  currency text not null default 'USD' check (length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- credit_ledger_transactions: immutable transaction log
-- ---------------------------------------------------------------------------
create table public.credit_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  type text not null check (type in (
    'grant',            -- credit added to account
    'allowance',        -- plan allowance credited
    'promotional',      -- promo credit added
    'reservation',      -- credit reserved for pending usage
    'settlement',       -- reserved credit settled (charged)
    'release',          -- reservation released (refunded to available)
    'adjustment',       -- manual adjustment (audit required)
    'expiration',       -- credit expired
  )),
  amount_cents bigint not null, -- positive for credit added, negative for deducted
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  idempotency_key text, -- client-provided idempotency key
  reference_type text,  -- e.g. 'subscription', 'usage', 'adjustment'
  reference_id text,    -- reference ID for the related entity
  description text,
  created_at timestamptz not null default now(),
  unique (idempotency_key) where idempotency_key is not null
);

-- ---------------------------------------------------------------------------
-- usage_reservations: pending credit reservations (optimistic locking)
-- ---------------------------------------------------------------------------
create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null check (status in ('pending', 'settled', 'released', 'expired')),
  expires_at timestamptz not null,
  idempotency_key text not null,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  released_at timestamptz,
  unique (idempotency_key)
);

-- ---------------------------------------------------------------------------
-- usage_records: settled usage records
-- ---------------------------------------------------------------------------
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credit_account_id uuid not null references public.credit_accounts(id) on delete cascade,
  reservation_id uuid references public.usage_reservations(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (length(currency) = 3),
  service text not null, -- e.g. 'cloud_inference', 'document_analysis'
  model_id text,         -- model used, if applicable
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_credit_accounts_user_id on public.credit_accounts(user_id);
create index idx_credit_ledger_transactions_user_id on public.credit_ledger_transactions(user_id);
create index idx_credit_ledger_transactions_idempotency on public.credit_ledger_transactions(idempotency_key);
create index idx_credit_ledger_transactions_created_at on public.credit_ledger_transactions(created_at);
create index idx_usage_reservations_user_id on public.usage_reservations(user_id);
create index idx_usage_reservations_status on public.usage_reservations(status);
create index idx_usage_reservations_idempotency on public.usage_reservations(idempotency_key);
create index idx_usage_reservations_expires_at on public.usage_reservations(expires_at);
create index idx_usage_records_user_id on public.usage_records(user_id);
create index idx_usage_records_created_at on public.usage_records(created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger_transactions enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.usage_records enable row level security;

-- Credit accounts: users read their own account only
create policy credit_accounts_own_read on public.credit_accounts
  for select using (auth.uid() = user_id);

-- Credit ledger: users read their own transactions only
create policy credit_ledger_own_read on public.credit_ledger_transactions
  for select using (auth.uid() = user_id);

-- Usage reservations: users read their own reservations only
create policy usage_reservations_own_read on public.usage_reservations
  for select using (auth.uid() = user_id);

-- Usage records: users read their own records only
create policy usage_records_own_read on public.usage_records
  for select using (auth.uid() = user_id);

-- No client write policies for credit tables -- all mutations are server-side only

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger credit_accounts_set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();
