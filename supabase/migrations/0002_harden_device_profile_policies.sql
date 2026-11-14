-- Veyra Platform Phase 2b: Device and profile policy hardening
--
-- Incremental migration correcting over-permissive RLS policies introduced
-- in 0001_initial_schema.sql. This migration does NOT rewrite history; it
-- amends the policies on top of the existing schema.
--
-- Security model:
--   * RLS policies control ROW-LEVEL access (which rows a user can see/modify).
--   * FIELD-LEVEL restrictions (e.g. users cannot change status, email,
--     is_authorized, device_credential_hash) are enforced in application code
--     (Fastify route handlers), because PostgreSQL RLS cannot reference NEW/OLD
--     in policy clauses.
--   * Users cannot INSERT or DELETE devices or device_sessions (server-side only).
--   * Audit events are append-only (users can read, never write).
--
-- Problems fixed from 0001:
--   * devices_own_all allowed users to flip is_authorized and replace
--     device_credential_hash via RLS (privilege escalation).
--   * profiles_own_update allowed users to overwrite status and email via RLS.
--
-- Policies from 0001 that remain unchanged and correct:
--   * profiles_own_read   (select where auth.uid() = id)
--   * device_sessions_own_read (select via device ownership)
--   * audit_events_own_read (select where auth.uid() = user_id)

-- ---------------------------------------------------------------------------
-- profiles: replace permissive update policy from 0001
-- Application enforces: users may only update display_name and locale;
-- status and email are server-controlled.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_own_update on public.profiles;

create policy profiles_own_update on public.profiles
  for update using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- devices: replace all-powerful devices_own_all from 0001
-- Application enforces: users may only update device_name, platform,
-- last_seen_at. Authorization fields, credential hash, user_id,
-- installation_id are server-controlled and immutable from the client.
-- ---------------------------------------------------------------------------
drop policy if exists devices_own_all on public.devices;

-- Users may read their own devices only.
create policy devices_own_read on public.devices
  for select using (auth.uid() = user_id);

-- Users may update their own devices (field restrictions enforced in app code).
create policy devices_own_update on public.devices
  for update using (auth.uid() = user_id);

-- No INSERT policy for users: device registration is server-side only.
-- No DELETE policy for users: device revocation is server-side only.

-- ---------------------------------------------------------------------------
-- device_sessions / audit_events: no client-write policies exist;
-- server-side only. Drop any stray write policies if present.
-- ---------------------------------------------------------------------------
drop policy if exists device_sessions_own_write on public.device_sessions;
drop policy if exists audit_events_own_write on public.audit_events;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- service_role (server) retains full access via bypassrls.
-- Authenticated users get only the permissions granted by RLS policies above.
