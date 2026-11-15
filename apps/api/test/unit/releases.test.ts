import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdate, listReleaseChannels, listReleases } from '../../src/modules/releases/releases.service.js';

// Mock Supabase user client - uses chain objects for proper method chaining
function mockUserClient() {
  const channelChain: any = {};
  channelChain.select = vi.fn().mockReturnValue(channelChain);
  channelChain.eq = vi.fn().mockReturnValue(channelChain);
  channelChain.single = vi.fn().mockResolvedValue({
    data: { id: 'ch-1', channel_id: 'stable', name: 'Stable', is_active: true },
    error: null,
  });
  const releasesChain: any = {};
  releasesChain.select = vi.fn().mockReturnValue(releasesChain);
  releasesChain.eq = vi.fn().mockReturnValue(releasesChain);
  releasesChain.order = vi.fn().mockReturnValue(releasesChain);
  releasesChain.then = vi.fn().mockImplementation((resolve) =>
    resolve({
      data: [
        {
          id: 'rel-1',
          channel_id: 'ch-1',
          version: '1.0.0',
          platform: 'windows',
          architecture: 'x64',
          min_supported_version: '0.9.0',
          is_mandatory: false,
          rollout_percentage: 100,
          release_notes: 'Initial release',
          is_rollback_compatible: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
  );
  const assetsChain: any = {};
  assetsChain.select = vi.fn().mockReturnValue(assetsChain);
  assetsChain.eq = vi.fn().mockReturnValue(assetsChain);
  assetsChain.then = vi.fn().mockImplementation((resolve) =>
    resolve({
      data: [
        {
          id: 'asset-1',
          asset_id: 'asset-1',
          asset_type: 'installer',
          package_url: 'https://storage.example.com/installer.exe',
          package_hash_sha256: 'abc123',
          package_size_bytes: 50000000,
          signed_metadata: 'signed-metadata',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
  );
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'update_channels') {
        return channelChain;
      }
      if (table === 'desktop_releases') {
        return releasesChain;
      }
      if (table === 'release_assets') {
        return assetsChain;
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

describe('checkForUpdate', () => {
  it('returns update available when newer version exists', async () => {
    const userClient = mockUserClient();
    const result = await checkForUpdate(userClient as any, {
      platform: 'windows',
      architecture: 'x64',
      currentVersion: '0.9.0',
      channel: 'stable',
    });

    expect(result.ok).toBe(true);
    expect(result.updateAvailable).toBe(true);
    expect(result.release).toBeDefined();
    expect(result.release?.version).toBe('1.0.0');
    expect(result.assets.length).toBe(1);
  });

  it('returns no update when current version is latest', async () => {
    const userClient = mockUserClient();
    const result = await checkForUpdate(userClient as any, {
      platform: 'windows',
      architecture: 'x64',
      currentVersion: '1.0.0',
      channel: 'stable',
    });

    expect(result.ok).toBe(true);
    expect(result.updateAvailable).toBe(false);
    expect(result.release).toBeUndefined();
    expect(result.assets).toEqual([]);
  });

  it('returns no update when channel not found', async () => {
    const chain = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    const userClient = {
      from: vi.fn().mockReturnValue(chain),
    } as any;
    const result = await checkForUpdate(userClient as any, {
      platform: 'windows',
      architecture: 'x64',
      currentVersion: '0.9.0',
      channel: 'nonexistent',
    });

    expect(result.ok).toBe(true);
    expect(result.updateAvailable).toBe(false);
  });
});

describe('listReleaseChannels', () => {
  it('returns active release channels', async () => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });
    const userClient = {
      from: vi.fn().mockReturnValue(chain),
    } as any;
    const result = await listReleaseChannels(userClient as any);
    expect(result.channels).toEqual([]);
  });
});

describe('listReleases', () => {
  it('returns releases list', async () => {
    const releaseChain: any = {};
    releaseChain.select = vi.fn().mockReturnValue(releaseChain);
    releaseChain.order = vi.fn().mockResolvedValue({ data: [], error: null });
    const adminClient = {
      from: vi.fn().mockReturnValue(releaseChain),
    } as any;
    const result = await listReleases(adminClient as any);
    expect(result.releases).toEqual([]);
  });
});
