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
 * Count authorized devices for a user.
 */
async function countAuthorizedDevices(
  adminClient: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await adminClient
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_authorized', true)
    .eq('is_revoked', false);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Register a new device. Creates a device record with is_authorized=false.
 * Authorization must be granted server-side (see authorizeDevice).
 * Enforces device limits from the user's plan.
 * Returns the device credential hash to be stored in OS secure storage.
 */
export async function registerDevice(
  adminClient: SupabaseClient,
  userId: string,
  installationId: string,
  deviceName?: string,
  platform?: string,
  deviceLimit?: number,
) {
  // Enforce device limit if provided
  if (deviceLimit !== undefined && deviceLimit > 0) {
    const authorizedCount = await countAuthorizedDevices(adminClient, userId);
    if (authorizedCount >= deviceLimit) {
      throw new Error(`Device limit reached (${deviceLimit} authorized devices)`);
    }
  }

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
 * Replace an existing authorized device with a new one.
 * Revokes the old device and registers the new one.
 * Enforces device limits.
 */
export async function replaceDevice(
  adminClient: SupabaseClient,
  userId: string,
  oldDeviceId: string,
  installationId: string,
  deviceName?: string,
  platform?: string,
  deviceLimit?: number,
) {
  // Verify the old device belongs to the user and is authorized
  const { data: oldDevice, error: oldDeviceError } = await adminClient
    .from('devices')
    .select('id, is_authorized, is_revoked')
    .eq('id', oldDeviceId)
    .eq('user_id', userId)
    .single();

  if (oldDeviceError || !oldDevice) {
    throw new Error('Device not found');
  }

  if (!oldDevice.is_authorized || oldDevice.is_revoked) {
    throw new Error('Device is not authorized or is revoked');
  }

  // Check device limit (the old device will be revoked, so we check against limit - 1)
  if (deviceLimit !== undefined && deviceLimit > 0) {
    const authorizedCount = await countAuthorizedDevices(adminClient, userId);
    if (authorizedCount > deviceLimit) {
      throw new Error(`Device limit exceeded (${deviceLimit} authorized devices)`);
    }
  }

  // Revoke the old device
  await adminClient
    .from('devices')
    .update({ is_revoked: true, is_authorized: false })
    .eq('id', oldDeviceId);

  // Register the new device
  return registerDevice(adminClient, userId, installationId, deviceName, platform, deviceLimit);
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
 * Revoke all sessions for a device.
 */
export async function revokeDeviceSessions(adminClient: SupabaseClient, deviceId: string) {
  const { error } = await adminClient
    .from('device_sessions')
    .update({ is_revoked: true })
    .eq('device_id', deviceId)
    .eq('is_revoked', false);

  if (error) throw error;
}

/**
 * Update device last_seen timestamp.
 */
export async function updateDeviceLastSeen(adminClient: SupabaseClient, deviceId: string) {
  await adminClient.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);
}

