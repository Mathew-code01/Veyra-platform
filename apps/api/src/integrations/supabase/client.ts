import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../../config/env.js';

/**
 * Scoped Supabase client factory.
 *
 * Two client tiers are provided:
 *
 * 1. Server admin client (service_role key) -- trusted server code ONLY.
 *    Never exposed to browser, website client bundle, desktop renderer, or SDK.
 *    Used for privileged operations (admin, webhooks, migrations) where
 *    application authorization is enforced in service code.
 *
 * 2. User-scoped client (anon key + user's Supabase JWT) -- for user-scoped
 *   database operations. RLS policies apply; identity derived from the verified
 *   JWT subject (auth.uid()), never from a client-supplied user id.
 *
 * The service_role secret is never returned to callers and never logged.
 */

let adminClient: SupabaseClient | null = null;

/**
 * Get the server admin Supabase client (service_role).
 *
 * Call only from trusted server-side code. Requires SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY to be set; throws a clear error otherwise.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      '[veyra-platform] Supabase admin client requires SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY. Set these in .env (server-only) before ' +
        'using privileged database operations. Never commit .env.',
    );
  }

  adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

let userClients = new Map<string, SupabaseClient>();

/**
 * Get a user-scoped Supabase client (anon key) bound to a user's JWT.
 *
 * The JWT is passed per-call (not stored long-term), so the client is scoped
 * to the authenticated user's session. RLS enforces ownership. Requires
 * SUPABASE_URL and SUPABASE_ANON_KEY.
 */
export function getSupabaseUser(accessToken: string): SupabaseClient {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      '[veyra-platform] Supabase user client requires SUPABASE_URL and ' +
        'SUPABASE_ANON_KEY. Set these in .env before making user-scoped ' +
        'database operations.',
    );
  }

  const cached = userClients.get(accessToken);
  if (cached) return cached;

  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  userClients.set(accessToken, client);
  return client;
}

/**
 * Clear cached user clients (test helper / logout).
 */
export function clearUserClients(): void {
  userClients.clear();
}

/**
 * Reset all cached clients (test helper).
 */
export function resetSupabaseClients(): void {
  adminClient = null;
  userClients.clear();
}
