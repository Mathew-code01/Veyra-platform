import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeCloudAI } from '../../src/modules/ai-gateway/ai-gateway.service.js';

// Mock entitlement check to always return entitled=true for AI gateway tests
vi.mock('../../src/modules/entitlements/entitlements.service.js', () => ({
  checkEntitlement: vi.fn().mockResolvedValue({ entitled: true, reason: undefined }),
}));

// Mock Supabase admin client
function mockAdminClient() {
  let balance = 10000; // Start with 10000 cents ($100)
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
      if (table === 'ai_usage_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    }),
  };
}

// Mock Supabase user client
function mockUserClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
        };
      }
      if (table === 'devices') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) =>
            resolve({ data: [{ is_authorized: true }], error: null })
          ),
        };
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

describe('invokeCloudAI', () => {
  it('rejects when consent is false', async () => {
    const adminClient = mockAdminClient();
    const userClient = mockUserClient();

    const result = await invokeCloudAI(adminClient as any, userClient as any, 'user-1', undefined, {
      modelId: 'mock-text-small',
      capability: 'text_generation',
      input: 'Hello',
      consent: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Consent is required for cloud AI execution');
  });

  it('rejects when model does not support capability', async () => {
    const adminClient = mockAdminClient();
    const userClient = mockUserClient();

    const result = await invokeCloudAI(adminClient as any, userClient as any, 'user-1', undefined, {
      modelId: 'mock-text-small',
      capability: 'vision',
      input: 'Hello',
      consent: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not support capability');
  });

  it('rejects when unknown model', async () => {
    const adminClient = mockAdminClient();
    const userClient = mockUserClient();

    const result = await invokeCloudAI(adminClient as any, userClient as any, 'user-1', undefined, {
      modelId: 'unknown-model',
      capability: 'text_generation',
      input: 'Hello',
      consent: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not support capability');
  });
});
