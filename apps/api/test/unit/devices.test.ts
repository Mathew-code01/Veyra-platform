import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateDeviceCredentialHash,
  registerDevice,
  listDevices,
  authorizeDevice,
  revokeDevice,
  updateDeviceLastSeen,
} from '../../src/modules/devices/devices.service.js';

// Mock Supabase client
const mockAdminClient = {
  from: vi.fn(() => mockQueryBuilder()),
};

function mockQueryBuilder() {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('generateDeviceCredentialHash', () => {
  it('produces a deterministic hash for the same installation ID', () => {
    const h1 = generateDeviceCredentialHash('install-123');
    const h2 = generateDeviceCredentialHash('install-123');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64); // SHA-256 hex
  });

  it('produces different hashes for different installation IDs', () => {
    const h1 = generateDeviceCredentialHash('install-123');
    const h2 = generateDeviceCredentialHash('install-456');
    expect(h1).not.toBe(h2);
  });
});

describe('registerDevice', () => {
  it('creates a device with is_authorized=false and returns credential hash', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'dev-1',
        installation_id: 'install-123',
        device_name: 'My Device',
        platform: 'windows',
        is_authorized: false,
        is_revoked: false,
        last_seen_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mockAdminClient.from as any).mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const result = await registerDevice(mockAdminClient as any, 'user-1', 'install-123', 'My Device', 'windows');

    expect(result.device.isAuthorized).toBe(false);
    expect(result.device.isRevoked).toBe(false);
    expect(result.deviceCredentialHash).toBeDefined();
    expect(result.deviceCredentialHash.length).toBe(64);
  });

  it('throws on database error', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Duplicate installation ID' },
    });
    (mockAdminClient.from as any).mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    await expect(
      registerDevice(mockAdminClient as any, 'user-1', 'install-123'),
    ).rejects.toThrow('Duplicate installation ID');
  });
});

describe('authorizeDevice', () => {
  it('sets is_authorized=true', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'dev-1',
        installation_id: 'install-123',
        device_name: 'My Device',
        platform: 'windows',
        is_authorized: true,
        is_revoked: false,
        last_seen_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    (mockAdminClient.from as any).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const result = await authorizeDevice(mockAdminClient as any, 'dev-1');

    expect(result.device.isAuthorized).toBe(true);
  });
});

describe('revokeDevice', () => {
  it('sets is_revoked=true and is_authorized=false', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'dev-1',
        is_authorized: false,
        is_revoked: true,
      },
      error: null,
    });
    (mockAdminClient.from as any).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const result = await revokeDevice(mockAdminClient as any, 'dev-1', 'user-1');

    expect(result.device.isRevoked).toBe(true);
    expect(result.device.isAuthorized).toBe(false);
  });
});

describe('updateDeviceLastSeen', () => {
  it('calls update with last_seen_at', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    (mockAdminClient.from as any).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    });

    await updateDeviceLastSeen(mockAdminClient as any, 'dev-1');

    expect(mockAdminClient.from).toHaveBeenCalledWith('devices');
  });
});
