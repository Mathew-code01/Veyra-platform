-- Veyra Platform Phase 9: Desktop Release and Updater API schema
--
-- Tables:
--   update_channels   - Release channels (stable, beta)
--   desktop_releases  - Release metadata with compatibility rules
--   release_assets    - Installer package assets in object storage
--
-- Design principles:
--   * Platform provides metadata and authorization; installer packages
--     live in object storage (not in PostgreSQL or API filesystem)
--   * Signed update metadata; desktop verifies package before applying
--   * Desktop must not interrupt active interview
--   * No plain version string or arbitrary URL trust
--   * Existing desktop updater remains untouched
--
-- No production release records are seeded here.

-- ---------------------------------------------------------------------------
-- update_channels: Release channels (stable, beta, etc.)
-- ---------------------------------------------------------------------------
create table public.update_channels (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- desktop_releases: Release metadata with compatibility rules
-- ---------------------------------------------------------------------------
create table public.desktop_releases (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.update_channels(id) on delete cascade,
  version text not null,
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  architecture text not null check (architecture in ('x64', 'arm64')),
  min_supported_version text,
  is_mandatory boolean not null default false,
  rollout_percentage integer not null default 100 check (rollout_percentage >= 0 and rollout_percentage <= 100),
  release_notes text,
  is_rollback_compatible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, platform, architecture, version)
);

-- ---------------------------------------------------------------------------
-- release_assets: Installer package assets in object storage
-- ---------------------------------------------------------------------------
create table public.release_assets (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.desktop_releases(id) on delete cascade,
  asset_id text not null unique,
  asset_type text not null check (asset_type in ('installer', 'checksum', 'signature')),
  package_url text not null, -- Authorized download reference (object storage)
  package_hash_sha256 text not null, -- Cryptographic hash for integrity
  package_size_bytes bigint,
  signed_metadata text, -- Signed update metadata (JWS or similar)
  signature text, -- Cryptographic signature of metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_update_channels_channel_id on public.update_channels(channel_id);
create index idx_desktop_releases_channel on public.desktop_releases(channel_id);
create index idx_desktop_releases_platform_arch on public.desktop_releases(platform, architecture);
create index idx_desktop_releases_version on public.desktop_releases(version);
create index idx_desktop_releases_mandatory on public.desktop_releases(is_mandatory) where is_mandatory = true;
create index idx_release_assets_release_id on public.release_assets(release_id);
create index idx_release_assets_asset_id on public.release_assets(asset_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.update_channels enable row level security;
alter table public.desktop_releases enable row level security;
alter table public.release_assets enable row level security;

-- Release channels: readable by all authenticated users
create policy update_channels_read_all on public.update_channels
  for select using (auth.uid() is not null);

-- Desktop releases: readable by all authenticated users
create policy desktop_releases_read_all on public.desktop_releases
  for select using (auth.uid() is not null);

-- Release assets: readable by all authenticated users (metadata only, no credentials)
create policy release_assets_read_all on public.release_assets
  for select using (auth.uid() is not null);

-- No client write policies -- all mutations are server-side only

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger update_channels_set_updated_at
  before update on public.update_channels
  for each row execute function public.set_updated_at();

create trigger desktop_releases_set_updated_at
  before update on public.desktop_releases
  for each row execute function public.set_updated_at();

create trigger release_assets_set_updated_at
  before update on public.release_assets
  for each row execute function public.set_updated_at();
