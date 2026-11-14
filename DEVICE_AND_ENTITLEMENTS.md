# Veyra Platform — Device and Entitlements

## Device Management

### Device Registration
Devices are registered with a unique installation ID and receive a server-issued credential hash. The credential hash is stored in OS-backed secure storage on the desktop and cannot be derived from local data, preventing devices from self-authorizing.

### Device Authorization
Devices are not authorized by default. Authorization must be granted server-side by an administrator or through an automated process. The `is_authorized` field cannot be modified by clients.

### Device Limits
Each plan has a configurable device limit. The platform enforces this limit during device registration.

### Device Revocation
Devices can be revoked by administrators or users. Revoked devices lose all access immediately.

### Device Sessions
Device sessions are tracked with expiration times and can be revoked individually.

## Entitlements

### Capability Identifiers

| Capability | Description |
|------------|-------------|
| `liveInterview` | Live interview functionality |
| `practice` | Practice mode |
| `localInference` | Local AI inference |
| `cloudInference` | Cloud AI inference |
| `vision` | Vision capabilities |
| `documentAnalysis` | Document analysis |
| `cloudBackup` | Cloud backup |
| `advancedModels` | Advanced AI models |
| `priorityCloudExecution` | Priority cloud execution |

### Entitlement Evaluation

Entitlements are evaluated based on:
1. Account status (must be active)
2. Device authorization (must have at least one authorized device)
3. Plan features (plan must include the capability)
4. Expiration and grace rules

### Offline Entitlement Snapshots

Signed, expiring entitlement snapshots are available for limited offline use. Snapshots:
- Expire after a configurable TTL (default 1 hour)
- Are revoked when the device is revoked
- Are not a substitute for live entitlement checks

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/devices/register` | POST | Register device | Yes |
| `/api/v1/devices` | GET | List devices | Yes |
| `/api/v1/devices/:id/authorize` | PATCH | Authorize device | Yes |
| `/api/v1/devices/:id` | DELETE | Revoke device | Yes |
| `/api/v1/devices/:id/last-seen` | PATCH | Update last seen | Yes |
| `/api/v1/devices/:id/replace` | POST | Replace device | Yes |
| `/api/v1/devices/:id/sessions/revoke` | POST | Revoke device sessions | Yes |
| `/api/v1/entitlements/check` | POST | Check entitlement | Yes |
| `/api/v1/entitlements` | GET | List entitlements | Yes |
| `/api/v1/entitlements/snapshot` | POST | Generate offline snapshot | Yes |
| `/api/v1/entitlements/snapshot/verify` | POST | Verify snapshot | Yes |

## SDK

The Veyra Platform SDK provides methods for all device and entitlement operations.
