# Veyra Platform — Deployment Readiness

## Deployment Architecture

Veyra Platform is designed to be deployed as a standard Node.js API.

### Infrastructure Components

| Component | Provider | Purpose |
|-----------|----------|---------|
| API Host | Render (or equivalent) | Always-on Node.js application host |
| Database/Auth | Supabase | PostgreSQL + Auth |
| Distribution | Cloudflare R2 (or equivalent) | Installer and model distribution |
| Website | Vercel (or equivalent) | Next.js website |
| Desktop | User's computer | Electron application |

## Environment Variables by Deployment Target

### Render (API Host)
- `NODE_ENV=production`
- `PORT` (provided by Render)
- `API_BASE_URL=https://api.veyra.example.com`
- All Supabase variables
- All Paystack variables
- All OAuth variables
- All Email variables
- All Storage variables
- `UPDATE_SIGNING_KEY`

### Supabase Dashboard
- Project URL and keys
- OAuth provider configuration (Google, GitHub)
- Webhook URL: `https://api.veyra-platform.example.com/api/v1/payments/webhook`

### GitHub Actions Secrets
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `SUPABASE_ACCESS_TOKEN` (for CLI)

## Pre-Deployment Checklist

- [ ] Supabase project created and healthy
- [ ] Database migrations applied (`supabase/migrations`)
- [ ] Environment variables configured
- [ ] `.env` file created (not committed)
- [ ] `.env.example` committed with placeholders only
- [ ] No secrets in source code

## Deployment Steps

1. Create Supabase project
2. Apply database migrations (`supabase/migrations`)
3. Configure environment variables on API host
4. Deploy API to Render (or equivalent)
5. Configure website on Vercel (or equivalent)
6. Test all API endpoints
7. Monitor health checks

## Health Checks

- `GET /api/v1/health` - Liveness check
- `GET /api/v1/ready` - Readiness check
- `GET /api/v1/version` - Version information

## Monitoring

- Structured logging with request correlation IDs
- Audit events for administrative operations
- Credit ledger for usage tracking
- Webhook processing records

## Rollback

- Release assets include signed metadata for verification
- Releases can be revoked via admin API
- Previous release versions remain accessible

## Production Readiness Checklist

- [ ] TypeScript typecheck passes
- [ ] All unit tests pass
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Environment variables configured
- [ ] `.env` not committed
- [ ] `.env.example` has placeholders only
- [ ] No secrets in source code

## Notes

- Do not deploy or change production infrastructure without approval
- Do not enable live payments without explicit approval
- Rate limiting is in-memory (suitable for single-instance; use Redis for multi-instance)
