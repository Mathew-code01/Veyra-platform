import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Admin service - protected administrative operations.
 * Admin access based on verified server-side roles only.
 * All sensitive operations create audit events.
 * No public admin endpoint.
 */

export type AdminRole = 'admin' | 'support' | 'auditor' | 'billing';

/**
 * Check if a user has admin role.
 */
export async function isAdmin(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  role: AdminRole = 'admin',
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
 * Look up a user (admin operation).
 */
export async function adminLookupUser(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  targetUserId: string,
  role: AdminRole,
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, email, display_name, locale, status, created_at')
    .eq('id', targetUserId)
    .single();

  if (error || !data) {
    return { ok: false, error: 'User not found' };
  }

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action: 'user_lookup',
    target_type: 'user',
    target_id: targetUserId,
    metadata: { role },
  });

  return {
    ok: true,
    user: {
      id: data.id,
      email: data.email,
      displayName: data.display_name ?? undefined,
      status: data.status,
      locale: data.locale,
      createdAt: data.created_at,
    },
  };
}

/**
 * Adjust user credits (admin operation).
 */
export async function adminAdjustCredits(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  userId: string,
  amountCents: number,
  reason: string,
  idempotencyKey: string,
  role: AdminRole = 'billing',
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  // Check idempotency
  const { data: existing } = await adminClient
    .from('credit_ledger_transactions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (existing?.id) {
    return { ok: false, error: 'Idempotency key already used' };
  }

  // Get or create credit account
  const { data: account } = await adminClient
    .from('credit_accounts')
    .select('id, balance_cents')
    .eq('user_id', userId)
    .single();

  let creditAccountId: string;
  let currentBalance: number;

  if (account) {
    creditAccountId = account.id;
    currentBalance = account.balance_cents;
  } else {
    const { data: newAccount, error: createError } = await adminClient
      .from('credit_accounts')
      .insert({ user_id: userId, balance_cents: 0 })
      .select('id, balance_cents')
      .single();

    if (createError) throw createError;
    creditAccountId = newAccount.id;
    currentBalance = 0;
  }

  const newBalance = currentBalance + amountCents;

  // Update balance
  const { error: updateError } = await adminClient
    .from('credit_accounts')
    .update({ balance_cents: newBalance })
    .eq('id', creditAccountId);

  if (updateError) throw updateError;

  // Record ledger transaction
  const { error: ledgerError } = await adminClient
    .from('credit_ledger_transactions')
    .insert({
      user_id: userId,
      credit_account_id: creditAccountId,
      type: 'adjustment',
      amount_cents: amountCents,
      balance_after_cents: newBalance,
      idempotency_key: idempotencyKey,
      reference_type: 'admin_adjustment',
      reference_id: adminUserId,
      description: reason,
    });

  if (ledgerError) throw ledgerError;

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: userId,
    action: 'credit_adjustment',
    target_type: 'credit',
    target_id: creditAccountId,
    metadata: { amountCents, reason, idempotencyKey, role },
  });

  return {
    ok: true,
    userId,
    amountCents,
    newBalance,
  };
}

/**
 * Revoke a device (admin operation).
 */
export async function adminRevokeDevice(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  deviceId: string,
  targetUserId: string,
  reason: string,
  role: AdminRole = 'admin',
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  // Verify device belongs to target user
  const { data: device, error: deviceError } = await adminClient
    .from('devices')
    .select('id, user_id, is_authorized, is_revoked')
    .eq('id', deviceId)
    .eq('user_id', targetUserId)
    .single();

  if (deviceError || !device) {
    return { ok: false, error: 'Device not found' };
  }

  // Revoke device
  const { error: revokeError } = await adminClient
    .from('devices')
    .update({ is_revoked: true, is_authorized: false })
    .eq('id', deviceId);

  if (revokeError) throw revokeError;

  // Record audit event
  await adminClient.from('admin_audit_events').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action: 'device_revoke',
    target_type: 'device',
    target_id: deviceId,
    metadata: { reason, role },
  });

  return {
    ok: true,
    deviceId,
    userId: targetUserId,
  };
}

/**
 * List audit events (admin operation).
 */
export async function listAdminAuditEvents(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  role: AdminRole = 'auditor',
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const { data, error } = await adminClient
    .from('admin_audit_events')
    .select('id, admin_user_id, target_user_id, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return {
    ok: true,
    auditEvents: (data ?? []).map((e) => ({
      id: e.id,
      adminUserId: e.admin_user_id,
      targetUserId: e.target_user_id ?? undefined,
      action: e.action,
      targetType: e.target_type ?? undefined,
      targetId: e.target_id ?? undefined,
      metadata: e.metadata,
      createdAt: e.created_at,
    })),
  };
}
