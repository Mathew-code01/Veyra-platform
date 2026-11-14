# Website Integration Contract

## Scope

Defines the API contracts the future Veyra Website (Next.js, separate repo) will consume. The website is **not** built inside this repository.

## Integration areas

- Registration
- Login (browser-based Supabase Auth flow)
- Email verification
- Password recovery / reset
- Account profile (get/update)
- Pricing / plan catalogue
- Checkout initiation
- Subscription management (current plan, interval, cancel)
- Billing history
- Device management (list, revoke)
- Downloads (authorized package URLs)
- Release information

## Authentication

- Website handles sign-in via its own Supabase Auth client (browser flow).
- Website includes the Supabase JWT in `Authorization: Bearer <token>` on platform API calls.
- Platform verifies the JWT; derives `user_id` from the token, never from a client-supplied field.

## Data boundary

- The website does **not** connect directly to the desktop SQLite database.
- All website data goes through the platform API over HTTPS.

## Endpoints (planned, under /api/v1)

| Area | Endpoint (planned) | Purpose |
|---|---|---|
| Auth | POST /auth/register | Register |
| Auth | POST /auth/login | Login |
| Auth | POST /auth/logout | Logout |
| Auth | POST /auth/password-recovery | Password recovery |
| Account | GET /account/profile | Profile |
| Account | PATCH /account/profile | Update profile |
| Plans | GET /plans | Plan catalogue |
| Subscriptions | GET /subscriptions/current | Current subscription |
| Subscriptions | POST /subscriptions/checkout | Initiate checkout |
| Subscriptions | POST /subscriptions/cancel | Cancel |
| Billing | GET /billing/history | Billing history |
| Devices | GET /devices | List devices |
| Devices | DELETE /devices/:id | Revoke device |
| Downloads | GET /downloads/:package | Authorized download |
| Releases | GET /releases/latest | Release metadata |
| Health | GET /health | Health |

## TypeScript contracts

Shared Zod schemas in `packages/contracts`; typed SDK in `packages/sdk` consumable by the Next.js website.
