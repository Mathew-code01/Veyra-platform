# Veyra Platform — Website Integration

## Overview

Veyra Website (Next.js) communicates with Veyra Platform over HTTPS using the Veyra Platform SDK. The website handles user authentication via Supabase Auth (browser-based flow). After authentication, the website includes the Supabase JWT in API calls to the platform.

## Authentication

The website handles user sign-in via Supabase Auth (browser-based flow). After authentication, the website includes the Supabase JWT in `Authorization: Bearer <token>` header on platform API calls.

## Integration Areas

| Area | Endpoints | Description |
|------|-----------|-------------|
| Account | `/api/v1/auth/*` | Registration, login, profile |
| Devices | `/api/v1/devices/*` | Device management |
| Entitlements | `/api/v1/entitlements/*` | Capability checks |
| Plans | `/api/v1/plans/*` | Plan catalogue |
| Subscriptions | `/api/v1/subscriptions/*` | Subscription management |
| Payments | `/api/v1/payments/checkout` | Checkout initiation |
| Credits | `/api/v1/credits/*` | Credit management |
| Releases | `/api/v1/releases/*` | Release information |

## SDK

The Veyra Platform SDK provides TypeScript methods for all website integration endpoints:
- `register(email, password)`
- `login(email, password)`
- `logout()`
- `refresh(refreshToken)`
- `getProfile()`
- `updateProfile(body)`
- `listPlans()`
- `getPlan(planId)`
- `createCheckoutSession(body)`
- `getCurrentSubscription()`
- `cancelSubscription(body)`
- `getCreditBalance()`
- `reserveCredits(body)`
- `invokeCloudAI(body)`
- `listAIModels()`
- `listModules()`
- `listModuleVersions(moduleId)`
- `authorizeDownload(moduleVersionId)`
- `checkForUpdate(body)`
- `listReleaseChannels()`
- `getBackupMetadata(category)`
- `setBackupMetadata(category, body)`
- `getConsentRecord(category)`
- `setConsentRecord(category, consentGiven)`
- `sendTestNotification(body)`
- `getNotificationStatus()`
- `adminLookupUser(userId)`
- `adminAdjustCredits(body)`
- `adminRevokeDevice(body)`
- `adminListAuditEvents()`

## Data Boundary

The website does **not** connect directly to the desktop SQLite database. All website data goes through the platform API over HTTPS.

## Security

- All communication over HTTPS
- Authentication via Supabase JWT
- Service-role key is never exposed to website
- Website never stores payment secrets

## Website Responsibilities

- Authentication UI
- Account and billing dashboard
- Plan selection
- Payment checkout
- Credit balance display
- Profile and settings
- Device management

## Platform Responsibilities

- Identity verification
- Account state
- Entitlements
- Device authorization
- Payments
- Credits
- Pricing
- Usage accounting
- Cloud execution authorization
- Release metadata
- Administrative controls
