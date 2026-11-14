# System Overview

## Scope

Veyra Platform is the central trusted backend for Veyra Desktop and Veyra Website. It is a modular monolith Node.js/TypeScript service backed by Supabase (PostgreSQL + Auth).

## Components

### Veyra Platform (`apps/api`)
- Fastify HTTP server, versioned REST under `/api/v1`.
- Owns business logic and application authorization.
- Does **not** own the desktop's local SQLite DB, AI engines, provider integrations, or interview runtime.

### Supabase
- PostgreSQL: central relational database (authoritative schema under `supabase/migrations`).
- Auth: user authentication, email verification, password recovery.
- Storage: optional, explicitly authorized use only.

### Clients
- Veyra Desktop (Electron): loopback local server, OS secure storage, PKCE sign-in, cloud execution only when permitted.
- Veyra Website (Next.js): browser-based auth, API calls via SDK.

### External infrastructure (proposed, not created)
- Payments: provider selected later (mock adapter initially).
- Email: provider selected later (dev/test adapter initially).
- Object storage: Cloudflare R2 proposed for distribution.

## Data flow principle

Client → HTTPS → Platform API → (validated) → Supabase PostgreSQL/Auth
Platform API → verified provider webhooks → subscription/credit state
Platform API → object storage → authorized package/download delivery

## What the platform does NOT do

- Does not replace the desktop local server.
- Does not store candidate interview profiles centrally by default.
- Does not upload user BYOK keys.
- Does not make live charges.
- Does not require public inbound connections to the desktop.
