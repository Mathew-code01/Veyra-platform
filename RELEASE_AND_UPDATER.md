# Veyra Platform — Release and Updater

## Overview

Veyra Platform provides release metadata and authorized download metadata for desktop automatic updates. Installer packages live in object storage (Cloudflare R2 or equivalent), not in the API deployment filesystem.

## Release Channels

| Channel | Description |
|---------|-------------|
| stable | Stable releases for production use |
| beta | Beta releases for testing |

## Release Metadata

Each release includes:
- Version number
- Platform (windows, macos, linux)
- Architecture (x64, arm64)
- Minimum supported version
- Mandatory update indicator
- Rollout percentage
- Release notes
- Rollback compatibility
- Release assets with SHA-256 hashes and signed metadata

## Release Assets

Each release includes package assets with:
- Package URL (authorized download reference)
- SHA-256 cryptographic hash
- Package size
- Signed metadata
- Signature

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/releases/check` | POST | Check for compatible update | Yes |
| `/api/v1/releases/channels` | GET | List release channels | Yes |
| `/api/v1/releases` | GET | List all releases (admin) | Yes |
| `/api/v1/releases/:id/revoke` | POST | Revoke release (admin) | Yes |
| `/api/v1/releases/:id/unrevoke` | POST | Unrevoke release (admin) | Yes |

## Desktop Update Flow

1. Desktop queries `GET /api/v1/releases/check` with platform, architecture, current version, and channel
2. Platform returns latest compatible release with package URL, hash, and signed metadata
3. Desktop verifies package hash and signed metadata
4. Desktop applies update (must not interrupt active interview)

## Security

- Release metadata is signed to prevent tampering
- Package integrity is verified via SHA-256 hash
- Desktop must not trust arbitrary version strings or URLs
- Revoked releases are excluded from update checks
