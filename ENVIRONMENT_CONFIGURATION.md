# Veyra Platform — Environment Configuration

## Environment Variables

### Application Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Node environment (development/test/production) | development | No |
| `PORT` | API server port | 3000 | No |
| `API_BASE_URL` | Public API base URL | http://localhost:3000 | No |
| `API_VERSION` | API version | v1 | No |
| `REQUEST_ID_HEADER` | Request ID header name | X-Request-Id | No |
| `ALLOWED_ORIGINS` | CORS allowed origins | http://localhost:3000 | No |
| `LOG_LEVEL` | Logging level | info | No |

### Supabase Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | Yes |
| `DATABASE_URL` | Direct PostgreSQL connection | No |

### OAuth Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (server-only) | No (optional) |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | No (optional) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret (server-only) | No (optional) |
| `OAUTH_REDIRECT_BASE_URL` | OAuth redirect base URL | No (optional) |

### Payment Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `PAYMENT_PROVIDER` | Payment provider (mock/paystack) | Yes |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (server-only) | Yes (for paystack) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key | Yes (for paystack) |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook secret | Yes (for paystack) |
| `PAYMENTS_MODE` | Test or live mode | Yes |
| `PAYMENTS_LIVE_ENABLED` | Enable live payments | Yes |

### Email Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `EMAIL_PROVIDER` | Email provider (mock/smtp) | No |
| `SMTP_HOST` | SMTP host | No |
| `SMTP_PORT` | SMTP port | No |
| `SMTP_USER` | SMTP user | No |
| `SMTP_PASS` | SMTP password | No |

### Storage Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `STORAGE_PROVIDER` | Storage provider (mock/r2) | No |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | No |
| `R2_ACCESS_KEY_ID` | R2 access key ID | No |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key | No |
| `R2_BUCKET` | R2 bucket name | No |

### Update Signing

| Variable | Description | Required |
|----------|-------------|----------|
| `UPDATE_SIGNING_KEY` | ED25519 private key for release signing | No |

## Configuration by Deployment Target

### Render (API Host)
- NODE_ENV=production
- PORT=3000 (or PORT environment variable)
- API_BASE_URL=https://api.veyra.example.com
- All Supabase, Paystack, OAuth, Email, Storage variables

### Supabase Dashboard
- Project URL, anon key, service role key
- OAuth provider configuration (Google, GitHub)
- Webhook URL: https://api.veyra.example.com/api/v1/payments/webhook

### GitHub Actions Secrets
- SUPABASE_SERVICE_ROLE_KEY
- PAYSTACK_SECRET_KEY
- PAYSTACK_WEBHOOK_SECRET
- SUPABASE_ACCESS_TOKEN (for CLI)

## Security

- `.env` is gitignored and must not be committed
- `.env.example` contains placeholders only
- Service-role keys and payment secrets are server-only
- All secrets are validated at startup
