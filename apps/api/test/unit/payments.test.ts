import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listPlans, getPlan, seedDevPlans } from '../../src/modules/plans/plans.service.js';
import {
  getCurrentSubscription,
  createSubscription,
  cancelSubscription,
  reactivateSubscription,
} from '../../src/modules/subscriptions/subscriptions.service.js';
import {
  createCheckoutSession,
  processWebhookEvent,
  reconcileSubscriptions,
} from '../../src/modules/payments/payments.service.js';
import { MockPaymentProvider } from '../../src/modules/payments/payment-provider.mock.js';
import { createPaymentProvider } from '../../src/modules/payments/payment-provider.js';
import { loadEnv, resetEnv } from '../../src/config/env.js';

// Helper to create a mock Supabase query chain
function mockQuery(result: { data: any; error: any }, chainLength: number = 3) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, single };
}

function mockQueryArray(result: { data: any[]; error: any }) {
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        then: vi.fn().mockImplementation((resolve) => resolve(result)),
      }),
    }),
  });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select };
}

beforeEach(() => {
  resetEnv();
  vi.clearAllMocks();
  loadEnv();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MockPaymentProvider', () => {
  it('is not live and has name mock', () => {
    const provider = new MockPaymentProvider();
    expect(provider.name).toBe('mock');
    expect(provider.isLive).toBe(false);
  });

  it('creates a customer', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createCustomer('test@example.com');
    expect(result.customerId).toBeDefined();
    expect(result.customerId.startsWith('cus_mock')).toBe(true);
  });

  it('creates a checkout session', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createCheckoutSession({
      customerId: 'cus_123',
      priceId: 'price_123',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });
    expect(result.checkoutUrl).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });

  it('creates a subscription', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createSubscription({
      customerId: 'cus_123',
      priceId: 'price_123',
      billingInterval: 'monthly',
    });
    expect(result.subscriptionId).toBeDefined();
    expect(result.status).toBe('active');
  });

  it('creates a trialing subscription with trialEnd', async () => {
    const provider = new MockPaymentProvider();
    const result = await provider.createSubscription({
      customerId: 'cus_123',
      priceId: 'price_123',
      billingInterval: 'monthly',
      trialEnd: new Date('2027-01-01'),
    });
    expect(result.status).toBe('trialing');
  });

  it('cancels a subscription', async () => {
    const provider = new MockPaymentProvider();
    await provider.createSubscription({
      customerId: 'cus_123',
      priceId: 'price_123',
      billingInterval: 'monthly',
    });
    const subId = Array.from(provider['subscriptions'].keys())[0];
    const result = await provider.cancelSubscription(subId, true);
    expect(result.status).toBe('active');
  });

  it('verifies webhook signature (mock accepts all)', () => {
    const provider = new MockPaymentProvider();
    expect(provider.verifyWebhookSignature('payload', 'whsec_mock_123')).toBe(true);
  });
});

describe('createPaymentProvider', () => {
  it('creates a mock provider', () => {
    const provider = createPaymentProvider('mock');
    expect(provider.name).toBe('mock');
    expect(provider.isLive).toBe(false);
  });

  it('throws for unsupported provider', () => {
    expect(() => createPaymentProvider('stripe' as any)).toThrow('Unsupported payment provider');
  });
});

describe('seedDevPlans', () => {
  it('seeds development plans', async () => {
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    const result = await seedDevPlans(mockAdminClient as any);
    expect(result.seeded).toBe(3);
  });
});

describe('listPlans', () => {
  it('returns active plans', async () => {
    const plans = [
      { id: 'plan-1', name: 'Local', family: 'local', description: null, billing_interval: 'monthly', price_cents: 0, currency: 'USD', features: {}, device_limit: 1, is_active: true, is_dev_fixture: true, created_at: '2026-01-01T00:00:00Z' },
    ];
    const mockUserClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((resolve) => resolve({ data: plans, error: null })),
      }),
    };
    const result = await listPlans(mockUserClient as any);
    expect(result.plans.length).toBe(1);
    expect(result.plans[0].name).toBe('Local');
  });
});

describe('getPlan', () => {
  it('returns a plan by ID', async () => {
    const plan = { id: 'plan-1', name: 'Local', family: 'local', description: null, billing_interval: 'monthly', price_cents: 0, currency: 'USD', features: {}, device_limit: 1, is_active: true, is_dev_fixture: true, created_at: '2026-01-01T00:00:00Z' };
    const mockUserClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: plan, error: null }),
      }),
    };
    const result = await getPlan(mockUserClient as any, 'plan-1');
    expect(result.plan.id).toBe('plan-1');
    expect(result.plan.name).toBe('Local');
  });
});

describe('getCurrentSubscription', () => {
  it('returns null when no subscription exists', async () => {
    const mockUserClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    };
    const result = await getCurrentSubscription(mockUserClient as any, 'user-1');
    expect(result.subscription).toBeNull();
  });

  it('returns the subscription when one exists', async () => {
    const sub = { id: 'sub-1', user_id: 'user-1', plan_id: 'plan-1', billing_interval: 'monthly', status: 'active', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', cancel_at_period_end: false, canceled_at: null, trial_start: null, trial_end: null, provider_subscription_id: 'sub_prov_1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
    const mockUserClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: sub, error: null }),
      }),
    };
    const result = await getCurrentSubscription(mockUserClient as any, 'user-1');
    expect(result.subscription).toBeDefined();
    expect(result.subscription?.id).toBe('sub-1');
    expect(result.subscription?.status).toBe('active');
  });
});

describe('createSubscription', () => {
  it('creates a subscription with mock provider', async () => {
    const plan = { id: 'plan-1', price_cents: 999, currency: 'USD', billing_interval: 'monthly' };
    const mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'plans') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: plan, error: null }),
          };
        }
        if (table === 'payment_customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'pc-1', provider_customer_id: 'cus_mock_1' }, error: null }),
          };
        }
        if (table === 'subscriptions') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'sub-1', plan_id: 'plan-1', billing_interval: 'monthly', status: 'active', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', cancel_at_period_end: false, provider_subscription_id: 'sub_prov_1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
              error: null,
            }),
          };
        }
        return {};
      }),
    };

    const result = await createSubscription(mockAdminClient as any, 'user-1', 'plan-1', 'monthly');
    expect(result.subscription.id).toBe('sub-1');
    expect(result.subscription.status).toBe('active');
  });
});

describe('cancelSubscription', () => {
  it('throws when subscription not found', async () => {
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    };

    await expect(
      cancelSubscription(mockAdminClient as any, 'sub-nonexistent', true),
    ).rejects.toThrow('Subscription not found');
  });
});

describe('createCheckoutSession', () => {
  it('creates a checkout session', async () => {
    const plan = { id: 'plan-1', price_cents: 999, currency: 'USD' };
    const mockAdminClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'plans') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: plan, error: null }),
          };
        }
        if (table === 'payment_customers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'pc-1', provider_customer_id: 'cus_mock_1' }, error: null }),
          };
        }
        return {};
      }),
    };

    const result = await createCheckoutSession(mockAdminClient as any, 'user-1', 'plan-1', 'monthly', 'https://example.com/success', 'https://example.com/cancel');
    expect(result.checkoutUrl).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });
});

describe('processWebhookEvent', () => {
  it('processes a valid webhook event', async () => {
    let singleCallCount = 0;
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          singleCallCount++;
          if (singleCallCount === 1) {
            // First single: idempotency check - not found
            return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
          }
          if (singleCallCount === 2) {
            // Second single: insert result
            return Promise.resolve({ data: { id: 'wh-1' }, error: null });
          }
          // Third single: update result
          return Promise.resolve({ data: null, error: null });
        }),
      }),
    };

    const result = await processWebhookEvent(
      mockAdminClient as any,
      'mock',
      'evt_123',
      'checkout.session.completed',
      { id: 'evt_123', type: 'checkout.session.completed', data: { object: {} } },
      'whsec_mock_sig',
    );

    expect(result.processed).toBe(true);
  });
});

describe('reconcileSubscriptions', () => {
  it('returns reconciliation count', async () => {
    const subs = [{ id: 'sub-1', provider_subscription_id: 'sub_prov_1', status: 'active' }];
    const mockAdminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve) => resolve({ data: subs, error: null })),
        }),
      }),
    };

    const result = await reconcileSubscriptions(mockAdminClient as any);
    expect(result.reconciled).toBe(1);
  });
});
