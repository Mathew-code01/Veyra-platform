# API integration matrix (verified snapshot)

Date: 2026-11-15.

| Flow/API | Platform evidence | Website | Desktop | Verification |
|---|---|---|---|---|
| Authentication | Fastify auth routes backed by Supabase | Custom API client; recovery/reset pages | No Platform SDK/client usage found in inspected Electron source | Source inspected; external OAuth flow not run |
| Usage history | `GET /api/v1/usage` registered; user scoped | Consumed by usage/dashboard views | No connected call established | Platform tests/build; no cross-client flow |
| Payment history | `GET /api/v1/payments/history` registered | Consumed by billing view | No connected call established | Source inspected; sandbox checkout not run |
| Devices / entitlements | Platform modules/routes present | Customer portal API families present | Express server scaffolding exists; Electron wiring unverified | Not end-to-end verified |
| AI usage | Platform AI gateway exists | No browser interview engine intended | Local/cloud providers exist; Platform SDK integration not found | Not end-to-end verified |
| Releases | Platform release APIs exist | Download portal present | Updater integrity flow not verified | Not verified |
| Password recovery | Allowlisted Origin helper now builds reset callback; invalid/missing Origin returns enumeration-safe success without sending | Recovery action sends configured Website Origin | Shared Supabase identity intended | Helper test 4/4; full email/Supabase callback external flow untested |
| Cloud plan cost policy | `PUT /api/v1/admin/plans/:planId/cloud-cost-limit`, billing/admin role required, writes audit metadata | Admin plans page edits the internal monthly USD cost cap | Not consumed directly | API and Website types/build checked; admin authorization flow not run against Supabase |

The Website does not import the Platform SDK/contracts package. Endpoints not explicitly listed above require a route-by-route source audit before making integration claims. Usage and payment handlers currently cap returned records at 100; pagination behavior is not established.
