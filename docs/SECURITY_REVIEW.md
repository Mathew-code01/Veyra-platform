# Platform security review (verified snapshot)

Date: 2026-11-15.

## Changes in this pass
- Password recovery no longer interpolates arbitrary `Origin` into Supabase redirect URLs. The origin is normalized and must exactly match a configured `ALLOWED_ORIGINS` entry. Missing, malformed or untrusted origins receive enumeration-safe success without sending a recovery email.
- Added pure helper regression tests for allowed, missing, malformed, lookalike and malformed-configuration origins (4 tests).

## Existing controls observed
- Fastify API uses Zod request schemas, Supabase user/admin clients, rate limit/security plugins and user-scoped handlers in inspected routes.
- Payment webhook code includes HMAC verification. Local configuration uses mock payment/email/storage providers; mock behavior is not production verification.

## Risks / not yet independently verified
- Full route ownership/RLS policy review and admin bootstrap review are incomplete.
- OAuth provider activation and JWT issuer/audience behavior have not been exercised against configured Supabase.
- Mock payment mode must not be deployed as production. Payment-history and usage services cap responses at 100 records.
- CORS headers and production error redaction have not been exercised in a production-like process. Local development health/readiness passed on loopback with mock providers.
- Secrets and Git history were not exhaustively scanned during this pass. No secret values are included in this document.

## Verification
Platform typecheck/build pass; API suite passes 18 files / 124 tests. This is not a penetration test or a complete security certification.