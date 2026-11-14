# Data Flow

## Request flow (authenticated API call)

1. Client sends HTTPS request to `GET|POST /api/v1/...` with `Authorization: Bearer <supabase_jwt>` and `X-Request-Id`.
2. Fastify middleware:
   - Assigns/propagates correlation ID (`X-Request-Id`).
   - Validates request shape via Zod contracts from `packages/contracts`.
   - Verifies Supabase JWT; extracts authenticated `user_id`.
3. Route handler calls Veyra service layer (e.g., entitlements, credits, devices).
4. Service enforces ownership: identity from token, not client-supplied ID.
5. Service reads/writes Supabase PostgreSQL through scoped client (anon key for user-scoped ops; service-role only in trusted server code where required).
6. Structured log emitted with correlation ID; no secrets logged.
7. JSON response with standardized error shape on failure.

## Authentication flow (website)

1. Website renders Supabase Auth UI / custom sign-in.
2. User signs in; Supabase sets session cookie / returns JWT.
3. Website includes JWT in `Authorization` header to platform API calls.

## Authentication flow (desktop)

1. Desktop opens browser to platform authorization endpoint (Authorization Code + PKCE).
2. User authenticates with Supabase Auth in browser.
3. Authorization code exchanged (by desktop, via platform token endpoint) for tokens.
4. Tokens stored in OS-backed secure storage.
5. Desktop includes access token in API calls.

## Subscription/payment flow (mock adapter initially)

1. Client requests checkout → platform creates checkout session (mock), persists intent.
2. Mock webhook delivered → platform verifies signature, persists event idempotently.
3. Platform transitions subscription state based on verified event only.
4. Entitlement and credit services re-evaluate.

## Cloud AI gateway flow

1. Desktop requests cloud execution with model + capability + consent.
2. Gateway verifies user, device, entitlement, consent, available credits.
3. Reserves credits in a transaction.
4. Invokes provider adapter; records usage; settles or releases reservation.
5. Returns normalized result. No silent paid fallback.

## What is NOT stored centrally by default

- Candidate interview profile (desktop-local).
- CVs, recordings, private documents (unless opt-in backup with consent).
