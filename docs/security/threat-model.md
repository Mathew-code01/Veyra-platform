# Threat Model

## Assets protected

- User identities and credentials (Supabase Auth).
- User account profiles, preferences, consent records.
- Device registrations and authorization state.
- Subscription and payment state (derived from verified provider events only).
- Credit balances and usage ledger.
- Entitlement grants and admin overrides.
- Release metadata and package integrity information.
- Audit logs.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Stolen client-supplied user ID used to access another user's data | Identity derived from verified Supabase JWT; ownership enforced server-side; RLS on tables |
| Service-role key leaked to browser/desktop/SDK | Service-role key only in trusted server code; never in client bundle or `.env.example` |
| Credentials stored in plain text on desktop | OS-backed secure storage; tokens never in localStorage/plain config |
| Client tampers with local device DB to authorize itself | Device authorization is server-issued; device cannot self-authorize by local DB modification |
| Fake subscription activation via client redirect | Subscription state from verified provider webhooks/trusted lookups only |
| Double spend / double settlement of credits | Transactional ledger, idempotency keys, atomic operations, locking |
| Silent paid fallback / hidden charges | No silent paid fallback; explicit consent; server-verified allowance before cloud execution |
| Replay of payment webhooks | Webhook signature verification + idempotent event persistence |
| Privileged admin action without audit | Server-side role verification; audit event on every sensitive admin op |
| Logging secrets | Structured logging excludes passwords, tokens, refresh tokens, payment secrets, private content |
| RLS disabled to "make a feature work" | RLS enabled on all user-owned tables; explicit policies; never disabled for convenience |
| BYOK keys uploaded to platform | BYOK keys never stored by platform; desktop BYOK remains local |
| Arbitrary update URL trusted by desktop | Signed update metadata; package hash verification; desktop verifies before applying |

## Out of scope

- Desktop local threat model (handled by desktop project).
- Website frontend XSS/CSRF (handled by website project).
- Physical access to the user's machine.
