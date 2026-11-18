# Veyra Platform

> **Status correction:** The phase labels below are historical. The repository now contains registered Fastify modules, a contracts package, and a typed SDK, but tests and local builds do not verify production Supabase, OAuth, payment, email, storage, or release configuration. See the current source and the ecosystem baseline audit before treating any capability as production-ready.

Central backend for Veyra Desktop (Electron) and Veyra Website (Next.js). Node.js + TypeScript modular monolith backed by Supabase (PostgreSQL + Auth).

## Status

Phase 0 (discovery and architecture) complete. Phase 1 (backend foundation) in progress. See IMPLEMENTATION_PLAN.md.

## Repository layout

```
veyra-platform/
  apps/api/            # Fastify backend (Node/TypeScript)
  packages/contracts/  # Shared Zod-based API contracts
  packages/sdk/        # Typed client SDK (website + desktop)
  supabase/migrations/ # SQL migrations (authoritative schema)
  supabase/seed/       # Development fixtures (marked as dev data)
  docs/                # Architecture, security, deployment, integration docs
  scripts/             # PowerShell helpers
  infrastructure/      # Docker, deployment, monitoring scaffolding
  .env.example         # Configuration placeholders only (never committed secrets)
```

## Quick start (Phase 1 foundation)

1. Copy `.env.example` to `.env` and fill in non-secret values (port, API base URL). Never commit `.env`.
2. Install dependencies: `npm install` (or `pnpm install`) from the repo root and from `apps/api`.
3. Run the dev server: `npm run dev` (see `apps/api/package.json` scripts once created).
4. Health check: `GET http://localhost:PORT/api/v1/health`.

## Technology (selected in Phase 1)

- Node.js v24, TypeScript
- Fastify HTTP framework
- Zod runtime validation
- Pino structured logging (planned)
- Vitest unit/integration tests (planned)
- Supabase PostgreSQL + Auth (migrations under `supabase/migrations`)

## Constraints

- No secrets in source; `.env` never committed.
- Supabase service-role key never exposed to browser, desktop renderer, or public SDK.
- Payments and email use mock/test adapters until explicitly configured and approved.
- The existing Veyra desktop server, SQLite DB, AI engines, and interview runtime remain untouched in the desktop project.
- No live payments, no production credentials, no deployed infrastructure without explicit approval.

## Documentation

- `ARCHITECTURE.md` — system architecture
- `IMPLEMENTATION_PLAN.md` — phased implementation plan
- `SECURITY.md` — security requirements and boundaries
- `docs/architecture/` — system overview, data flow, desktop/website integration
- `docs/security/` — threat model, data protection
- `docs/deployment/local-development.md` — local dev setup
- `docs/integrations/supabase-setup.md` — Supabase project setup instructions

## Contributing

See CONTRIBUTING.md (placeholder). Work on feature branches; do not merge into main without approval.

## License

Placeholder.
