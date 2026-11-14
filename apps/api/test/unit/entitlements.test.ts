import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkEntitlement,
  listEntitlements,
  generateEntitlementSnapshot,
  verifyEntitlementSnapshot,
  CAPABILITIES,
} from '../../src/modules/entitlements/entitlements.service.js';

// Mock Supabase client
const mockUserClient = {
  from: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

function mockProfileQuery(status: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { status }, error: null }),
  };
}

function mockDevicesQuery(authorizedDevices: { is_authorized: boolean }[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    // Returns a Promise directly (no .single() chained)
    then: vi.fn().mockImplementation((resolve) => resolve({ data: authorizedDevices, error: null })),
  };
}

describe('CAPABILITIES', () => {
  it('includes expected capability identifiers', () => {
    expect(CAPABILITIES).toContain('liveInterview');
    expect(CAPABILITIES).toContain('cloudInference');
    expect(CAPABILITIES).toContain('cloudBackup');
    expect(CAPABILITIES.length).toBeGreaterThan(0);
  });
});

describe('checkEntitlement', () => {
  it('returns not entitled when account is not active', async () => {
    (mockUserClient.from as any).mockReturnValue(mockProfileQuery('suspended'));

    const result = await checkEntitlement(mockUserClient as any, 'user-1', 'liveInterview');

    expect(result.entitled).toBe(false);
    expect(result.reason).toBe('Account not active');
  });

  it('returns not entitled when no authorized device', async () => {
    (mockUserClient.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('active');
      if (table === 'devices') return mockDevicesQuery([]);
      return mockProfileQuery('active');
    });

    const result = await checkEntitlement(mockUserClient as any, 'user-1', 'liveInterview');

    expect(result.entitled).toBe(false);
    expect(result.reason).toBe('No authorized device');
  });

  it('returns not entitled for capability not in local plan', async () => {
    (mockUserClient.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('active');
      if (table === 'devices') return mockDevicesQuery([{ is_authorized: true }]);
      return mockProfileQuery('active');
    });

    // cloudInference is not in local plan
    const result = await checkEntitlement(mockUserClient as any, 'user-1', 'cloudInference');

    expect(result.entitled).toBe(false);
    expect(result.reason).toContain('not included in local plan');
  });

  it('returns entitled for practice (in local plan) with active account and authorized device', async () => {
    (mockUserClient.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('active');
      if (table === 'devices') return mockDevicesQuery([{ is_authorized: true }]);
      return mockProfileQuery('active');
    });

    const result = await checkEntitlement(mockUserClient as any, 'user-1', 'practice');

    expect(result.entitled).toBe(true);
  });
});

describe('listEntitlements', () => {
  it('returns all capabilities with entitled status', async () => {
    (mockUserClient.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('active');
      if (table === 'devices') return mockDevicesQuery([{ is_authorized: true }]);
      return mockProfileQuery('active');
    });

    const results = await listEntitlements(mockUserClient as any, 'user-1');

    expect(results.length).toBe(CAPABILITIES.length);
    const practice = results.find((r) => r.capability === 'practice');
    const cloudInference = results.find((r) => r.capability === 'cloudInference');
    expect(practice?.entitled).toBe(true);
    expect(cloudInference?.entitled).toBe(false);
  });
});

describe('generateEntitlementSnapshot and verifyEntitlementSnapshot', () => {
  it('creates and verifies a valid snapshot', async () => {
    const mockAdminClient = {
      from: vi.fn(),
    };

    (mockAdminClient.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') return mockProfileQuery('active');
      if (table === 'devices') return mockDevicesQuery([{ is_authorized: true }]);
      return mockProfileQuery('active');
    });

    const { snapshot, expiresAt } = await generateEntitlementSnapshot(
      mockAdminClient as any,
      'user-1',
      3600,
    );

    expect(snapshot).toBeDefined();
    expect(expiresAt).toBeDefined();

    const verification = verifyEntitlementSnapshot(snapshot);
    expect(verification.valid).toBe(true);
    expect(verification.payload?.userId).toBe('user-1');
  });

  it('rejects an invalid snapshot', () => {
    const verification = verifyEntitlementSnapshot('invalid.snapshot.token');
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe('Invalid snapshot signature');
  });
});
