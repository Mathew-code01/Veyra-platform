# Veyra Platform — Implementation Plan

## Status

Phase 0 complete. This plan reflects the intended incremental implementation. It is updated as work progresses; completed phases are marked.

## Phases

| Phase | Focus | Acceptance | Status |
|---|---|---|---|
| 0 | Discovery and architecture docs | Documents written, project inspected, tool versions checked | Complete |
| 1 | Backend foundation: TS project, Fastify, config validation, health, logging, errors, tests | Server starts locally; health works; invalid config fails clearly; tests run; no paid service | Complete |
| 2 | Supabase foundation: config, migration strategy, initial schema, RLS, local/mock testing | Migrations valid; DB access scoped; no service secret exposed; setup docs complete | Complete |
| 3 | Identity and accounts: Supabase Auth, account APIs, verification/recovery | Test-mode flows work; protected endpoints reject unauthenticated; ownership tested | Complete |
| 4 | Devices and entitlements: device registration/revocation, session validation, offline snapshots | Unauthorized devices rejected; revoked devices lose access; snapshots signed + expiring | Complete |
| 5 | Plans, subscriptions, payments: plan catalogue, subscription state machine, provider abstraction, webhooks (mock) | No live payment; duplicate webhooks idempotent; state not client-changeable | Complete |
| 6 | Credits and usage ledger: transactional ledger, reservations, settlement, release | No double spend; concurrency-safe; failed ops release reservations | Complete |
| 7 | Cloud AI gateway: authorized cloud execution behind provider interfaces | Unauthorized requests rejected; no silent paid fallback; usage recorded; no BYOK storage | Complete |
| 8 | Models, modules and downloads: catalogue, manifests, compatibility, authorized distribution | Invalid manifests rejected; hash metadata present; no automatic large downloads | Pending |
| 9 | Desktop release and updater API: channels, compatibility, signed metadata | Latest compatible queryable; integrity metadata present; no arbitrary URL trusted | Pending |
| 10 | Backups, notifications, administration: opt-in backup metadata, email adapters, protected admin | Backups opt-in; admin verified server-side; sensitive actions audited | Pending |
| 11 | Integration readiness: SDK, API docs, integration tests, deployment guide, contracts | Website/desktop contracts documented; schemas versioned; deployment prereqs known | Pending |

## Ground rules

- Work incrementally. No giant uncontrolled change.
- Keep the project buildable and tested at every stage.
- Mock adapters for payments/email until explicitly configured and approved.
- No live payments, no production credentials, no secrets in source.
- Do not modify the existing Veyra desktop or website repositories.

## Manual configuration boundaries

Stop and request explicit user input before:
- Creating a Supabase project (user decides when)
- Selecting and configuring a payment provider (document options first)
- Selecting and configuring an email provider
- Configuring object storage (R2)
- Enabling any live/production mode
