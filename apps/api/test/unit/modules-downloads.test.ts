import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listModules, listModuleVersions } from '../../src/modules/modules/module-catalogue.service.js';
import {
  createDownloadAuthorization,
  verifyDownloadAuthorization,
  markDownloadUsed,
  recordDownloadAudit,
  listDownloadAudit,
} from '../../src/modules/downloads/download-authorization.service.js';

// Mock Supabase user client - uses chain objects for proper method chaining
function mockUserClient() {
  const catalogueChain = {
    select: vi.fn().mockReturnValue(catalogueChain),
    eq: vi.fn().mockReturnValue(catalogueChain),
    order: vi.fn().mockReturnValue(catalogueChain),
    then: vi.fn().mockImplementation((resolve) =>
      resolve({
        data: [
          {
            id: 'mod-1',
            module_id: 'stt-whisper-small',
            name: 'Whisper Small',
            description: 'STT module',
            category: 'speech-to-text',
            is_active: true,
            is_deprecated: false,
            deprecation_date: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      })
    ),
  };
  const versionsChain = {
    select: vi.fn().mockReturnValue(versionsChain),
    eq: vi.fn().mockReturnValue(versionsChain),
    order: vi.fn().mockReturnValue(versionsChain),
    then: vi.fn().mockImplementation((resolve) =>
      resolve({
        data: [
          {
            id: 'ver-1',
            version: '1.0.0',
            supported_os: ['windows', 'macos', 'linux'],
            cpu_requirements: 'x64',
            memory_requirements_mb: 2048,
            gpu_requirements: null,
            vram_requirements_mb: null,
            runtime_requirements: 'Node.js 20',
            capability_declarations: { transcription: true },
            package_size_bytes: 50000000,
            package_hash_sha256: 'abc123',
            compatibility_constraints: { minRamGb: 4 },
            release_status: 'stable',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      })
    ),
  };
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'module_catalogue') {
        return catalogueChain;
      }
      if (table === 'module_versions') {
        return versionsChain;
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

describe('listModules', () => {
  it('returns module catalogue entries', async () => {
    const userClient = mockUserClient();
    const result = await listModules(userClient as any);
    expect(result.modules.length).toBe(1);
    expect(result.modules[0].moduleId).toBe('stt-whisper-small');
  });
});

describe('listModuleVersions', () => {
  it('returns module versions', async () => {
    const userClient = mockUserClient();
    const result = await listModuleVersions(userClient as any, 'stt-whisper-small');
    expect(result.moduleId).toBe('stt-whisper-small');
    expect(result.versions.length).toBe(1);
    expect(result.versions[0].version).toBe('1.0.0');
  });
});

// Mock Supabase admin client for download tests
function mockAdminClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'module_versions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'ver-1',
              package_location: 'https://storage.example.com/pkg',
              package_hash_sha256: 'abc123',
            },
            error: null,
          }),
        };
      }
      if (table === 'download_authorization') {
        const chain = {
          select: vi.fn().mockReturnValue(chain),
          insert: vi.fn().mockReturnValue(chain),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'auth-1',
              user_id: 'user-1',
              module_version_id: 'ver-1',
              authorization_token: 'tok-1',
              expires_at: new Date(Date.now() + 300000).toISOString(),
              is_used: false,
              used_at: null,
            },
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'download_audit') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    }),
  };
}

describe('createDownloadAuthorization', () => {
  it('creates a download authorization', async () => {
    const adminClient = mockAdminClient();
    const userClient = mockUserClient();

    const result = await createDownloadAuthorization(
      adminClient as any,
      userClient as any,
      'user-1',
      'ver-1',
    );

    expect(result.ok).toBe(true);
    expect(result.authorizationToken).toBeDefined();
    expect(result.downloadUrl).toBeDefined();
    expect(result.packageHash).toBe('abc123');
  });
});

describe('listDownloadAudit', () => {
  it('returns download audit events', async () => {
    const userClient = mockUserClient();
    const result = await listDownloadAudit(userClient as any, 'user-1');
    expect(result.audits).toEqual([]);
  });
});
