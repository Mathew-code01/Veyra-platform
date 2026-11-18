# VEYRA ecosystem architecture (verified snapshot)

Date: 2026-11-15. This is a code-inspection snapshot, not a completion claim.

## Ownership
- Website (`veyra-website`): Next.js marketing and customer/admin portal. Shared identity and business rules are called through Platform HTTP API.
- Platform (`veyra-platform`): Fastify API, Supabase-backed auth/data services, Zod contracts and SDK. Subscription, payment, credit, entitlement, device and release decisions belong here.
- Desktop (`Veyra`): Electron application, interview/practice engine, local inference, documents/context, voice and overlay. Local inference and desktop capture belong here; Platform supplies shared identity/account services and optional cloud AI.

## Observed integration gaps
- Website uses a local `VeyraPlatformClient` and endpoint constants; it does not import the Platform SDK/contracts package.
- Desktop source did not show Platform SDK use in the Electron client. A separate Express server contains account/device/billing/AI scaffolding, but its integration with Electron startup was not established.
- Development ports are Website 5173, Platform 3000, Desktop renderer 5174. Desktop was moved from 5173 to avoid collision.

## Verification boundary
Platform typecheck and production build passed. API tests pass 18 files / 124 tests. The actual server startup and cross-client account lifecycle have not been run against a safe integration environment. Do not infer runtime compatibility from endpoint existence alone.