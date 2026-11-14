import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getBackupMetadata,
  setBackupMetadata,
  deleteBackupMetadata,
  getConsentRecord,
  setConsentRecord,
} from '../../src/modules/backups/backup.service.js';
import {
  isAdmin,
  adminLookupUser,
  adminAdjustCredits,
  adminRevokeDevice,
  listAdminAuditEvents,
} from '../../src/modules/admin/admin.service.js';
import { loadEnv, resetEnv } from '../../src/config/env.js';

// Mock Supabase admin client
function mockAdminClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'backup_metadata') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
          upsert: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'user_consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
          upsert: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'admin_roles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'ar-1', expires_at: null },
            error: null,
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user-1',
              email: 'test@example.com',
              display_name: 'Test User',
              locale: 'en',
              status: 'active',
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          }),
        };
      }
      if (table === 'credit_accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'ca-1', balance_cents: 1000 },
            error: null,
          }),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'credit_ledger_transactions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === 'devices') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'dev-1', user_id: 'user-1', is_authorized: true, is_revoked: false },
            error: null,
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'admin_audit_events') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {};
    }),
  };
}

beforeEach(() => {
  resetEnv();
  vi.clearAllMocks();
  loadEnv();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getBackupMetadata', () => {
  it('returns null when no backup metadata exists', async () => {
    const adminClient = mockAdminClient();
    const result = await getBackupMetadata(adminClient as any, 'user-1', 'account_data');
    expect(result).toBeNull();
  });
});

describe('setBackupMetadata', () => {
  it('sets backup metadata', async () => {
    const adminClient = mockAdminClient();
    const result = await setBackupMetadata(adminClient as any, 'user-1', 'account_data', {
      encryptionEnabled: true,
      retentionDays: 30,
      status: 'active',
    });
    expect(result.ok).toBe(true);
    expect(result.backupCategory).toBe('account_data');
  });
});

describe('deleteBackupMetadata', () => {
  it('deletes backup metadata', async () => {
    const adminClient = mockAdminClient();
    const result = await deleteBackupMetadata(adminClient as any, 'user-1', 'account_data');
    expect(result.ok).toBe(true);
  });
});

describe('getConsentRecord', () => {
  it('returns null when no consent record exists', async () => {
    const adminClient = mockAdminClient();
    const result = await getConsentRecord(adminClient as any, 'user-1', 'cloud_backup');
    expect(result).toBeNull();
  });
});

describe('setConsentRecord', () => {
  it('sets consent record', async () => {
    const adminClient = mockAdminClient();
    const result = await setConsentRecord(adminClient as any, 'user-1', 'cloud_backup', true);
    expect(result.ok).toBe(true);
    expect(result.consentGiven).toBe(true);
  });
});

describe('isAdmin', () => {
  it('returns true when user has admin role', async () => {
    const adminClient = mockAdminClient();
    const result = await isAdmin(adminClient as any, 'user-1', 'admin');
    expect(result).toBe(true);
  });

  it('returns false when user has no admin role', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }),
    };
    const result = await isAdmin(adminClient as any, 'user-1', 'admin');
    expect(result).toBe(false);
  });
});

describe('adminLookupUser', () => {
  it('returns user profile', async () => {
    const adminClient = mockAdminClient();
    const result = await adminLookupUser(adminClient as any, 'admin-1', 'user-1', 'admin');
    expect(result.ok).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('test@example.com');
  });
});

describe('adminAdjustCredits', () => {
  it('adjusts credits', async () => {
    const adminClient = mockAdminClient();
    const result = await adminAdjustCredits(
      adminClient as any,
      'admin-1',
      'user-1',
      500,
      'Test adjustment',
      'idem-key-1',
      'billing',
    );
    expect(result.ok).toBe(true);
    expect(result.amountCents).toBe(500);
  });
});

describe('adminRevokeDevice', () => {
  it('revokes a device', async () => {
    const adminClient = mockAdminClient();
    const result = await adminRevokeDevice(
      adminClient as any,
      'admin-1',
      'dev-1',
      'user-1',
      'Test revocation',
      'admin',
    );
    expect(result.ok).toBe(true);
    expect(result.deviceId).toBe('dev-1');
  });
});

describe('listAdminAuditEvents', () => {
  it('returns audit events', async () => {
    const adminClient = mockAdminClient();
    const result = await listAdminAuditEvents(adminClient as any, 'admin-1', 'auditor');
    expect(result.ok).toBe(true);
    expect(result.auditEvents).toEqual([]);
  });
});
