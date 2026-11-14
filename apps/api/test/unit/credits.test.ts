import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  grantCredits,
  applyPlanAllowance,
  reserveCredits,
  settleReservation,
  releaseReservation,
  getCreditBalance,
} from '../../src/modules/credits/credits.service.js';

// Mock Supabase admin client
function mockAdminClient() {
  let balance = 0;
  let accountExists = false;

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'credit_accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (!accountExists) {
              return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }
            return Promise.resolve({ data: { id: 'ca-1', balance_cents: balance }, error: null });
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() => {
              accountExists = true;
              return Promise.resolve({ data: { id: 'ca-1' }, error: null });
            }),
          }),
          update: vi.fn().mockImplementation((updates: any) => {
            if (updates && updates.balance_cents !== undefined) {
              balance = updates.balance_cents;
            }
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === 'credit_ledger_transactions') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'usage_reservations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          insert: vi.fn().mockResolvedValue({ data: { id: 'res-1' }, error: null }),
        };
      }
      if (table === 'usage_records') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('grantCredits', () => {
  it('grants credits to a user', async () => {
    const adminClient = mockAdminClient();
    const result = await grantCredits(adminClient as any, 'user-1', 1000);
    expect(result.ok).toBe(true);
    expect(result.balanceCents).toBe(1000);
  });

  it('rejects non-positive amounts', async () => {
    const adminClient = mockAdminClient();
    const result = await grantCredits(adminClient as any, 'user-1', 0);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Amount must be positive');
  });
});

describe('applyPlanAllowance', () => {
  it('applies plan allowance credits', async () => {
    const adminClient = mockAdminClient();
    const result = await applyPlanAllowance(adminClient as any, 'user-1', 5000);
    expect(result.ok).toBe(true);
    expect(result.balanceCents).toBe(5000);
  });
});

describe('reserveCredits', () => {
  it('rejects insufficient credits', async () => {
    const adminClient = mockAdminClient();
    const result = await reserveCredits(adminClient as any, 'user-1', 5000, {
      idempotencyKey: 'res-2',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Insufficient credits');
  });

  it('requires idempotency key', async () => {
    const adminClient = mockAdminClient();
    const result = await reserveCredits(adminClient as any, 'user-1', 100, {
      idempotencyKey: '',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Idempotency key is required');
  });
});

describe('settleReservation', () => {
  it('returns not found for unknown reservation', async () => {
    const adminClient = mockAdminClient();
    const result = await settleReservation(adminClient as any, 'res-unknown');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Reservation not found');
  });
});

describe('releaseReservation', () => {
  it('returns not found for unknown reservation', async () => {
    const adminClient = mockAdminClient();
    const result = await releaseReservation(adminClient as any, 'res-unknown');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Reservation not found');
  });
});

describe('getCreditBalance', () => {
  it('returns balance for a user', async () => {
    const adminClient = mockAdminClient();
    await grantCredits(adminClient as any, 'user-1', 1000);
    const result = await getCreditBalance(adminClient as any, 'user-1');
    expect(result).toBeDefined();
    expect(result!.balanceCents).toBe(1000);
  });
});
