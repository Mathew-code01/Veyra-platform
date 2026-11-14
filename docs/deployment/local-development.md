# Local Development

## Prerequisites

- Node.js v24 (installed)
- npm 12.2.0 or pnpm 12.10.1
- Supabase CLI (not yet installed; install when ready for Phase 2)

## Setup

1. Clone/open `C:\Users\MATTHEW\Desktop\veyra-platform`.
2. Copy `.env.example` to `.env` (never commit `.env`).
3. Fill in non-secret values (port, public API base URL, allowed origins). Leave secret placeholders empty until the relevant feature is ready.
4. Install dependencies (scripts/package.json to be created in Phase 1).
5. Run the dev server: `npm run dev`.
6. Health check: `GET http://localhost:<PORT>/api/v1/health`.

## Environment validation

- Required environment variables are validated at startup.
- Missing required variables produce clear, actionable errors and the server fails to start.
- No fake values that look like real secrets.

## Testing

- Unit and integration tests run against mock adapters (no live payment services, no paid AI credits).
- Tests must not contact live external services.

## Supabase (Phase 2)

- Local/mock testing approach first.
- A remote Supabase project is created only when the user explicitly approves; setup instructions in `docs/integrations/supabase-setup.md`.
- Migrations under `supabase/migrations` are the authoritative schema.

## Scripts

PowerShell helpers under `scripts/` are placeholders to be implemented in Phase 1:
- `dev.ps1` — start dev server
- `check-env.ps1` — validate environment
- `verify-structure.ps1` — verify project structure
