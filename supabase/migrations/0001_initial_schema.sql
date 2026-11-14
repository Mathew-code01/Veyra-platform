-- Veyra Platform initial schema (Phase 2: Supabase foundation)
--
-- This is the authoritative initial migration. It is a file only; it is NOT
-- applied to any remote database without explicit user approval.
--
-- Core foundation tables:
--   profiles          - Veyra application account metadata linked to auth.users
--   devices           - Desktop device registration (server-issued credentials)
--   device_sessions   - Device authorization / session records
--   audit_events      - Immutable audit trail
--
-- All tables use UUID primary keys, foreign keys, unique constraints, indexes,
-- timestamps, ownership, and Row Level Security (RLS) with explicit policies.
--
-- No production users, payment records, or secrets are seeded here.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: Veyra application account metadata (one per Supabase Auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  locale text not null default 'en',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted', 'pending_verification')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- devices: desktop device registration
--
-- Ownership: a device belongs to exactly one profile. A device cannot
-- authorize itself merely by modifying a local database -- authorization
-- is server-issued (device_credential_hash) and enforced by RLS.
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  device_name text,
  platform text check (platform in ('windows', 'macos', 'linux')),
  device_credential_hash text not null,
  is_authorized boolean not null default false,
  is_revoked boolean not null default false,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

-- ---------------------------------------------------------------------------
-- device_sessions: device authorization / session records
--
-- Tokens are stored as hashes only (never plaintext). Sessions are bound to
-- a device and expire; revocation is server-controlled.
-- ---------------------------------------------------------------------------
create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  is_revoked boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_events: immutable audit trail
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_profiles_status on public.profiles(status);
create index idx_profiles_email on public.profiles(email);
create index idx_devices_user_id on public.devices(user_id);
create index idx_devices_installation_id on public.devices(installation_id);
create index idx_devices_authorized on public.devices(is_authorized) where is_authorized = true;
create index idx_device_sessions_device_id on public.device_sessions(device_id);
create index idx_device_sessions_expires_at on public.device_sessions(expires_at);
create index idx_audit_events_user_id on public.audit_events(user_id);
create index idx_audit_events_created_at on public.audit_events(created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- RLS is enabled on every user-exposed table. Policies derive identity from
-- auth.uid() (the verified Supabase JWT subject), never from a client-supplied
-- user id. Authentication alone is not authorization; each policy checks
-- explicit ownership.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.device_sessions enable row level security;
alter table public.audit_events enable row level security;

-- Profiles: users read/update their own profile only.
create policy profiles_own_read on public.profiles
  for select using (auth.uid() = id);

create policy profiles_own_update on public.profiles
  for update using (auth.uid() = id);

-- Devices: users manage their own devices only.
create policy devices_own_all on public.devices
  for all using (auth.uid() = user_id);

-- Device sessions: users read their own sessions (via device ownership).
create policy device_sessions_own_read on public.device_sessions
  for select using (
    exists (
      select 1 from public.devices d
      where d.id = device_sessions.device_id and d.user_id = auth.uid()
    )
  );

-- Audit events: users read their own audit events only.
create policy audit_events_own_read on public.audit_events
  for select using (auth.uid() = user_id);

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

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();
