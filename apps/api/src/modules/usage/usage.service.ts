import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { AIUsageListResponseSchema } from '../../../../../packages/contracts/src/index.ts';

export async function listUsageRecords(userId: string, accessToken: string) {
  const userClient = getSupabaseUser(accessToken);

  // Verify the user exists and owns the data
  const { data: profile } = await userClient
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { ok: false, error: 'USER_NOT_FOUND' as const, usage: [] as any[] };
  }

  // Fetch AI usage log records for the user
  const { data: usageLogs, error } = await userClient
    .from('ai_usage_log')
    .select(`
      id,
      user_id,
      model_id,
      capability,
      tokens_input,
      tokens_output,
      cost_cents,
      created_at
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return { ok: false, error: 'QUERY_ERROR' as const, usage: [] as any[] };
  }

  const usage = (usageLogs ?? []).map((log: any) => ({
    id: log.id,
    userId: log.user_id,
    modelId: log.model_id,
    capability: log.capability,
    executionMode: 'cloud_only' as const,
    billingOwner: 'veyra' as const,
    tokensInput: log.tokens_input,
    tokensOutput: log.tokens_output,
    visionImages: undefined,
    audioSeconds: undefined,
    ttsCharacters: undefined,
    costCents: log.cost_cents ?? 0,
    creditsUsed: Math.ceil((log.cost_cents ?? 0) / 100), // Approximate: 1 credit = $1
    createdAt: log.created_at,
  }));

  const validated = AIUsageListResponseSchema.safeParse({
    ok: true,
    requestId: 'usage_list',
    usage,
  });

  if (!validated.success) {
    return { ok: false, error: 'VALIDATION_ERROR' as const, usage: [] as any[] };
  }

  return { ok: true, usage };
}

export async function getCloudAllowance(userId: string, accessToken: string) {
  const userClient = getSupabaseUser(accessToken);
  const { data: subscription, error } = await userClient.from('subscriptions')
    .select('status, current_period_start, current_period_end, plans(cloud_ai_monthly_cost_limit_cents)')
    .eq('user_id', userId)
    .single();
  if (error?.code === 'PGRST116' || (!subscription && !error)) {
    return { entitled: false, reason: 'No Cloud subscription', limitCents: null, usedCents: 0, remainingCents: null, percentUsed: null, periodStart: null, periodEnd: null };
  }
  if (error || !subscription) throw error ?? new Error('Subscription could not be read');

  const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
  const limitCents = plan?.cloud_ai_monthly_cost_limit_cents;
  const periodStart = subscription.current_period_start;
  const periodEnd = subscription.current_period_end;
  const active = ['active', 'trialing', 'grace_period'].includes(subscription.status)
    && new Date(periodEnd).getTime() > Date.now();
  if (!active || !Number.isInteger(limitCents) || limitCents <= 0 || !periodStart || !periodEnd) {
    return { entitled: false, reason: 'Cloud allowance is unavailable', limitCents: null, usedCents: 0, remainingCents: null, percentUsed: null, periodStart: periodStart ?? null, periodEnd: periodEnd ?? null };
  }

  const { data: usage, error: usageError } = await userClient.from('ai_usage_log')
    .select('cost_cents')
    .eq('user_id', userId)
    .eq('status', 'success')
    .gte('created_at', periodStart)
    .lt('created_at', periodEnd);
  if (usageError) throw usageError;
  const usedCents = (usage ?? []).reduce((total, item) => total + Math.max(0, item.cost_cents ?? 0), 0);
  return {
    entitled: true,
    reason: undefined,
    limitCents,
    usedCents,
    remainingCents: Math.max(0, limitCents - usedCents),
    percentUsed: Math.min(100, Math.round((usedCents / limitCents) * 100)),
    periodStart,
    periodEnd,
  };
}
