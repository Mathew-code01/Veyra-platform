# Veyra Platform — Authentication Integration

## Overview

Veyra Platform uses Supabase Auth as the central identity provider. Authentication supports both email/password and OAuth (Google, GitHub) sign-in methods. The platform is the sole authority for user identity—both Veyra Website and Veyra Desktop must authenticate through the platform API.

## Authentication Flow

### Email/Password Registration
1. Client calls `POST /api/v1/auth/register` with email and password
2. Platform creates user in Supabase Auth and profile in `profiles` table
3. Returns access token, refresh token, and user profile

### Email/Password Login
1. Client calls `POST /api/v1/auth/login` with email and password
2. Platform verifies credentials via Supabase Auth
3. Returns access token, refresh token, and user profile

### OAuth (Google / GitHub)
1. Client calls `POST /api/v1/auth/oauth/authorize` with provider name
2. Platform returns authorization URL with CSRF state and PKCE challenge
3. Client redirects user to provider (browser-based sign-in)
4. Provider redirects back to Supabase callback URL
5. Supabase exchanges code for session and creates/links user
6. Client calls `POST /api/v1/auth/oauth/callback` with authorization code
7. Platform exchanges code for session via Supabase admin client
8. Returns access token, refresh token, and user profile

### Account Linking
Users can link multiple OAuth providers to a single account:
1. User is already authenticated (has access token)
2. User calls `POST /api/v1/auth/oauth/link` with OAuth code
3. Platform exchanges code and verifies the resulting user matches the authenticated user
4. OAuth identity is linked to the existing account

Identity is derived from verified Supabase JWT claims. Accounts are never merged based on email string matching alone.

### Session Management
- Access tokens are short-lived (configurable via Supabase)
- Refresh tokens are used to obtain new access tokens
- `POST /api/v1/auth/refresh` refreshes the session
- `POST /api/v1/auth/logout` signs out the user

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/auth/register` | POST | User registration | No |
| `/api/v1/auth/login` | POST | User login | No |
| `/api/v1/auth/logout` | POST | User logout | Yes |
| `/api/v1/auth/refresh` | POST | Refresh session | Yes |
| `/api/v1/auth/password-recovery` | POST | Password recovery | No |
| `/api/v1/auth/me` | GET | Get profile | Yes |
| `/api/v1/auth/me` | PATCH | Update profile | Yes |
| `/api/v1/auth/oauth/providers` | GET | List OAuth providers | No |
| `/api/v1/auth/oauth/authorize` | POST | Get authorization URL | No |
| `/api/v1/auth/oauth/callback` | POST | Exchange code for session | No |
| `/api/v1/auth/oauth/link` | POST | Link OAuth account | Yes |

## Desktop Integration

For Veyra Desktop (Electron), use a browser-based OAuth flow:
1. Desktop opens browser to platform authorization URL
2. User authenticates in browser (Supabase Auth)
3. Supabase redirects back with authorization code
4. Desktop extracts code from redirect URL
5. Desktop calls `POST /api/v1/auth/oauth/callback` with code
6. Platform returns access token and refresh token
7. Desktop stores tokens in OS-backed secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service)

Never store credentials in localStorage or plain-text configuration.

## SDK

The Veyra Platform SDK provides TypeScript methods for all authentication operations:
- `register(email, password)`
- `login(email, password)`
- `logout()`
- `refresh(refreshToken)`
- `passwordRecovery(email)`
- `getProfile()`
- `updateProfile(body)`
- `getOAuthProviders()`
- `oauthAuthorize(body)`
- `oauthCallback(body)`
- `oauthLink(body)`
