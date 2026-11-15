# Veyra Platform — Paystack Integration

## Overview

Veyra Platform uses Paystack as its payment provider. Paystack is a payment gateway that supports payments in multiple African countries (Nigeria, Ghana, South Africa, Kenya) with support for NGN, GHS, ZAR, KES, and USD currencies.

All payment processing is server-side. The frontend never receives the secret key.

## Payment Flow

### Checkout Session Creation
1. Client calls `POST /api/v1/payments/checkout` with plan ID, billing interval, and URLs
2. Platform creates or retrieves a Paystack customer for the user
3. Platform initializes a checkout session via Paystack API (`/transaction/initialize`)
4. Returns checkout URL and session ID to client
5. Client redirects user to checkout URL for payment

### Payment Verification
After payment, payment status is verified via Paystack API (`/transaction/verify/{reference}`):
1. Platform verifies the transaction with Paystack
2. Payment status is updated in the database
3. Subscription is created or updated based on payment result

### Webhook Processing
Paystack sends webhooks for payment events:
1. Platform verifies webhook signature using HMAC SHA-512 with constant-time comparison
2. Event is persisted for idempotency (duplicate event protection)
3. Subscription state transitions based on verified event type:
   - `checkout.session.completed` → Activate subscription
   - `customer.subscription.updated` → Update subscription status
   - `customer.subscription.deleted` → Cancel subscription
   - `invoice.payment_failed` → Mark as past due
   - `invoice.payment_succeeded` → Mark as active

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/payments/checkout` | POST | Create checkout session | Yes |
| `/api/v1/payments/webhook` | POST | Payment webhook (signature verified) | No |
| `/api/v1/payments/reconcile` | POST | Reconcile subscriptions | Yes |

## Security

- Webhook signatures verified using HMAC SHA-512 with constant-time comparison
- Payment provider secret key is server-only, never exposed to clients
- Payment events persisted for idempotency (duplicate event protection)
- Subscription state transitions driven by verified webhook events only
- No charges granted solely because browser reports successful payment

## SDK

The Veyra Platform SDK provides:
- `createCheckoutSession(body)` - Create checkout session

## Provider Configuration

| Environment Variable | Description | Required |
|----------------------|-------------|----------|
| `PAYMENT_PROVIDER` | Provider name (`mock` or `paystack`) | Yes |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (server-only) | Yes (for paystack) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key | Yes (for paystack) |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook secret | Yes (for paystack) |
| `PAYMENTS_MODE` | Test or live mode | Yes |
| `PAYMENTS_LIVE_ENABLED` | Enable live payments | Yes |

Test mode is the default. Live mode requires explicit configuration and approval. No live charges are made without explicit user approval.

## Dashboard Configuration

1. Create Paystack account at https://paystack.com
2. Obtain secret key, public key, and webhook secret from dashboard
3. Configure webhook URL: `https://api.veyra-platform.example.com/api/v1/payments/webhook`
4. Add allowed domains for checkout redirects
