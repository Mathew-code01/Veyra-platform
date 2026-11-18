-- Short-lived, one-time browser handoffs for the VEYRA Desktop client.
-- No bearer tokens are stored here: the Website encrypts its session envelope
-- to the Desktop-generated X25519 public key before authorization.
create table if not exists public.desktop_auth_transactions (
  id uuid primary key default gen_random_uuid(),
  device_public_key text not null,
  poll_secret_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'consumed', 'cancelled')),
  user_id uuid references public.profiles(id) on delete cascade,
  session_envelope jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  consumed_at timestamptz,
  constraint desktop_auth_transaction_state_check check (
    (status = 'pending' and user_id is null and session_envelope is null and authorized_at is null and consumed_at is null)
    or (status = 'authorized' and user_id is not null and session_envelope is not null and authorized_at is not null and consumed_at is null)
    or (status = 'consumed' and user_id is not null and session_envelope is not null and authorized_at is not null and consumed_at is not null)
    or status = 'cancelled'
  )
);

create index if not exists desktop_auth_transactions_expiry_idx
  on public.desktop_auth_transactions (expires_at) where status in ('pending', 'authorized');

alter table public.desktop_auth_transactions enable row level security;
-- Intentionally no client policies. Only trusted Platform service-role code
-- may inspect, authorize, consume, or clean up transaction records.
