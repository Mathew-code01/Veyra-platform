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
  listAdminAuditEventsPaginated,
} from '../../src/modules/admin/admin.service.js';
import { loadEnv, resetEnv } from '../../src/config/env.js';

// Mock Supabase admin client
function mockAdminClient() {
  const backupChain: any = {};
  backupChain.select = vi.fn().mockReturnValue(backupChain);
  backupChain.eq = vi.fn().mockReturnValue(backupChain);
  backupChain.single = vi.fn().mockResolvedValue({
    data: null,
    error: { code: 'PGRST116' },
  });
  const backupUpsertChain: any = {};
  backupUpsertChain.select = vi.fn().mockReturnValue(backupUpsertChain);
  backupUpsertChain.single = vi.fn().mockResolvedValue({
    data: { id: 'bm-1', user_id: 'user-1', backup_category: 'account_data' },
    error: null,
  });
  backupChain.upsert = vi.fn().mockReturnValue(backupUpsertChain);
  const backupDeleteChain: any = {};
  backupDeleteChain.eq = vi.fn().mockReturnValue(backupDeleteChain);
  backupChain.delete = vi.fn().mockReturnValue(backupDeleteChain);

  const consentChain: any = {};
  consentChain.select = vi.fn().mockReturnValue(consentChain);
  consentChain.eq = vi.fn().mockReturnValue(consentChain);
  consentChain.single = vi.fn().mockResolvedValue({
    data: null,
    error: { code: 'PGRST116' },
  });
  const consentUpsertChain: any = {};
  consentUpsertChain.select = vi.fn().mockReturnValue(consentUpsertChain);
  consentUpsertChain.single = vi.fn().mockResolvedValue({
    data: {
      id: 'cr-1',
      user_id: 'user-1',
      consent_category: 'cloud_backup',
      consent_given: true,
      consent_timestamp: new Date().toISOString(),
      consent_withdrawn: false,
      withdrawn_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    error: null,
  });
  consentChain.upsert = vi.fn().mockReturnValue(consentUpsertChain);

  const adminRolesChain: any = {};
  adminRolesChain.select = vi.fn().mockReturnValue(adminRolesChain);
  adminRolesChain.eq = vi.fn().mockReturnValue(adminRolesChain);
  adminRolesChain.range = vi.fn().mockReturnValue(adminRolesChain);
  adminRolesChain.single = vi.fn().mockResolvedValue({
    data: { id: 'ar-1', expires_at: null },
    error: null,
  });

  const profilesChain: any = {};
  profilesChain.select = vi.fn().mockReturnValue(profilesChain);
  profilesChain.eq = vi.fn().mockReturnValue(profilesChain);
  profilesChain.range = vi.fn().mockReturnValue(profilesChain);
  profilesChain.single = vi.fn().mockResolvedValue({
    data: {
      id: 'user-1',
      email: 'test@example.com',
      display_name: 'Test User',
      locale: 'en',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    },
    error: null,
  });

  const creditChain: any = {};
  creditChain.select = vi.fn().mockReturnValue(creditChain);
  creditChain.eq = vi.fn().mockReturnValue(creditChain);
  creditChain.range = vi.fn().mockReturnValue(creditChain);
  creditChain.single = vi.fn().mockResolvedValue({
    data: { id: 'ca-1', balance_cents: 1000 },
    error: null,
  });
  creditChain.insert = vi.fn().mockReturnValue(creditChain);
  creditChain.update = vi.fn().mockReturnValue(creditChain);

  const creditLedgerChain: any = {};
  creditLedgerChain.select = vi.fn().mockReturnValue(creditLedgerChain);
  creditLedgerChain.eq = vi.fn().mockReturnValue(creditLedgerChain);
  creditLedgerChain.range = vi.fn().mockReturnValue(creditLedgerChain);
  creditLedgerChain.single = vi.fn().mockResolvedValue({
    data: null,
    error: { code: 'PGRST116' },
  });
  creditLedgerChain.insert = vi.fn().mockResolvedValue({ error: null });

  const devicesChain: any = {};
  devicesChain.select = vi.fn().mockReturnValue(devicesChain);
  devicesChain.eq = vi.fn().mockReturnValue(devicesChain);
  devicesChain.range = vi.fn().mockReturnValue(devicesChain);
  devicesChain.single = vi.fn().mockResolvedValue({
    data: {
      id: 'dev-1',
      user_id: 'user-1',
      is_authorized: true,
      is_revoked: false,
    },
    error: null,
  });
  devicesChain.update = vi.fn().mockReturnValue(devicesChain);

  const auditChain: any = {};
  auditChain.select = vi.fn().mockReturnValue(auditChain);
  auditChain.eq = vi.fn().mockReturnValue(auditChain);
  auditChain.range = vi.fn().mockReturnValue(auditChain);
  auditChain.insert = vi.fn().mockResolvedValue({ error: null });
  auditChain.order = vi.fn().mockReturnValue(auditChain);
  auditChain.limit = vi.fn().mockResolvedValue({ data: [], error: null });

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'backup_metadata') {
        return backupChain;
      }
      if (table === 'user_consent_records') {
        return consentChain;
      }
      if (table === 'admin_roles') {
        return adminRolesChain;
      }
      if (table === 'profiles') {
        return profilesChain;
      }
      if (table === 'credit_accounts') {
        return creditChain;
      }
      if (table === 'credit_ledger_transactions') {
        return creditLedgerChain;
      }
      if (table === 'devices') {
        return devicesChain;
      }
      if (table === 'admin_audit_events') {
        return auditChain;
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

  it('sets backup metadata', async () => {
    const adminClient = mockAdminClient();
    const result = await setBackupMetadata(adminClient as any, 'user-1', 'account_data', {
      encryptionEnabled: true,
      retentionDays: 30,
      status: 'active',
    });
    expect(result.backupCategory).toBe('account_data');
  });

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

  it('sets consent record', async () => {
    const adminClient = mockAdminClient();
    const result = await setConsentRecord(adminClient as any, 'user-1', 'cloud_backup', true);
    expect(result.consentCategory).toBe('cloud_backup');
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
    const result = await listAdminAuditEventsPaginated(adminClient as any, 'admin-1', 'auditor');
    expect(result.ok).toBe(true);
    expect(result.auditEvents).toEqual([]);
  });
});
