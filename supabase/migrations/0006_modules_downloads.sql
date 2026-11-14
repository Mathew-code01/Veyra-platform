-- Veyra Platform Phase 8: Models, Modules and Downloads schema
--
-- Tables:
--   module_catalogue       - Desktop module catalogue entries
--   module_versions        - Module version manifests with compatibility metadata
--   download_authorization - Authorized package download records
--   download_audit         - Download audit events
--
-- Design principles:
--   * Desktop performs hardware suitability decisions; platform supplies
--     trusted metadata and authorized download information
--   * No large installers or model files in PostgreSQL or API filesystem
--   * Signed/short-lived download authorization only
--   * No private storage credentials exposed
--
-- No production module or download records are seeded here.

-- ---------------------------------------------------------------------------
-- module_catalogue: Desktop module catalogue entries
-- ---------------------------------------------------------------------------
create table public.module_catalogue (
  id uuid primary key default gen_random_uuid(),
  module_id text not null unique,
  name text not null,
  description text,
  category text not null check (category in (
    'speech-to-text', 'text-to-speech', 'local-llm', 'vision', 'embeddings',
    'document-processing', 'other'
  )),
  is_active boolean not null default true,
  is_deprecated boolean not null default false,
  deprecation_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- module_versions: Module version manifests with compatibility metadata
-- ---------------------------------------------------------------------------
create table public.module_versions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.module_catalogue(id) on delete cascade,
  version text not null,
  supported_os text[] not null default '{}',
  cpu_requirements text,
  memory_requirements_mb integer,
  gpu_requirements text,
  vram_requirements_mb integer,
  runtime_requirements text,
  capability_declarations jsonb not null default '{}'::jsonb,
  package_size_bytes bigint,
  package_location text, -- Object storage reference (not credentials)
  package_hash_sha256 text, -- Cryptographic hash for integrity verification
  package_signature text, -- Signature or signed manifest reference
  compatibility_constraints jsonb not null default '{}'::jsonb,
  release_status text not null check (release_status in ('alpha', 'beta', 'stable', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, version)
);

-- ---------------------------------------------------------------------------
-- download_authorization: Authorized package download records
-- ---------------------------------------------------------------------------
create table public.download_authorization (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_version_id uuid not null references public.module_versions(id) on delete cascade,
  authorization_token text not null unique,
  expires_at timestamptz not null,
  is_used boolean not null default false,
  used_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- download_audit: Download audit events
-- ---------------------------------------------------------------------------
create table public.download_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  module_version_id uuid references public.module_versions(id) on delete set null,
  authorization_token text,
  ip_address text,
  user_agent text,
  downloaded_at timestamptz not null default now(),
  bytes_downloaded bigint,
  success boolean not null default true,
  error_message text
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_module_catalogue_module_id on public.module_catalogue(module_id);
create index idx_module_catalogue_category on public.module_catalogue(category);
create index idx_module_catalogue_active on public.module_catalogue(is_active) where is_active = true;
create index idx_module_versions_module_id on public.module_versions(module_id);
create index idx_module_versions_release_status on public.module_versions(release_status);
create index idx_download_authorization_user_id on public.download_authorization(user_id);
create index idx_download_authorization_token on public.download_authorization(authorization_token);
create index idx_download_authorization_expires on public.download_authorization(expires_at);
create index idx_download_audit_user_id on public.download_audit(user_id);
create index idx_download_audit_downloaded_at on public.download_audit(downloaded_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.module_catalogue enable row level security;
alter table public.module_versions enable row level security;
alter table public.download_authorization enable row level security;
alter table public.download_audit enable row level security;

-- Module catalogue: readable by all authenticated users
create policy module_catalogue_read_all on public.module_catalogue
  for select using (auth.uid() is not null);

-- Module versions: readable by all authenticated users
create policy module_versions_read_all on public.module_versions
  for select using (auth.uid() is not null);

-- Download authorization: users read their own authorizations only
create policy download_authorization_own_read on public.download_authorization
  for select using (auth.uid() = user_id);

-- Download audit: users read their own audit records only
create policy download_audit_own_read on public.download_audit
  for select using (auth.uid() = user_id);

-- No client write policies for download tables -- all mutations are server-side only

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger module_catalogue_set_updated_at
  before update on public.module_catalogue
  for each row execute function public.set_updated_at();

create trigger module_versions_set_updated_at
  before update on public.module_versions
  for each row execute function public.set_updated_at();
