import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Check for the latest compatible release for a given platform/architecture.
 * Returns release metadata and authorized download references.
 * Desktop verifies package and signed metadata before applying.
 */
export async function checkForUpdate(
  userClient: ReturnType<typeof getSupabaseUser>,
  params: {
    platform: 'windows' | 'macos' | 'linux';
    architecture: 'x64' | 'arm64';
    currentVersion: string;
    channel: string;
  },
) {
  const { platform, architecture, currentVersion, channel } = params;

  // Get the channel
  const { data: channelData, error: channelError } = await userClient
    .from('update_channels')
    .select('id, channel_id, name, is_active')
    .eq('channel_id', channel)
    .eq('is_active', true)
    .single();

  if (channelError || !channelData) {
    return {
      ok: true,
      updateAvailable: false,
      release: undefined,
      assets: [],
    };
  }

  // Get releases for this channel, platform, architecture
  // Filter by version >= currentVersion (simple semver comparison)
  const { data: releases, error: releaseError } = await userClient
    .from('desktop_releases')
    .select('*')
    .eq('channel_id', channelData.id)
    .eq('platform', platform)
    .eq('architecture', architecture)
    .order('version', { ascending: false });

  if (releaseError) throw releaseError;

  // Find the first release that is newer than currentVersion
  // Simple string comparison works for semver-like versions
  let latestRelease = null;
  for (const release of releases ?? []) {
    if (isVersionGreater(release.version, currentVersion)) {
      latestRelease = release;
      break;
    }
  }

  if (!latestRelease) {
    return {
      ok: true,
      updateAvailable: false,
      release: undefined,
      assets: [],
    };
  }

  // Get release assets
  const { data: assets, error: assetError } = await userClient
    .from('release_assets')
    .select('id, asset_id, asset_type, package_url, package_hash_sha256, package_size_bytes, signed_metadata, signature, created_at')
    .eq('release_id', latestRelease.id);

  if (assetError) throw assetError;

  return {
    ok: true,
    updateAvailable: true,
    release: {
      id: latestRelease.id,
      channelId: latestRelease.channel_id,
      channelIdText: channel,
      version: latestRelease.version,
      platform: latestRelease.platform,
      architecture: latestRelease.architecture,
      minSupportedVersion: latestRelease.min_supported_version ?? undefined,
      isMandatory: latestRelease.is_mandatory,
      rolloutPercentage: latestRelease.rollout_percentage,
      releaseNotes: latestRelease.release_notes ?? undefined,
      isRollbackCompatible: latestRelease.is_rollback_compatible,
      createdAt: latestRelease.created_at,
    },
    assets: (assets ?? []).map((a) => ({
      id: a.id,
      assetId: a.asset_id,
      assetType: a.asset_type,
      packageUrl: a.package_url,
      packageHashSha256: a.package_hash_sha256,
      packageSizeBytes: a.package_size_bytes ?? undefined,
      signedMetadata: a.signed_metadata ?? undefined,
      createdAt: a.created_at,
    })),
  };
}

/**
 * Simple semver comparison: returns true if v1 > v2.
 */
function isVersionGreater(v1: string, v2: string): boolean {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

/**
 * List all release channels.
 */
export async function listReleaseChannels(
  userClient: ReturnType<typeof getSupabaseUser>,
) {
  const { data, error } = await userClient
    .from('update_channels')
    .select('id, channel_id, name, description, is_active, created_at')
    .eq('is_active', true)
    .order('channel_id', { ascending: true });

  if (error) throw error;

  return {
    channels: (data ?? []).map((c) => ({
      id: c.id,
      channelId: c.channel_id,
      name: c.name,
      description: c.description ?? undefined,
      isActive: c.is_active,
      createdAt: c.created_at,
    })),
  };
}

/**
 * List releases (admin operation).
 */
export async function listReleases(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
) {
  const { data, error } = await adminClient
    .from('desktop_releases')
    .select('*, update_channels(channel_id, name)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    releases: (data ?? []).map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      channelIdText: r.update_channels?.channel_id ?? 'unknown',
      version: r.version,
      platform: r.platform,
      architecture: r.architecture,
      minSupportedVersion: r.min_supported_version ?? undefined,
      isMandatory: r.is_mandatory,
      rolloutPercentage: r.rollout_percentage,
      releaseNotes: r.release_notes ?? undefined,
      isRollbackCompatible: r.is_rollback_compatible,
      createdAt: r.created_at,
    })),
  };
}

/**
 * Seed development release data.
 * Only callable via trusted server code with service_role.
 * These are DEVELOPMENT FIXTURES ONLY.
 */
export async function seedDevReleases(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
) {
  // Create channels
  const channels = [
    { channel_id: 'stable', name: 'Stable', description: 'Stable release channel' },
    { channel_id: 'beta', name: 'Beta', description: 'Beta release channel' },
  ];

  for (const ch of channels) {
    await adminClient
      .from('update_channels')
      .upsert(ch, { onConflict: 'channel_id' });
  }

  // Get channel IDs
  const { data: stableChannel } = await adminClient
    .from('update_channels')
    .select('id')
    .eq('channel_id', 'stable')
    .single();

  const { data: betaChannel } = await adminClient
    .from('update_channels')
    .select('id')
    .eq('channel_id', 'beta')
    .single();

  if (!stableChannel || !betaChannel) throw new Error('Failed to create channels');

  // Create releases
  const releases = [
    {
      channel_id: stableChannel.id,
      version: '1.0.0',
      platform: 'windows',
      architecture: 'x64',
      min_supported_version: '0.9.0',
      is_mandatory: false,
      rollout_percentage: 100,
      release_notes: 'Initial stable release',
      is_rollback_compatible: true,
    },
    {
      channel_id: stableChannel.id,
      version: '1.0.0',
      platform: 'macos',
      architecture: 'x64',
      min_supported_version: '0.9.0',
      is_mandatory: false,
      rollout_percentage: 100,
      release_notes: 'Initial stable release',
      is_rollback_compatible: true,
    },
    {
      channel_id: stableChannel.id,
      version: '1.0.0',
      platform: 'linux',
      architecture: 'x64',
      min_supported_version: '0.9.0',
      is_mandatory: false,
      rollout_percentage: 100,
      release_notes: 'Initial stable release',
      is_rollback_compatible: true,
    },
    {
      channel_id: betaChannel.id,
      version: '1.1.0-beta.1',
      platform: 'windows',
      architecture: 'x64',
      min_supported_version: '0.9.0',
      is_mandatory: false,
      rollout_percentage: 50,
      release_notes: 'Beta release with new features',
      is_rollback_compatible: true,
    },
  ];

  for (const rel of releases) {
    await adminClient.from('desktop_releases').upsert(rel, {
      onConflict: 'channel_id, platform, architecture, version',
    });
  }

  return { seeded: releases.length };
}
