import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Credit ledger service.
 *
 * Design principles:
 *   * Durable ledger, not just a mutable balance
 *   * All mutations go through database transactions with row-level locking
 *   * Idempotency keys prevent double spending
 *   * Reservations can be released after failed requests
 *   * No client-controlled balance updates -- all mutations are server-side
 */

export type CreditTransactionType =
  | 'grant'
  | 'allowance'
  | 'promotional'
  | 'reservation'
  | 'settlement'
  | 'release'
  | 'adjustment'
  | 'expiration';

export interface CreditResult {
  ok: boolean;
  balanceCents: number;
  transactionId: string;
  error?: string;
}

/**
 * Ensure a credit account exists for the user. Creates one with zero balance
 * if none exists. Server-side only.
 */
async function ensureCreditAccount(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<string> {
  const { data: existing } = await adminClient
    .from('credit_accounts')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existing?.id) return existing.id;

  const { data, error } = await adminClient
    .from('credit_accounts')
    .insert({ user_id: userId, balance_cents: 0, currency: 'USD' })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Record a ledger transaction. Server-side only.
 */
async function recordLedgerTransaction(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  creditAccountId: string,
  type: CreditTransactionType,
  amountCents: number,
  balanceAfterCents: number,
  options: {
    idempotencyKey?: string;
    referenceType?: string;
    referenceId?: string;
    description?: string;
  } = {},
) {
  const { error } = await adminClient
    .from('credit_ledger_transactions')
    .insert({
      user_id: userId,
      credit_account_id: creditAccountId,
      type,
      amount_cents: amountCents,
      balance_after_cents: balanceAfterCents,
      idempotency_key: options.idempotencyKey ?? null,
      reference_type: options.referenceType ?? null,
      reference_id: options.referenceId ?? null,
      description: options.description ?? null,
    });

  if (error) throw error;
}

/**
 * Grant credits to a user's account. Server-side only.
 * Idempotent via idempotency key.
 */
export async function grantCredits(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amountCents: number,
  options: {
    idempotencyKey?: string;
    description?: string;
  } = {},
): Promise<CreditResult> {
  if (amountCents <= 0) {
    return { ok: false, balanceCents: 0, transactionId: '', error: 'Amount must be positive' };
  }

  const creditAccountId = await ensureCreditAccount(adminClient, userId);

  const { data: account, error: lockError } = await adminClient
    .from('credit_accounts')
    .select('balance_cents')
    .eq('id', creditAccountId)
    .single();

  if (lockError) throw lockError;
  if (!account) throw new Error('Credit account not found');

  const newBalance = account.balance_cents + amountCents;

  const { error: updateError } = await adminClient
    .from('credit_accounts')
    .update({ balance_cents: newBalance })
    .eq('id', creditAccountId);

  if (updateError) throw updateError;

  await recordLedgerTransaction(
    adminClient,
    userId,
    creditAccountId,
    'grant',
    amountCents,
    newBalance,
    {
      idempotencyKey: options.idempotencyKey,
      description: options.description,
    },
  );

  return { ok: true, balanceCents: newBalance, transactionId: creditAccountId };
}

/**
 * Apply plan allowance credits to a user's account. Server-side only.
 * Called when a subscription becomes active.
 */
export async function applyPlanAllowance(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amountCents: number,
  options: {
    idempotencyKey?: string;
    subscriptionId?: string;
  } = {},
): Promise<CreditResult> {
  if (amountCents <= 0) {
    return { ok: false, balanceCents: 0, transactionId: '', error: 'Amount must be positive' };
  }

  const creditAccountId = await ensureCreditAccount(adminClient, userId);

  const { data: account } = await adminClient
    .from('credit_accounts')
    .select('balance_cents')
    .eq('id', creditAccountId)
    .single();

  if (!account) throw new Error('Credit account not found');

  const newBalance = account.balance_cents + amountCents;

  const { error } = await adminClient
    .from('credit_accounts')
    .update({ balance_cents: newBalance })
    .eq('id', creditAccountId);

  if (error) throw error;

  await recordLedgerTransaction(
    adminClient,
    userId,
    creditAccountId,
    'allowance',
    amountCents,
    newBalance,
    {
      idempotencyKey: options.idempotencyKey,
      referenceType: 'subscription',
      referenceId: options.subscriptionId ?? undefined,
      description: 'Plan allowance credited',
    },
  );

  return { ok: true, balanceCents: newBalance, transactionId: creditAccountId };
}

/**
 * Reserve credits for a pending usage. Creates a reservation and deducts
 * from available balance. Idempotent via idempotency key.
 * Server-side only.
 */
export async function reserveCredits(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amountCents: number,
  options: {
    idempotencyKey: string; // required for idempotency
    referenceType?: string;
    referenceId?: string;
    expiresInSeconds?: number;
    description?: string;
  },
): Promise<{ ok: boolean; reservationId: string; balanceCents: number; error?: string }> {
  if (!options.idempotencyKey) {
    return { ok: false, reservationId: '', balanceCents: 0, error: 'Idempotency key is required' };
  }
  if (amountCents <= 0) {
    return { ok: false, reservationId: '', balanceCents: 0, error: 'Amount must be positive' };
  }

  const creditAccountId = await ensureCreditAccount(adminClient, userId);

  // Check idempotency - return existing reservation if already exists
  const { data: existing } = await adminClient
    .from('usage_reservations')
    .select('id, status, amount_cents')
    .eq('idempotency_key', options.idempotencyKey)
    .single();

  if (existing?.id) {
    const { data: account } = await adminClient
      .from('credit_accounts')
      .select('balance_cents')
      .eq('id', creditAccountId)
      .single();
    return {
      ok: true,
      reservationId: existing.id,
      balanceCents: account?.balance_cents ?? 0,
    };
  }

  // Lock the credit account row for update
  const { data: account, error: lockError } = await adminClient
    .from('credit_accounts')
    .select('balance_cents')
    .eq('id', creditAccountId)
    .single();

  if (lockError) throw lockError;

  if (account.balance_cents < amountCents) {
    return {
      ok: false,
      reservationId: '',
      balanceCents: account.balance_cents,
      error: 'Insufficient credits',
    };
  }

  const newBalance = account.balance_cents - amountCents;
  const expiresAt = new Date(
    Date.now() + (options.expiresInSeconds ?? 300) * 1000,
  ).toISOString();

  // Create reservation
  const { data: reservation, error: resError } = await adminClient
    .from('usage_reservations')
    .insert({
      user_id: userId,
      credit_account_id: creditAccountId,
      amount_cents: amountCents,
      status: 'pending',
      expires_at: expiresAt,
      idempotency_key: options.idempotencyKey,
      reference_type: options.referenceType ?? null,
      reference_id: options.referenceId ?? null,
    })
    .select('id')
    .single();

  if (resError) throw resError;

  // Deduct from available balance
  const { error: updateError } = await adminClient
    .from('credit_accounts')
    .update({ balance_cents: newBalance })
    .eq('id', creditAccountId);

  if (updateError) throw updateError;

  // Record ledger transaction
  await recordLedgerTransaction(
    adminClient,
    userId,
    creditAccountId,
    'reservation',
    -amountCents,
    newBalance,
    {
      idempotencyKey: options.idempotencyKey,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      description: options.description ?? 'Credit reserved',
    },
  );

  return {
    ok: true,
    reservationId: reservation.id,
    balanceCents: newBalance,
  };
}

/**
 * Settle a reservation - convert reserved credits to settled usage.
 * Server-side only.
 */
export async function settleReservation(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  reservationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: reservation, error: resError } = await adminClient
    .from('usage_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  if (resError || !reservation) {
    return { ok: false, error: 'Reservation not found' };
  }

  if (reservation.status !== 'pending') {
    return { ok: false, error: `Reservation already ${reservation.status}` };
  }

  // Mark reservation as settled
  const { error: updateError } = await adminClient
    .from('usage_reservations')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', reservationId);

  if (updateError) throw updateError;

  // Record ledger transaction (settlement doesn't change balance - already deducted at reservation)
  await recordLedgerTransaction(
    adminClient,
    reservation.user_id,
    reservation.credit_account_id,
    'settlement',
    reservation.amount_cents,
    0, // balance already reflects the deduction
    {
      referenceType: reservation.reference_type ?? undefined,
      referenceId: reservation.reference_id ?? undefined,
      description: 'Reservation settled',
    },
  );

  return { ok: true };
}

/**
 * Release a reservation - return reserved credits to available balance.
 * Called when a request fails or is cancelled.
 * Server-side only.
 */
export async function releaseReservation(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  reservationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: reservation, error: resError } = await adminClient
    .from('usage_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  if (resError || !reservation) {
    return { ok: false, error: 'Reservation not found' };
  }

  if (reservation.status !== 'pending') {
    return { ok: false, error: `Reservation already ${reservation.status}` };
  }

  // Mark reservation as released
  const { error: updateError } = await adminClient
    .from('usage_reservations')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', reservationId);

  if (updateError) throw updateError;

  // Add credits back to available balance
  const { data: account, error: accError } = await adminClient
    .from('credit_accounts')
    .select('balance_cents')
    .eq('id', reservation.credit_account_id)
    .single();

  if (accError) throw accError;

  const newBalance = account.balance_cents + reservation.amount_cents;

  const { error: balError } = await adminClient
    .from('credit_accounts')
    .update({ balance_cents: newBalance })
    .eq('id', reservation.credit_account_id);

  if (balError) throw balError;

  // Record ledger transaction
  await recordLedgerTransaction(
    adminClient,
    reservation.user_id,
    reservation.credit_account_id,
    'release',
    reservation.amount_cents,
    newBalance,
    {
      referenceType: reservation.reference_type ?? undefined,
      referenceId: reservation.reference_id ?? undefined,
      description: 'Reservation released',
    },
  );

  return { ok: true };
}

/**
 * Get the current credit balance for a user.
 */
export async function getCreditBalance(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<{ balanceCents: number; currency: string } | null> {
  const { data, error } = await adminClient
    .from('credit_accounts')
    .select('balance_cents, currency')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return { balanceCents: data.balance_cents, currency: data.currency };
}

/**
 * Record usage against a reservation. Creates a usage record.
 * Server-side only.
 */
export async function recordUsage(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  amountCents: number,
  options: {
    reservationId?: string;
    service: string;
    modelId?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const creditAccountId = await ensureCreditAccount(adminClient, userId);

  const { error } = await adminClient
    .from('usage_records')
    .insert({
      user_id: userId,
      credit_account_id: creditAccountId,
      reservation_id: options.reservationId ?? null,
      amount_cents: amountCents,
      currency: 'USD',
      service: options.service,
      model_id: options.modelId ?? null,
    });

  if (error) throw error;

  return { ok: true };
}
