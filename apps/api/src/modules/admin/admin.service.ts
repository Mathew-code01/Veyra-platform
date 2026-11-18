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
 * Alias for isAdmin - used by payment routes for authorization checks.
 */
export const hasAdminRole = isAdmin;

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
 * List all users (admin operation).
 */
export async function adminListUsers(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  role: AdminRole = 'admin',
  page: number = 1,
  pageSize: number = 50,
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const offset = (page - 1) * pageSize;

  const { data, error, count } = await adminClient
    .from('profiles')
    .select('id, email, display_name, locale, status, created_at, updated_at, deleted_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  return {
    ok: true,
    users: (data ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name ?? undefined,
      status: u.status,
      locale: u.locale,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      deletedAt: u.deleted_at,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Get subscription details for any user (admin operation).
 */
export async function adminGetSubscription(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  targetUserId: string,
  role: AdminRole = 'admin',
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const { data, error } = await adminClient
    .from('subscriptions')
    .select('id, plan_id, billing_interval, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, provider_subscription_id, created_at, updated_at')
    .eq('user_id', targetUserId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { ok: true, subscription: null };
    }
    throw error;
  }

  return {
    ok: true,
    subscription: {
      id: data.id,
      planId: data.plan_id,
      billingInterval: data.billing_interval,
      status: data.status,
      currentPeriodStart: data.current_period_start,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      canceledAt: data.canceled_at ?? undefined,
      trialStart: data.trial_start ?? undefined,
      trialEnd: data.trial_end ?? undefined,
      providerSubscriptionId: data.provider_subscription_id ?? undefined,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * List payment transactions (admin operation).
 */
export async function adminListPaymentTransactions(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  role: AdminRole = 'billing',
  page: number = 1,
  pageSize: number = 50,
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const offset = (page - 1) * pageSize;

  const { data, error, count } = await adminClient
    .from('payment_transactions')
    .select('id, subscription_id, customer_id, amount_cents, currency, status, provider_transaction_id, payment_date, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  return {
    ok: true,
    transactions: (data ?? []).map((t) => ({
      id: t.id,
      subscriptionId: t.subscription_id,
      customerId: t.customer_id ?? undefined,
      amountCents: t.amount_cents,
      currency: t.currency,
      status: t.status,
      providerTransactionId: t.provider_transaction_id ?? undefined,
      paymentDate: t.payment_date,
      createdAt: t.created_at,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * List all admin audit events with pagination (admin operation).
 */
export async function listAdminAuditEventsPaginated(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  role: AdminRole = 'auditor',
  page: number = 1,
  pageSize: number = 50,
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const offset = (page - 1) * pageSize;

  const { data, error, count } = await adminClient
    .from('admin_audit_events')
    .select('id, admin_user_id, target_user_id, action, target_type, target_id, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

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
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Get platform statistics (admin operation).
 */
export async function adminStats(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  role: AdminRole = 'admin',
) {
  // Verify admin access
  if (!(await isAdmin(adminClient, adminUserId, role))) {
    return { ok: false, error: 'Admin access required' };
  }

  const { data: profiles } = await adminClient.from('profiles').select('id, status').select('id, status');
  const { data: subscriptions } = await adminClient.from('subscriptions').select('id, status');
  const { data: paymentTransactions } = await adminClient.from('payment_transactions').select('amount_cents, status');
  const { data: creditLedger } = await adminClient.from('credit_ledger_transactions').select('amount_cents');

  const totalUsers = profiles?.length ?? 0;
  const totalSubscriptions = subscriptions?.length ?? 0;
  const activeSubscriptions = subscriptions?.filter((s) => s.status === 'active').length ?? 0;
  const totalRevenueCents = paymentTransactions?.filter((t) => t.status === 'succeeded').reduce((sum, t) => sum + t.amount_cents, 0) ?? 0;
  const totalCreditsIssued = creditLedger?.filter((t) => t.amount_cents > 0).reduce((sum, t) => sum + t.amount_cents, 0) ?? 0;

  return {
    ok: true,
    stats: {
      totalUsers,
      totalSubscriptions,
      activeSubscriptions,
      totalRevenueCents,
      totalCreditsIssued,
    },
  };
}
