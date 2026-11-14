# Supabase Setup

## When to run

Only when the user explicitly approves creating a Supabase project. Not part of Phase 1.

## Steps

1. Open https://supabase.com and sign in (or create an account).
2. Create a new project (choose region close to users).
3. Wait for project provisioning.
4. In the Supabase dashboard, go to Settings → API.
5. Copy the following values:

| Supabase dashboard value | .env variable | Usage |
|---|---|---|
| Project URL | `SUPABASE_URL` | Server client config |
| Project API Key (anon/public) | `SUPABASE_ANON_KEY` | Client-facing, safe to expose |
| service_role secret key | `SUPABASE_SERVICE_ROLE_KEY` | **Server-only; never in client bundle, SDK, `.env.example`** |

6. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`.
7. Set `SUPABASE_SERVICE_ROLE_KEY` in `.env` (server-only).
8. Apply migrations from `supabase/migrations` via Supabase CLI or dashboard SQL editor.
9. Enable RLS on user-owned tables; verify policies.

## Database connection

- Prefer the Supabase client (anon key) for user-scoped operations.
- Direct PostgreSQL connection string only if the architecture requires it (decided in Phase 1/2).
- `DATABASE_URL` is optional placeholder in `.env.example`.

## Do not

- Do not commit `.env`.
- Do not paste `SUPABASE_SERVICE_ROLE_KEY` into source code, SDK, or public chat.
- Do not apply production migrations without explicit approval.
