-- Veyra Platform Phase 10: Backups, Notifications, and Administration schema
--
-- Tables:
--   user_consent_records   - User consent for backup, cloud execution, etc.
--   backup_metadata        - Opt-in backup metadata (not the actual data)
--   admin_roles            - Server-side admin roles
--   admin_audit_events     - Audit trail for admin operations
--
-- Design principles:
--   * Backups are opt-in with explicit user consent
--   * Admin access based on verified server-side roles only
--   * All sensitive admin operations create audit events
--   * No public admin endpoint
--   * No automatic upload of candidate documents, CVs, recordings
--
-- No production backup or admin records are seeded here.

-- ---------------------------------------------------------------------------
-- user_consent_records: User consent for various categories
-- ---------------------------------------------------------------------------
create table public.user_consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_category text not null check (consent_category in (
    'cloud_backup', 'cloud_execution', 'analytics', 'marketing', 'device_notifications'
  )),
  consent_given boolean not null default false,
  consent_timestamp timestamptz not null default now(),
  consent_withdrawn boolean not null default false,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, consent_category)
);

-- ---------------------------------------------------------------------------
-- backup_metadata: Opt-in backup coordination metadata
-- ---------------------------------------------------------------------------
create table public.backup_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  backup_category text not null check (backup_category in (
    'account_data', 'device_settings', 'cloud_execution_logs', 'module_configs'
  )),
  encryption_enabled boolean not null default false,
  encryption_key_id text, -- Reference to encryption key (not the key itself)
  retention_days integer not null default 30,
  status text not null check (status in ('pending', 'active', 'paused', 'deleted')),
  last_backup_at timestamptz,
  next_backup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, backup_category)
);

-- ---------------------------------------------------------------------------
-- admin_roles: Server-side admin role assignments
-- ---------------------------------------------------------------------------
create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in (
    'admin', 'support', 'auditor', 'billing'
  )),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------------------------------------------------------------------------
-- admin_audit_events: Audit trail for administrative operations
-- ---------------------------------------------------------------------------
create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_user_consent_records_user_id on public.user_consent_records(user_id);
create index idx_user_consent_records_category on public.user_consent_records(consent_category);
create index idx_backup_metadata_user_id on public.backup_metadata(user_id);
create index idx_backup_metadata_status on public.backup_metadata(status);
create index idx_admin_roles_user_id on public.admin_roles(user_id);
create index idx_admin_roles_role on public.admin_roles(role);
create index idx_admin_roles_active on public.admin_roles(is_active) where is_active = true;
create index idx_admin_audit_events_admin_user_id on public.admin_audit_events(admin_user_id);
create index idx_admin_audit_events_target_user_id on public.admin_audit_events(target_user_id);
create index idx_admin_audit_events_created_at on public.admin_audit_events(created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.user_consent_records enable row level security;
alter table public.backup_metadata enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_audit_events enable row level security;

-- User consent records: users read/update their own only
create policy user_consent_records_own_all on public.user_consent_records
  for all using (auth.uid() = user_id);

-- Backup metadata: users read/update their own only
create policy backup_metadata_own_all on public.backup_metadata
  for all using (auth.uid() = user_id);

-- Admin roles: readable by all authenticated users (for UI), writable server-side only
create policy admin_roles_read_all on public.admin_roles
  for select using (auth.uid() is not null);

-- Admin audit events: readable by auditors/admins server-side only
-- No client read policy; server-side enforcement

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger user_consent_records_set_updated_at
  before update on public.user_consent_records
  for each row execute function public.set_updated_at();

create trigger backup_metadata_set_updated_at
  before update on public.backup_metadata
  for each row execute function public.set_updated_at();
