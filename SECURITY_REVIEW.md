# Veyra Platform — Security Review

## Authentication Security

- Supabase Auth is used as the identity provider
- Passwords are never stored by Veyra Platform (handled by Supabase)
- OAuth uses PKCE and state parameter for CSRF protection
- JWT tokens are used for session management
- Refresh tokens are used for session renewal
- Identity derived from verified Supabase JWT (not client-supplied user ID)

## Authorization Security

- Row Level Security (RLS) enabled on all user-owned tables
- Identity derived from verified Supabase JWT
- Field-level restrictions enforced in application code
- Device authorization is server-issued (cannot be self-authorized)
- Admin access based on verified server-side roles (not client-supplied)
- Revoked administrator loses access immediately

## Secrets Management

- Supabase service-role key is server-only
- Payment provider secret keys are server-only
- OAuth client secrets are server-only
- Secrets are never logged or exposed in error responses
- Structured logging with secret redaction (tokens, passwords, secrets)

## API Security

- CORS restricted to allowed origins
- Rate limiting (100 requests/minute/IP globally)
- Authentication middleware on protected routes
- Admin role-based access control
- Request ID correlation for tracing
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

## Webhook Security

- Payment webhook signatures verified using HMAC SHA-512
- Constant-time signature comparison
- Webhook events persisted for idempotency
- Duplicate event protection

## Credit Security

- Credit ledger is immutable (append-only)
- Idempotency keys prevent double spending
- Database transactions with appropriate locking
- Reservations released after failed requests

## AI Security

- BYOK keys are never stored by the platform
- Cloud AI requests verified for entitlement, consent, and credits
- Provider timeouts and failures handled gracefully
- Usage measured and recorded for audit

## Known Limitations

- Rate limiting is in-memory (not distributed across multiple API instances)
- Rate limiting suitable for single-instance deployment; use Redis for multi-instance

## Security Review Status

| Area | Status |
|------|--------|
| Authentication | Implemented |
| Authorization | Implemented |
| OAuth state and PKCE | Implemented |
| Session refresh and revocation | Implemented |
| Supabase service-role usage | Server-only |
| RLS | Enabled on all tables |
| Account linking | Server-verified |
| Device credentials | Server-issued hashes |
| Payment verification | HMAC SHA-512 |
| Webhook signatures | HMAC SHA-512 |
| Idempotency | Implemented |
| Credit ledger | Immutable |
| Concurrency | Database transactions |
| Rate limits | IP-based (single-instance) |
| Request validation | Zod schemas |
| Error reporting | No secrets leaked |
