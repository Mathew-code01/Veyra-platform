-- Veyra Platform Phase 11: Desktop release revocation support
--
-- Adds is_revoked column to desktop_releases table.
-- Revoked releases are excluded from update checks.
--
-- Do not modify 0007_desktop_releases.sql - it has already been applied.

-- Add is_revoked column to desktop_releases
alter table public.desktop_releases
  add column is_revoked boolean not null default false;

-- Add index for revoked releases
create index idx_desktop_releases_revoked on public.desktop_releases(is_revoked) where is_revoked = true;
