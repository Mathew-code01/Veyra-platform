/**
 * Monthly credit allocation service.
 *
 * Implements a billing-cycle model for subscription-based credit allowances.
 * At the start of each eligible billing cycle, the plan's configured monthly
 * cloud credits are allocated to the user's account.
 *
 * Key distinctions:
 * - Monthly subscription allowances expire at end of cycle (unless policy says otherwise)
 * - Separately purchased top-up credits do NOT expire unless explicitly configured
 * - All allocations are recorded in the credit ledger with idempotency
 */

import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { applyPlanAllowance } from '../credits/credits.service.js';

export type BillingInterval = 'monthly' | 'yearly';

export interface PlanCreditConfig {
  planId: string;
  planName: string;
  planFamily: string;
  monthlyCreditAllowance: number; // in cents (credit units)
  billingInterval: BillingInterval;
  creditExpiryDays: number; // days after which unused monthly credits expire
  trialDays: number; // trial period days
  deviceLimit: number;
}

/**
 * Development plan configurations with monthly credit allowances.
 * These are DEVELOPMENT FIXTURES - not commercially finalized.
 */
export const DEV_PLAN_CREDIT_CONFIGS: PlanCreditConfig[] = [
  {
    planId: 'dev-plan-local',
    planName: 'Local',
    planFamily: 'local',
    monthlyCreditAllowance: 0, // No cloud credits for local-only plan
    billingInterval: 'monthly',
    creditExpiryDays: 30,
    trialDays: 0,
    deviceLimit: 1,
  },
  {
    planId: 'dev-plan-hybrid',
    planName: 'Hybrid',
    planFamily: 'hybrid',
    monthlyCreditAllowance: 10000, // $100 worth of cloud credits
    billingInterval: 'monthly',
    creditExpiryDays: 30,
    trialDays: 14,
    deviceLimit: 3,
  },
  {
    planId: 'dev-plan-cloud',
    planName: 'Cloud',
    planFamily: 'cloud',
    monthlyCreditAllowance: 25000, // $250 worth of cloud credits
    billingInterval: 'monthly',
    creditExpiryDays: 30,
    trialDays: 30,
    deviceLimit: 10,
  },
] as const;

/**
 * Get credit config for a plan.
 */
export function getPlanCreditConfig(planId: string): PlanCreditConfig | null {
  return DEV_PLAN_CREDIT_CONFIGS.find((c) => c.planId === planId) ?? null;
}

/**
 * Allocate monthly credits to all active subscriptions.
 * This should be called via a scheduled job (cron) at the start of each billing cycle.
 * Server-side only.
 */
export async function allocateMonthlyCredits(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
): Promise<{
  allocated: number;
  skipped: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  // Get all active subscriptions
  const { data: subscriptions, error } = await adminClient
    .from('subscriptions')
    .select('id, user_id, plan_id, billing_interval, current_period_start, current_period_end, status')
    .eq('status', 'active');

  if (error) throw error;

  let allocated = 0;
  let skipped = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const sub of subscriptions ?? []) {
    try {
      const config = getPlanCreditConfig(sub.plan_id);
      if (!config || config.monthlyCreditAllowance <= 0) {
        skipped++;
        continue;
      }

      // Check if we've already allocated for this billing cycle
      // by looking for a recent allowance transaction
      const periodStart = new Date(sub.current_period_start);
      const now = new Date();

      // Only allocate if we're at the start of a new period
      const periodStartMs = periodStart.getTime();
      const nowMs = now.getTime();
      const hoursSincePeriodStart = (nowMs - periodStartMs) / (1000 * 60 * 60);

      // Allocate if within 24 hours of period start (or if period just started)
      if (hoursSincePeriodStart > 24 && hoursSincePeriodStart < 0) {
        // Not in allocation window
        skipped++;
        continue;
      }

      const idempotencyKey = `monthly_allowance_${sub.user_id}_${sub.plan_id}_${Math.floor(periodStartMs / (1000 * 60 * 60 * 24))}`;

      const result = await applyPlanAllowance(adminClient, sub.user_id, config.monthlyCreditAllowance, {
        idempotencyKey,
        subscriptionId: sub.id,
      });

      if (result.ok) {
        allocated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({
        userId: sub.user_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { allocated, skipped, errors };
}

/**
 * Expire unused monthly allowances for subscriptions whose period has ended.
 * Server-side only.
 */
export async function expireMonthlyAllowances(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
): Promise<{
  expired: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const now = new Date();

  // Get subscriptions whose period has ended but still have active status
  const { data: subscriptions, error } = await adminClient
    .from('subscriptions')
    .select('id, user_id, plan_id, current_period_end, status')
    .eq('status', 'active')
    .lt('current_period_end', now.toISOString());

  if (error) throw error;

  let expired = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const sub of subscriptions ?? []) {
    try {
      const config = getPlanCreditConfig(sub.plan_id);
      if (!config || config.monthlyCreditAllowance <= 0) {
        continue;
      }

      // Get user's credit account
      const { data: account } = await adminClient
        .from('credit_accounts')
        .select('id, balance_cents')
        .eq('user_id', sub.user_id)
        .single();

      if (!account) continue;

      // Calculate how much of the balance is from monthly allowance
      // (This is simplified - in production, we'd track allowance balance separately)
      const allowanceBalance = Math.min(account.balance_cents, config.monthlyCreditAllowance);

      if (allowanceBalance > 0) {
        // Expire the unused allowance
        const newBalance = account.balance_cents - allowanceBalance;

        const { error: updateError } = await adminClient
          .from('credit_accounts')
          .update({ balance_cents: newBalance })
          .eq('id', account.id);

        if (updateError) throw updateError;

        // Record expiration in ledger
        const { error: ledgerError } = await adminClient
          .from('credit_ledger_transactions')
          .insert({
            user_id: sub.user_id,
            credit_account_id: account.id,
            type: 'expiration',
            amount_cents: -allowanceBalance,
            balance_after_cents: newBalance,
            reference_type: 'subscription',
            reference_id: sub.id,
            description: `Monthly allowance expired for period ending ${sub.current_period_end}`,
          });

        if (ledgerError) throw ledgerError;

        expired++;
      }
    } catch (err) {
      errors.push({
        userId: sub.user_id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { expired, errors };
}

/**
 * Get the billing cycle dates for a subscription.
 */
export function getBillingCycle(
  planId: string,
  billingInterval: BillingInterval,
  startDate: Date,
): { periodStart: Date; periodEnd: Date } {
  const config = getPlanCreditConfig(planId);
  if (!config) {
    throw new Error(`No credit config for plan ${planId}`);
  }

  const periodStart = new Date(startDate);
  const periodEnd = new Date(startDate);

  if (billingInterval === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (billingInterval === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  return { periodStart, periodEnd };
}

/**
 * Check if a user is within their trial period.
 */
export function isWithinTrial(
  trialStart: Date | null,
  trialEnd: Date | null,
  trialDays: number,
): { inTrial: boolean; daysRemaining: number } {
  if (!trialStart || !trialEnd || trialDays <= 0) {
    return { inTrial: false, daysRemaining: 0 };
  }

  const now = new Date();
  const trialEndDate = new Date(trialEnd);

  if (now > trialEndDate) {
    return { inTrial: false, daysRemaining: 0 };
  }

  const daysRemaining = Math.ceil(
    (trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { inTrial: true, daysRemaining: Math.max(0, daysRemaining) };
}
