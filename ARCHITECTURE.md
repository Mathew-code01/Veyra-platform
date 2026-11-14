# Veyra Platform Architecture

## Status

This document describes the **planned implementation** of the Veyra Platform backend. It is a living document created during Phase 0 (discovery and architecture). Sections marked "scaffolded" describe intended behavior that is not yet implemented.

## 1. Purpose

Veyra Platform is the central remote backend for Veyra Desktop (Electron) and Veyra Website (Next.js). It owns:
- User identity (via Supabase Auth) and Veyra application accounts
- Desktop device registration and authorization
- Plan catalogue, subscriptions, and payment webhooks
- Entitlement evaluation
- Credit ledger and usage accounting
- Cloud AI gateway (Veyra-authorized cloud execution only)
- Model/module catalogue and authorized package distribution
- Desktop release metadata and update API
- Backup coordination, notifications, and protected administration

It is **not** the desktop's local server, SQLite database, AI engines, provider integrations, or interview runtime. Those remain inside the existing desktop project and are not moved here.

## 2. High-level architecture

```
Veyra Desktop (Electron)  <----HTTPS---->  Veyra Platform (Node/Fastify)
Veyra Website (Next.js)   <----HTTPS---->  Veyra Platform (Node/Fastify)
                                                      |
                                          Supabase PostgreSQL + Auth + Storage
                                                      |
                                          External infra: payments, email, R2
```

- **Modular monolith**: a single Node.js TypeScript application under `apps/api`.
- **Shared contracts**: Zod schemas under `packages/contracts`, consumed by `packages/sdk` (typed client) and the API.
- **Versioned REST**: all routes under `/api/v1`.
- **Transport**: HTTPS only. No public inbound connections to the desktop.

## 3. Module boundaries

| Module | Responsibility | Status |
|---|---|---|
| Health | liveness, readiness, dependency checks, version, request IDs | Phase 1 |
| Auth/accounts | Supabase Auth integration, profile, preferences, deletion, export | Phase 3 |
| Users/profiles | profile CRUD, status, locale, consent | Phase 3 |
| Devices | registration, listing, authorization, revocation, limits, offline snapshots | Phase 4 |
| Plans/pricing | configurable plan catalogue, feature entitlements | Phase 5 |
| Subscriptions | subscription lifecycle, upgrades/downgrades, cancellation, reconciliation | Phase 5 |
| Payments | provider abstraction, checkout, webhooks, idempotency (mock adapter) | Phase 5 |
| Entitlements | central capability evaluation, admin overrides with audit | Phase 4/6 |
| Credits/usage | transactional ledger, reservations, settlement, idempotency | Phase 6 |
| Cloud AI gateway | authorized cloud execution behind provider interfaces | Phase 7 |
| Provider/model catalogue | providers, models, capabilities, availability | Phase 7/8 |
| Module catalogue | module manifests, compatibility, signatures | Phase 8 |
| Downloads/storage | package download authorization, signed URLs, audit | Phase 8 |
| Releases/updater | release channels, signed metadata, compatibility | Phase 9 |
| Backups | opt-in backup metadata, consent, retention | Phase 10 |
| Email/notifications | provider abstraction, dev/test adapter | Phase 10 |
| Administration | protected admin ops, server-side roles, audit | Phase 10 |
| Audit/observability | structured logs, correlation IDs, audit events, rate limiting | Phase 1+ |

## 4. Technology choices (pending confirmation in Phase 1)

- Runtime: Node.js (v24 available)
- Language: TypeScript
- HTTP framework: Fastify (lightweight, production-grade, strong TypeScript support) — selected after confirming no project constraints against it
- Validation: Zod
- Database: Supabase PostgreSQL (managed)
- Auth: Supabase Auth
- Migrations: Supabase SQL migrations under `supabase/migrations`
- Storage: Supabase Storage only for explicitly permitted cases; Cloudflare R2 proposed for distribution (not required initially)
- Testing: Vitest (to be confirmed in Phase 1)
- Logging: Pino (structured, correlation IDs) — to be confirmed

## 5. Security boundaries (summary; full details in SECURITY.md and docs/security/)

- Supabase service-role key never exposed to browser, desktop renderer, or public SDK.
- Privileged DB operations in trusted server code only.
- RLS enabled on user-owned tables; explicit policies per table.
- Identity derived from verified session/token, never a client-supplied user ID.
- No secrets in source; `.env` never committed.
- No logging of passwords, tokens, refresh tokens, payment secrets, or full private interview content.
- Mock/test adapters for payments and email until explicitly configured and approved.

## 6. Data ownership principle

The platform does not store the user's entire CV, interview recordings, or private documents centrally by default. Backup is opt-in. The desktop's candidate interview profile remains local unless a future, explicitly authorized sync feature is introduced.

## 7. Deployment boundaries (proposed, not created)

- API host: Render or equivalent (always-on Node host)
- Website: Vercel or equivalent
- DB/Auth: Supabase
- Distribution: Cloudflare R2 or equivalent
- No infrastructure created, no domains purchased, no live payments enabled without explicit approval.
