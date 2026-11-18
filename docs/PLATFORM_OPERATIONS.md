# Platform operations (verified snapshot)

Date: 2026-11-15.

## Local topology
- Website: `http://localhost:5173`
- Platform API: `http://localhost:3000`
- Health/readiness routes: `/api/v1/health`, `/api/v1/ready`
- Desktop renderer: `http://localhost:5174`

## Commands
From the Platform root, use the existing npm workspace scripts: `npm run typecheck`, `npm test`, `npm run build`, and `npm run dev`. Do not run destructive Supabase migrations against production as a startup check.

## Environment notes
The inspected local environment selects mock payment, email and storage providers. Google OAuth credential variables were present; GitHub credential variables were absent. Presence does not prove provider configuration or callback operation. Never print or commit credential values.

## Startup status
Typecheck and production build passed. The API started through the root `npm run dev` script on its intended loopback port 3000; `GET /api/v1/health` and `/api/v1/ready` both returned `ok`. The process was stopped after verification. Non-production defaults to loopback, production defaults to `0.0.0.0`, and `HOST` can explicitly override either. This check used local mock providers and does not verify Supabase, OAuth or payments.

## Operational follow-up
Confirm CORS origins against deployed Website origins, configure real payment/email/storage providers, run health/readiness on loopback, and verify graceful shutdown and background worker lifecycle.
