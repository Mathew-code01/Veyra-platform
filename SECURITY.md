# Veyra Platform Security

## Status

Security requirements document. Implementation occurs across all phases. Mock/test adapters are used until explicitly configured and approved.

## Core principles

1. **Never expose the Supabase service-role key** to a browser, website client bundle, desktop renderer, or public SDK. The service-role key lives only in trusted server code.
2. **Never commit `.env` files or credentials.** `.env.example` contains placeholders only.
3. **Privileged database operations run in trusted server code only.**
4. **Row Level Security (RLS)** is enabled on every user-exposed table; explicit policies are defined per table.
5. **Authentication is not authorization.** Identity and permissions are verified on every protected API operation.
6. **Never trust a client-supplied user ID as proof of ownership.** Authenticated identity is derived from a verified session/token (Supabase JWT).
7. **No silent paid fallback, no hidden charges, no client-controlled balance updates.**
8. **Never log** passwords, access tokens, refresh tokens, payment secrets, or full private interview content.
9. **Never disable RLS** merely to make a feature work.

## Authentication model

- Identity: Supabase Auth (email/password, email verification, password recovery/reset).
- Session validation: verify Supabase JWT on protected routes.
- Desktop sign-in: Authorization Code with PKCE (no client secret embedded in desktop) or a secured device authorization flow.
- Desktop credential storage: OS-backed secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service), never localStorage or plain-text config.
- Website sign-in: browser-based Supabase Auth flow via the website's own client (SDK used only for API calls after auth).

## Authorization model

- Veyra-specific application services own: account status, device limits, entitlements, commercial access.
- Admin access: verified server-side roles only; never a client-supplied `isAdmin` field.
- Every sensitive administrative operation creates an audit event.

## Data protection

- Do not centrally store the user's entire CV, interview recordings, or private documents by default.
- Backup is opt-in with explicit user consent, user-controlled retention, and encryption before upload where appropriate.
- Encryption at rest is provided by Supabase/PostgreSQL; application-layer encryption considered for sensitive backup metadata.

## Secrets management

- Configuration via environment variables; validated at startup with clear, actionable errors.
- No fake values that look like real secrets.
- Production secrets obtained only through the user's own cloud/Supabase/provider dashboards, never pasted into source or chat.

## Provider and payment security

- Payment provider test credentials used only; no live payment mode activated.
- Webhook signatures verified; idempotency enforced; duplicate events protected.
- No real charges created without explicit approval.

## Security boundaries by phase

- Phase 1: config validation, structured logging (no secrets), safe error responses, security headers, CORS with allowed origins.
- Phase 2: RLS policies, migration review, no service-secret exposure.
- Phase 3+: auth boundaries, ownership checks, device authorization, entitlement enforcement, admin role verification, audit logging.
