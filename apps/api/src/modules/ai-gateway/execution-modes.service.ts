/**
 * AI Execution Modes and Billing Service.
 *
 * Implements five execution configurations with distinct billing rules:
 *
 * 1. Cloud Only: Veyra cloud inference, deduct credits, enforce plan limits
 * 2. Local Only: No Veyra cloud credits charged, local processing only
 * 3. Local Plus Cloud: Prefer local, charge only for cloud operations
 * 4. BYOK Only: User's provider key pays provider directly, no Veyra credits
 * 5. BYOK Plus Local: Local not charged, BYOK not charged
 * 6. BYOK Plus Cloud: Distinguish user-funded BYOK from Veyra-funded cloud
 *
 * BYOK keys are NEVER stored by the platform.
 */

import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

export type ExecutionMode =
  | 'cloud_only'
  | 'local_only'
  | 'local_plus_cloud'
  | 'byok_only'
  | 'byok_plus_local'
  | 'byok_plus_cloud';

export type BillingOwner = 'veyra' | 'user' | 'shared';

export type AIUsageDimension =
  | 'input_tokens'
  | 'output_tokens'
  | 'audio_seconds'
  | 'tts_characters'
  | 'vision_images'
  | 'image_generations'
  | 'screen_understanding';

export interface ExecutionModeConfig {
  mode: ExecutionMode;
  billingOwner: BillingOwner;
  chargesVeyraCredits: boolean;
  chargesUserProvider: boolean;
  description: string;
}

/**
 * Execution mode configurations with billing rules.
 */
export const EXECUTION_MODE_CONFIGS: Record<ExecutionMode, ExecutionModeConfig> = {
  cloud_only: {
    mode: 'cloud_only',
    billingOwner: 'veyra',
    chargesVeyraCredits: true,
    chargesUserProvider: false,
    description: 'Veyra cloud inference only. Credits deducted per usage.',
  },
  local_only: {
    mode: 'local_only',
    billingOwner: 'veyra',
    chargesVeyraCredits: false,
    chargesUserProvider: false,
    description: 'Local processing only. No Veyra cloud credits charged.',
  },
  local_plus_cloud: {
    mode: 'local_plus_cloud',
    billingOwner: 'shared',
    chargesVeyraCredits: true,
    chargesUserProvider: false,
    description: 'Prefer local execution. Charge only for actual cloud operations.',
  },
  byok_only: {
    mode: 'byok_only',
    billingOwner: 'user',
    chargesVeyraCredits: false,
    chargesUserProvider: true,
    description: "User's provider key pays provider directly. No Veyra credits charged.",
  },
  byok_plus_local: {
    mode: 'byok_plus_local',
    billingOwner: 'user',
    chargesVeyraCredits: false,
    chargesUserProvider: true,
    description: 'Local operations not charged. BYOK provider operations not charged by Veyra.',
  },
  byok_plus_cloud: {
    mode: 'byok_plus_cloud',
    billingOwner: 'shared',
    chargesVeyraCredits: true,
    chargesUserProvider: true,
    description: 'Distinguish user-funded BYOK calls from Veyra-funded cloud calls.',
  },
} as const;

/**
 * Get execution mode config.
 */
export function getExecutionModeConfig(mode: ExecutionMode): ExecutionModeConfig {
  return EXECUTION_MODE_CONFIGS[mode];
}

/**
 * Determine billing owner for an execution mode.
 */
export function getBillingOwner(mode: ExecutionMode): BillingOwner {
  return EXECUTION_MODE_CONFIGS[mode].billingOwner;
}

/**
 * Check if Veyra credits should be charged for this execution mode.
 */
export function chargesVeyraCredits(mode: ExecutionMode): boolean {
  return EXECUTION_MODE_CONFIGS[mode].chargesVeyraCredits;
}

/**
 * Check if user provider should be charged for this execution mode.
 */
export function chargesUserProvider(mode: ExecutionMode): boolean {
  return EXECUTION_MODE_CONFIGS[mode].chargesUserProvider;
}

/**
 * Validate that an execution mode is appropriate for the requested capability.
 * Some capabilities may not be available in local-only mode.
 */
export function validateExecutionMode(
  mode: ExecutionMode,
  _capability: string,
  hasLocalCapability: boolean,
): { valid: boolean; reason?: string } {
  // Cloud-only mode always valid for cloud capabilities
  if (mode === 'cloud_only') {
    return { valid: true };
  }

  // Local-only mode requires local capability
  if (mode === 'local_only') {
    if (!hasLocalCapability) {
      return {
        valid: false,
        reason: 'Local-only mode requires local capability for this operation',
      };
    }
    return { valid: true };
  }

  // Local plus cloud: valid if either local or cloud capability exists
  if (mode === 'local_plus_cloud') {
    return { valid: true };
  }

  // BYOK modes: valid if user has BYOK credentials (checked at gateway level)
  if (mode.startsWith('byok')) {
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Calculate credits to charge based on execution mode and usage.
 * For cloud_only and local_plus_cloud with cloud operations: full cost.
 * For local_only and byok_only: 0 credits.
 * For byok_plus_cloud: only Veyra-funded portion.
 */
export function calculateCreditsToCharge(
  mode: ExecutionMode,
  totalCostCents: number,
  veyraFundedPortionCents: number,
): { veyraCredits: number; userCredits: number } {
  switch (mode) {
    case 'cloud_only':
      return { veyraCredits: totalCostCents, userCredits: 0 };

    case 'local_only':
      return { veyraCredits: 0, userCredits: 0 };

    case 'local_plus_cloud':
      return { veyraCredits: totalCostCents, userCredits: 0 };

    case 'byok_only':
      return { veyraCredits: 0, userCredits: 0 };

    case 'byok_plus_local':
      return { veyraCredits: 0, userCredits: 0 };

    case 'byok_plus_cloud':
      return {
        veyraCredits: veyraFundedPortionCents,
        userCredits: totalCostCents - veyraFundedPortionCents,
      };

    default:
      return { veyraCredits: totalCostCents, userCredits: 0 };
  }
}

/**
 * Spend limit configuration for AI usage.
 */
export interface SpendLimitConfig {
  userId: string;
  modelId?: string;
  capability?: string;
  dailyLimitCents: number;
  monthlyLimitCents: number;
}

/**
 * Check if a usage request would exceed spend limits.
 * Server-side only.
 */
export async function checkSpendLimits(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  estimatedCostCents: number,
  _modelId?: string,
  _capability?: string,
): Promise<{ allowed: boolean; reason?: string; dailyUsedCents: number; monthlyUsedCents: number }> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Cloud cost budget follows the user's actual subscription billing period,
  // not the calendar month. No default commercial allowance is granted.
  const { data: subscription, error: subscriptionError } = await adminClient
    .from('subscriptions')
    .select('current_period_start, current_period_end, plans(cloud_ai_monthly_cost_limit_cents)')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'grace_period'])
    .single();

  if (subscriptionError || !subscription) {
    return { allowed: false, reason: 'An active Cloud subscription is required', dailyUsedCents: 0, monthlyUsedCents: 0 };
  }
  const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
  const monthlyLimitCents = plan?.cloud_ai_monthly_cost_limit_cents;
  const periodStart = new Date(subscription.current_period_start);
  const periodEnd = new Date(subscription.current_period_end);
  if (!Number.isInteger(monthlyLimitCents) || monthlyLimitCents <= 0 || !Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodEnd <= now || periodStart > now) {
    return { allowed: false, reason: 'Cloud usage allowance is unavailable for the current billing period', dailyUsedCents: 0, monthlyUsedCents: 0 };
  }

  // Get daily usage
  const { data: dailyUsage } = await adminClient
    .from('ai_usage_log')
    .select('cost_cents')
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString())
    .eq('status', 'success');

  const dailyUsedCents = (dailyUsage ?? []).reduce(
    (sum: number, r: { cost_cents?: number }) => sum + (r.cost_cents || 0),
    0,
  );

  // Get monthly usage
  const { data: monthlyUsage } = await adminClient
    .from('ai_usage_log')
    .select('cost_cents')
    .eq('user_id', userId)
    .gte('created_at', periodStart.toISOString())
    .lt('created_at', periodEnd.toISOString())
    .eq('status', 'success');

  const monthlyUsedCents = (monthlyUsage ?? []).reduce(
    (sum: number, r: { cost_cents?: number }) => sum + (r.cost_cents || 0),
    0,
  );

  if (monthlyUsedCents + estimatedCostCents > monthlyLimitCents) {
    return {
      allowed: false,
      reason: 'Monthly spend limit exceeded',
      dailyUsedCents,
      monthlyUsedCents,
    };
  }

  return {
    allowed: true,
    dailyUsedCents,
    monthlyUsedCents,
  };
}
