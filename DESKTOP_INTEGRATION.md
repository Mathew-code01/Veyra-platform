# Veyra Platform — Desktop Integration

## Overview

Veyra Platform provides the central backend services for Veyra Desktop (Electron application). The desktop application communicates with the platform over HTTPS using the Veyra Platform SDK.

## Integration Steps

### 1. Authentication
1. Desktop opens browser-based login flow (Authorization Code + PKCE)
2. User authenticates with Veyra (Supabase Auth)
3. Desktop receives authorization result via secure flow
4. Desktop stores credentials in OS-backed secure storage

### 2. Device Registration
1. Desktop registers its installation with a unique installation ID
2. Platform issues a server-issued device credential hash
3. Desktop stores credential in OS-backed secure storage
4. Device is authorized by an administrator or automated process

### 3. Account & Entitlements
1. Desktop retrieves account profile
2. Desktop evaluates entitlements for cloud AI, backups, etc.
3. Desktop requests cloud execution only when permitted

### 4. Release Updates
1. Desktop queries release metadata for compatible updates
2. Desktop verifies package hash and signed metadata
3. Desktop applies update (must not interrupt active interview)

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/auth/register` | POST | Register | No |
| `/api/v1/auth/login` | POST | Login | No |
| `/api/v1/auth/oauth/authorize` | POST | OAuth authorize | No |
| `/api/v1/auth/oauth/callback` | POST | OAuth callback | No |
| `/api/v1/devices/register` | POST | Register device | Yes |
| `/api/v1/devices` | GET | List devices | Yes |
| `/api/v1/entitlements/check` | POST | Check entitlement | Yes |
| `/api/v1/entitlements` | GET | List entitlements | Yes |
| `/api/v1/entitlements/snapshot` | POST | Offline snapshot | Yes |
| `/api/v1/releases/check` | POST | Check for update | Yes |
| `/api/v1/releases/channels` | GET | List channels | Yes |

## SDK

The Veyra Platform SDK provides TypeScript methods for all desktop integration endpoints.

## Security

- All communication is over HTTPS
- Tokens are stored in OS-backed secure storage (never localStorage)
- Device credentials are server-issued hashes (never derivable from local data)
- Devices cannot self-authorize
