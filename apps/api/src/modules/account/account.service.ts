import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';

export type AccountRole = 'admin' | 'support' | 'auditor' | 'billing';

/**
 * Check if a user has a specific admin role.
 * Server-side only.
 */
export async function hasAdminRole(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  role: AccountRole,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('admin_roles')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('role', role)
    .eq('is_active', true)
    .single();

  if (error || !data) return false;

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return false;
  }

  return true;
}

/**
 * Require admin role for an operation. Throws if not authorized.
 */
export async function requireAdminRole(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  role: AccountRole = 'admin',
): Promise<void> {
  const hasRole = await hasAdminRole(adminClient, userId, role);
  if (!hasRole) {
    throw new Error(`Admin role required: ${role}`);
  }
}

/**
 * Assign an admin role to a user.
 * Server-side only. Requires admin privileges.
 */
export async function assignRole(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  grantingAdminId: string,
  userId: string,
  role: AccountRole,
): Promise<{ granted: boolean }> {
  // Verify the granting admin has the 'admin' role
  const hasAdmin = await hasAdminRole(adminClient, grantingAdminId, 'admin');
  if (!hasAdmin) {
    throw new Error('Admin role required to assign roles');
  }

  // Check if role already exists
  const { data: existing } = await adminClient
    .from('admin_roles')
    .select('id, is_active')
    .eq('user_id', userId)
    .eq('role', role)
    .single();

  if (existing) {
    if (existing.is_active) {
      return { granted: false }; // Already active
    }
    // Reactivate
    const { error } = await adminClient
      .from('admin_roles')
      .update({ is_active: true, granted_by: grantingAdminId, granted_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) throw error;

    // Record audit event
    await adminClient.from('admin_audit_events').insert({
      admin_user_id: grantingAdminId,
      target_user_id: userId,
      action: 'role_reactivated',
      target_type: 'role',
      target_id: userId,
      metadata: { role },
    });

    return { granted: true };
  }

  // Create new role assignment
  const { error } = await adminClient
    .from('admin_roles')
    .insert({
      user_id: userId,
      role,
      granted_by: grantingAdminId,
      granted_at: new Date().toISOString(),
      is_active: true,
    });

  if (error) throw error;

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: grantingAdminId,
    target_user_id: userId,
    action: 'role_assigned',
    target_type: 'role',
    target_id: userId,
    metadata: { role },
  });

  return { granted: true };
}

/**
 * Revoke an admin role from a user.
 * Server-side only.
 */
export async function revokeRole(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  grantingAdminId: string,
  userId: string,
  role: AccountRole,
): Promise<{ revoked: boolean }> {
  const hasAdmin = await hasAdminRole(adminClient, grantingAdminId, 'admin');
  if (!hasAdmin) {
    throw new Error('Admin role required to revoke roles');
  }

  const { error } = await adminClient
    .from('admin_roles')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('role', role)
    .eq('is_active', true);

  if (error) throw error;

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: grantingAdminId,
    target_user_id: userId,
    action: 'role_revoked',
    target_type: 'role',
    target_id: userId,
    metadata: { role },
  });

  return { revoked: true };
}

/**
 * List roles for a user.
 */
export async function listUserRoles(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<Array<{ id: string; role: string; isActive: boolean; grantedAt: string; grantedBy: string | null }>> {
  const { data, error } = await adminClient
    .from('admin_roles')
    .select('id, role, is_active, granted_at, granted_by')
    .eq('user_id', userId)
    .order('granted_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    role: r.role,
    isActive: r.is_active,
    grantedAt: r.granted_at,
    grantedBy: r.granted_by,
  }));
}

/**
 * Request account deletion. Marks account for deletion with status 'deleted'
 * and schedules data cleanup per retention policy.
 * Server-side only.
 */
export async function requestAccountDeletion(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  reason?: string,
): Promise<{
  accountId: string;
  status: string;
  deletionScheduledAt: string;
  dataRetentionDays: number;
}> {
  // Mark profile for deletion
  const deletionScheduledAt = new Date().toISOString();
  const dataRetentionDays = 30;

  const { data, error } = await adminClient
    .from('profiles')
    .update({
      status: 'deleted',
      deleted_at: deletionScheduledAt,
    })
    .eq('id', userId)
    .select('id, status, deleted_at')
    .single();

  if (error) throw error;

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: userId,
    target_user_id: userId,
    action: 'account_deletion_requested',
    target_type: 'account',
    target_id: userId,
    metadata: { reason, deletionScheduledAt, dataRetentionDays },
  });

  return {
    accountId: data.id,
    status: data.status,
    deletionScheduledAt: data.deleted_at,
    dataRetentionDays,
  };
}

/**
 * Get account status for a user.
 */
export async function getAccountStatus(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
): Promise<{
  id: string;
  email: string;
  status: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}> {
  const { data, error } = await userClient
    .from('profiles')
    .select('id, email, status, locale, created_at, updated_at, deleted_at')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    email: data.email,
    status: data.status,
    locale: data.locale,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    deletedAt: data.deleted_at,
  };
}

/**
 * Record an account audit event.
 */
export async function recordAccountAuditEvent(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  targetUserId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    target_type: 'account',
    target_id: targetUserId,
    metadata,
  });
}
