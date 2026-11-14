import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import crypto from 'crypto';

/**
 * Create a short-lived download authorization for a module version.
 * Returns a signed authorization token and download URL.
 * Server-side only.
 */
export async function createDownloadAuthorization(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
  moduleVersionId: string,
  ttlSeconds: number = 300,
) {
  // Verify the module version exists and is available
  const { data: version, error: verError } = await userClient
    .from('module_versions')
    .select('id, package_location, package_hash_sha256')
    .eq('id', moduleVersionId)
    .single();

  if (verError || !version) {
    return { ok: false, error: 'Module version not found' };
  }

  if (!version.package_location) {
    return { ok: false, error: 'No package location available' };
  }

  // Generate authorization token
  const authorizationToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Create download authorization record
  const { error: authError } = await adminClient
    .from('download_authorization')
    .insert({
      user_id: userId,
      module_version_id: moduleVersionId,
      authorization_token: authorizationToken,
      expires_at: expiresAt,
    });

  if (authError) throw authError;

  // Generate short-lived download URL
  // In production, this would be a signed URL from object storage (R2, etc.)
  const downloadUrl = `${version.package_location}?token=${authorizationToken}`;

  return {
    ok: true,
    authorizationToken,
    expiresAt,
    downloadUrl,
    packageHash: version.package_hash_sha256 ?? undefined,
  };
}

/**
 * Verify a download authorization token.
 */
export async function verifyDownloadAuthorization(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  token: string,
) {
  const { data, error } = await adminClient
    .from('download_authorization')
    .select('*, module_versions(package_hash_sha256)')
    .eq('authorization_token', token)
    .single();

  if (error || !data) {
    return { ok: false, error: 'Invalid or expired authorization token' };
  }

  if (data.is_revoked || data.is_used) {
    return { ok: false, error: 'Authorization token already used or revoked' };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { ok: false, error: 'Authorization token expired' };
  }

  return {
    ok: true,
    packageHash: data.module_versions?.package_hash_sha256 ?? undefined,
  };
}

/**
 * Mark a download authorization as used.
 */
export async function markDownloadUsed(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  token: string,
) {
  await adminClient
    .from('download_authorization')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('authorization_token', token);
}

/**
 * Record a download audit event.
 */
export async function recordDownloadAudit(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  params: {
    userId?: string;
    moduleVersionId?: string;
    authorizationToken?: string;
    ipAddress?: string;
    userAgent?: string;
    bytesDownloaded?: number;
    success: boolean;
    errorMessage?: string;
  },
) {
  await adminClient
    .from('download_audit')
    .insert({
      user_id: params.userId ?? null,
      module_version_id: params.moduleVersionId ?? null,
      authorization_token: params.authorizationToken ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      bytes_downloaded: params.bytesDownloaded ?? null,
      success: params.success,
      error_message: params.errorMessage ?? null,
    });
}

/**
 * List download audit events for a user.
 */
export async function listDownloadAudit(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
) {
  const { data, error } = await userClient
    .from('download_audit')
    .select('id, module_version_id, downloaded_at, success, error_message')
    .eq('user_id', userId)
    .order('downloaded_at', { ascending: false });

  if (error) throw error;

  return {
    audits: (data ?? []).map((a) => ({
      id: a.id,
      moduleVersionId: a.module_version_id ?? undefined,
      downloadedAt: a.downloaded_at,
      success: a.success,
      errorMessage: a.error_message ?? undefined,
    })),
  };
}
