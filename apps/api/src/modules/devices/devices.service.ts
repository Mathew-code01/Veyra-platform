import { type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * Generate a server-issued device credential hash.
 * The desktop stores this in OS-backed secure storage; it is never
 * derivable from local data, so a device cannot authorize itself
 * by modifying a local database.
 */
export function generateDeviceCredentialHash(installationId: string): string {
  return crypto.createHash('sha256').update(installationId + 'veyra-device-credential').digest('hex');
}

/**
 * Register a new device. Creates a device record with is_authorized=false.
 * Authorization must be granted server-side (see authorizeDevice).
 * Returns the device credential hash to be stored in OS secure storage.
 */
export async function registerDevice(
  adminClient: SupabaseClient,
  userId: string,
  installationId: string,
  deviceName?: string,
  platform?: string,
) {
  const credentialHash = generateDeviceCredentialHash(installationId);

  const { data, error } = await adminClient
    .from('devices')
    .insert({
      user_id: userId,
      installation_id: installationId,
      device_name: deviceName ?? null,
      platform: platform ?? null,
      device_credential_hash: credentialHash,
      is_authorized: false,
      is_revoked: false,
    })
    .select('id, installation_id, device_name, platform, is_authorized, is_revoked, last_seen_at, created_at')
    .single();

  if (error) throw error;

  return {
    device: {
      id: data.id,
      installationId: data.installation_id,
      deviceName: data.device_name ?? undefined,
      platform: data.platform ?? undefined,
      isAuthorized: data.is_authorized,
      isRevoked: data.is_revoked,
      lastSeenAt: data.last_seen_at ?? undefined,
      createdAt: data.created_at,
    },
    deviceCredentialHash: credentialHash,
  };
}

/**
 * List devices for the authenticated user.
 */
export async function listDevices(userClient: SupabaseClient, userId: string) {
  const { data, error } = await userClient
    .from('devices')
    .select('id, installation_id, device_name, platform, is_authorized, is_revoked, last_seen_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    devices: (data ?? []).map((d) => ({
      id: d.id,
      installationId: d.installation_id,
      deviceName: d.device_name ?? undefined,
      platform: d.platform ?? undefined,
      isAuthorized: d.is_authorized,
      isRevoked: d.is_revoked,
      lastSeenAt: d.last_seen_at ?? undefined,
      createdAt: d.created_at,
    })),
  };
}

/**
 * Authorize a device (server-side operation). Sets is_authorized=true.
 * Only callable via trusted server code with service_role.
 */
export async function authorizeDevice(adminClient: SupabaseClient, deviceId: string) {
  const { data, error } = await adminClient
    .from('devices')
    .update({ is_authorized: true })
    .eq('id', deviceId)
    .select('id, installation_id, device_name, platform, is_authorized, is_revoked, last_seen_at, created_at')
    .single();

  if (error) throw error;

  return {
    device: {
      id: data.id,
      installationId: data.installation_id,
      deviceName: data.device_name ?? undefined,
      platform: data.platform ?? undefined,
      isAuthorized: data.is_authorized,
      isRevoked: data.is_revoked,
      lastSeenAt: data.last_seen_at ?? undefined,
      createdAt: data.created_at,
    },
  };
}

/**
 * Revoke a device. Sets is_revoked=true and is_authorized=false.
 */
export async function revokeDevice(adminClient: SupabaseClient, deviceId: string, userId: string) {
  const { data, error } = await adminClient
    .from('devices')
    .update({ is_revoked: true, is_authorized: false })
    .eq('id', deviceId)
    .eq('user_id', userId)
    .select('id, is_authorized, is_revoked')
    .single();

  if (error) throw error;

  return {
    device: {
      id: data.id,
      isAuthorized: data.is_authorized,
      isRevoked: data.is_revoked,
    },
  };
}

/**
 * Update device last_seen timestamp.
 */
export async function updateDeviceLastSeen(adminClient: SupabaseClient, deviceId: string) {
  await adminClient.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);
}
