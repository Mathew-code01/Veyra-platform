import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLastKnownGoodPlanPricing,
  getPlanPricingByCountry,
} from '../../src/modules/pricing/country-pricing.service.js';

function query(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gt']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder;
}

describe('regional pricing last-known-good cache', () => {
  afterEach(() => vi.useRealTimers());

  it('serves a validated live offer snapshot for display and expires it after 24 hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00.000Z'));
    const admin = {
      from: vi.fn((table: string) => table === 'plans'
        ? query([{ id: 'cache-test-cloud-plan', name: 'Cloud AI', family: 'cloud', description: null }])
        : query([{ plan_id: 'cache-test-cloud-plan', price_cents: 2999, currency: 'USD', billing_interval: 'monthly', is_active: true }])),
    };

    const result = await getPlanPricingByCountry(admin as never, 'ZA', 'ZAR');
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.currency).toBe('USD');
    const cached = getLastKnownGoodPlanPricing('ZA', 'ZAR');
    expect(cached).toMatchObject({ country: 'ZA', currency: 'ZAR', plans: [{ planId: 'cache-test-cloud-plan', currency: 'USD' }] });
    expect(cached?.retrievedAt).toBe('2026-11-18T10:00:00.000Z');

    vi.setSystemTime(new Date('2026-11-19T10:00:01.000Z'));
    expect(getLastKnownGoodPlanPricing('ZA', 'ZAR')).toBeNull();
  });

  it('does not cache an unsupported country currency pair', async () => {
    const admin = { from: vi.fn() };
    await expect(getPlanPricingByCountry(admin as never, 'ZA', 'USD')).rejects.toThrow('Currency USD not supported for country ZA');
    expect(getLastKnownGoodPlanPricing('ZA', 'USD')).toBeNull();
  });

  it('handles database schema before migration 0013 when is_published column does not exist', async () => {
    let callCount = 0;
    const plansBuilder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'gt']) {
      plansBuilder[method] = vi.fn((field?: string, val?: unknown) => {
        if (field === 'is_published') {
          callCount++;
          // First attempt filtering on is_published returns error 42703
          const failBuilder: Record<string, unknown> = {};
          failBuilder.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: { code: '42703', message: 'column plans.is_published does not exist' } }).then(resolve);
          return failBuilder;
        }
        return plansBuilder;
      });
    }
    plansBuilder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: 'pre-migration-plan', name: 'Cloud AI', family: 'cloud' }], error: null }).then(resolve);

    const admin = {
      from: vi.fn((table: string) => table === 'plans'
        ? plansBuilder
        : query([{ plan_id: 'pre-migration-plan', price_cents: 2999, currency: 'USD', billing_interval: 'monthly', is_active: true }])),
    };

    const result = await getPlanPricingByCountry(admin as never, 'ZA', 'ZAR');
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.planId).toBe('pre-migration-plan');
  });

  it('supplies the approved reference commercial offer if database plans catalogue is empty', async () => {
    const admin = {
      from: vi.fn((table: string) => query([])),
    };

    const result = await getPlanPricingByCountry(admin as never, 'ZA', 'ZAR');
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      planId: '47f925de-71f1-4b8f-84b8-0f53f823b629',
      planName: 'VEYRA Cloud AI',
      currency: 'USD',
      amountCents: 2999,
      billingInterval: 'monthly',
      isAvailable: true,
    });
  });
});
