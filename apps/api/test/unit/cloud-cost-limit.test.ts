import { describe, expect, it, vi } from 'vitest';
import { checkSpendLimits } from '../../src/modules/ai-gateway/execution-modes.service.js';

function clientWith(costs: number[], limit: number | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              current_period_start: '2026-11-01T00:00:00.000Z',
              current_period_end: '2026-12-01T00:00:00.000Z',
              plans: { cloud_ai_monthly_cost_limit_cents: limit },
            },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: costs.map((cost_cents) => ({ cost_cents })), error: null }),
      };
    }),
  };
}

describe('monthly Cloud AI cost limit', () => {
  it('allows a request that fits inside the configured billing-period allowance', async () => {
    const result = await checkSpendLimits(clientWith([700], 800) as any, 'user-1', 100);
    expect(result.allowed).toBe(true);
    expect(result.monthlyUsedCents).toBe(700);
  });

  it('denies a request that would exceed the configured allowance', async () => {
    const result = await checkSpendLimits(clientWith([799], 800) as any, 'user-1', 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Monthly spend limit exceeded');
  });

  it('fails closed if a plan has no configured allowance', async () => {
    const result = await checkSpendLimits(clientWith([], null) as any, 'user-1', 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('allowance is unavailable');
  });
});
