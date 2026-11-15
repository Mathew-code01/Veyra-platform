# Veyra Platform — Pricing and Credits

## Pricing Engine

Veyra Platform uses a configurable pricing engine that allows administrators to set prices by model, provider, modality, and region. Prices are stored in the database and can be updated without code changes.

### Pricing Rules

Each pricing rule specifies:
- Provider (optional - applies to all providers if not set)
- Model (optional - applies to all models if not set)
- Modality (optional - applies to all modalities if not set)
- Region (optional - applies to all regions if not set)
- Input price per unit (in cents)
- Output price per unit (in cents)
- Currency
- Effective date
- Expiration date (optional)
- Active status

### Most-Specific-Match Resolution

When calculating costs, the platform finds the most specific matching pricing rule:
1. Match by model + provider + modality + region
2. Match by model + provider + modality
3. Match by model only
4. No match → fail closed (zero cost is never assumed)

### Cost Calculation

Costs are calculated per 1,000 units (tokens, characters, images, etc.):
```
input_cost = (input_units × input_price_per_unit_cents) / 1000
output_cost = (output_units × output_price_per_unit_cents) / 1000
total_cost = input_cost + output_cost
```

All monetary calculations use integer arithmetic. Floating-point is never used for money.

## Credit System

### Credit Types

Veyra Platform distinguishes between two types of credits:

1. **Plan Allowance Credits**: Monthly credits granted with an active subscription. These expire at the end of the billing cycle if unused.

2. **Promotional Credits**: Credits granted for promotions. Expiration policy is configurable.

3. **Top-up Credits**: Separately purchased credits. Expiration policy is explicit and configurable (may differ from monthly allowances).

### Credit Ledger

All credit movements are recorded in an immutable ledger:
- `grant` - Credits added to account
- `allowance` - Plan allowance credited
- `promotional` - Promotional credits added
- `reservation` - Credits reserved for pending usage
- `settlement` - Reserved credits settled (charged)
- `release` - Reserved credits released (refunded to available)
- `adjustment` - Manual adjustment (audit required)
- `expiration` - Credit expired

### Monthly Allowance Allocation

At the start of each billing cycle:
1. Platform identifies all active subscriptions
2. For each subscription with a credit allowance, credits are granted
3. Allocations are idempotent (duplicate requests detected via idempotency key)
4. Allocations recorded in credit ledger

### Credit Expiration

At the end of each billing cycle:
1. Unused monthly allowances expire
2. Expiration recorded in credit ledger
3. Expired allowances cannot be spent

### API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v1/credits/balance` | GET | Get credit balance | Yes |
| `/api/v1/credits/reserve` | POST | Reserve credits | Yes |
| `/api/v1/credits/settle` | POST | Settle reservation | Yes |
| `/api/v1/credits/release` | POST | Release reservation | Yes |

## SDK

The Veyra Platform SDK provides:
- `getCreditBalance()`
- `reserveCredits(body)`
- `settleReservation(reservationId)`
- `releaseReservation(reservationId)`

## Concurrency Safety

All credit operations use database transactions with row-level locking:
- Reserve credits: Lock account row, check balance, deduct, record reservation
- Settle reservation: Mark reservation as settled, record usage
- Release reservation: Mark reservation as released, add credits back to balance
- Idempotency keys prevent duplicate operations

Prevents double spending and duplicate settlement even under concurrent requests.
