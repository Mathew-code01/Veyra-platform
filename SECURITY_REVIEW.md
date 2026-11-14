# Veyra Platform — Security Review

## Authentication Security

- Supabase Auth is used as the identity provider
- Passwords are never stored by Veyra Platform (handled by Supabase)
- OAuth uses PKCE and state parameter for CSRF protection
- JWT tokens are used for session management
- Refresh tokens are used for session renewal

## Authorization Security

- Row Level Security (RLS) enabled on all user-owned tables
- Identity derived from verified Supabase JWT (not client-supplied)
- Field-level restrictions enforced in application code
- Device authorization is server-issued (cannot be self-authorized)
- Admin access based on verified server-side roles

## Secrets Management

- Supabase service-role key is server-only
- Payment provider secret keys are server-only
- OAuth client secrets are server-only
- Secrets are never logged or exposed in error responses
- Structured logging with secret redaction

## API Security

- CORS restricted to allowed origins
- Rate limiting (100 requests/minute/IP globally)
- Authentication middleware on protected routes
- Admin role-based access control
- Request ID correlation for tracing
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

## Webhook Security

- Payment webhook signatures verified using HMAC SHA-256
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
- Supabase client caching may not reflect real-time database changes
- No IP-based rate limiting
