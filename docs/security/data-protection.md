# Data Protection

## Data not stored centrally by default

- Candidate interview profile (remains desktop-local).
- CVs, interview recordings, private documents (not uploaded unless opt-in backup).

## Backup (opt-in)

- Explicit user consent required before any backup.
- Clear backup categories; user-controlled retention.
- Encryption before upload where appropriate.
- Deletion and restoration workflows; audit events.
- No automatic upload of candidate documents, CVs, recordings, or local interview history.

## Consent records

- Consent records stored per user per category (cloud execution, backup, analytics, marketing where applicable).
- Consent can be withdrawn; withdrawal recorded as an audit event.
- Entitlement checks consider relevant consent where required.

## Encryption

- Encryption at rest: Supabase/PostgreSQL managed encryption.
- In transit: TLS (HTTPS) for all client-platform and platform-external communication.
- Application-layer encryption considered for sensitive backup metadata.

## Retention and deletion

- Account deletion workflow: marks account for deletion, schedules data cleanup per retention policy.
- Export workflow: provides portable copy of user's platform-owned data.
- Device revocation: removes device authorization; sessions revoked.
- Audit events retained per retention policy (not indefinitely by default).

## What is never logged

- Passwords, access tokens, refresh tokens, payment secrets, full private interview content.
