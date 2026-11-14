# Desktop Integration Contract

## Scope

Defines the endpoints and TypeScript contracts Veyra Desktop needs to integrate with Veyra Platform. The desktop repository is **not** modified here.

## Integration steps

1. Desktop starts.
2. Desktop opens browser-based login flow (Authorization Code + PKCE) against the platform.
3. User authenticates with Veyra (Supabase Auth).
4. Desktop receives authorization result via the secure flow (redirect back to a localhost loopback handler or custom scheme).
5. Desktop stores access/refresh tokens in OS-backed secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service).
6. Desktop registers/validates its installation (installation identifier + server-issued device credential).
7. Desktop retrieves account profile and entitlements.
8. Desktop checks release metadata when appropriate (update API).
9. Desktop requests cloud execution only when permitted (entitlement + credits + consent).
10. Desktop continues local models/functionality without cloud dependency where possible.

## Network constraints

- HTTPS only to platform.
- Desktop local HTTP server (if used) is loopback-only.
- Renderer-to-main via Electron IPC.
- No public inbound connection to the user's computer.

## Endpoints the desktop will need (planned, under /api/v1)

| Area | Endpoint (planned) | Purpose |
|---|---|---|
| Auth | POST /auth/token | Exchange PKCE code for tokens (desktop) |
| Auth | POST /auth/refresh | Refresh access token |
| Auth | POST /auth/revoke | Revoke tokens / sign out |
| Account | GET /account/profile | Retrieve profile |
| Account | GET /account/entitlements | Evaluate entitlements |
| Devices | POST /devices | Register device |
| Devices | GET /devices | List devices |
| Devices | DELETE /devices/:id | Revoke device |
| Entitlements | GET /entitlements/snapshot | Signed expiring offline snapshot |
| Releases | GET /releases/latest | Latest compatible release metadata |
| Downloads | GET /downloads/:package | Authorized short-lived download URL |
| Cloud AI | POST /ai/invoke | Authorized cloud execution |
| Health | GET /health | Liveness/readiness |

## TypeScript contracts

Defined in `packages/contracts` (Zod schemas) and re-exported through `packages/sdk`. The desktop consumes the SDK or generates client types from the contracts.

## Credential storage

- Access token + refresh token in OS secure storage.
- Installation identifier persisted locally (non-secret).
- Device credential (server-issued) stored securely.
- Never localStorage or plain-text config.

## Offline entitlement snapshot

- Signed, expiring JWT-like snapshot of entitlements.
- Limitations documented: expires, revoked on device revocation, not a substitute for live check.
