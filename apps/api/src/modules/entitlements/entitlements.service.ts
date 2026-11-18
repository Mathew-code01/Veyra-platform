import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import jwt, { type JwtPayload } from 'jsonwebtoken';

/**
 * Capability identifiers. These are illustrative and configurable;
 * plan definitions are centrally managed (Phase 5).
 */
export const CAPABILITIES = [
  'liveInterview',
  'practice',
  'localInference',
  'cloudInference',
  'vision',
  'documentAnalysis',
  'cloudBackup',
  'advancedModels',
  'priorityCloudExecution',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

// Account access to local inference and practice is independent of the Cloud
// subscription. Cloud entitlements come only from a live Platform subscription.
const FREE_ACCOUNT_FEATURES: Record<Capability, boolean> = {
  liveInterview: false,
  practice: true,
  localInference: true,
  cloudInference: false,
  vision: false,
  documentAnalysis: false,
  cloudBackup: false,
  advancedModels: false,
  priorityCloudExecution: false,
};

interface EntitlementResult {
  entitled: boolean;
  reason?: string;
  expiresAt?: string;
}

/**
 * Check if a user is entitled to a capability.
 * Considers: account status, subscription status (dev fixture), plan features,
 * device authorization, expiration and grace rules.
 */
export async function checkEntitlement(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
  capability: Capability,
): Promise<EntitlementResult> {
  // Check account status
  const { data: profile } = await userClient
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .single();

  if (profile?.status !== 'active') {
    return { entitled: false, reason: 'Account not active' };
  }

  // Check device authorization - user must have at least one authorized device
  const { data: devices } = await userClient
    .from('devices')
    .select('is_authorized')
    .eq('user_id', userId)
    .eq('is_revoked', false);

  const hasAuthorizedDevice = (devices ?? []).some((d) => d.is_authorized);
  if (!hasAuthorizedDevice) {
    return { entitled: false, reason: 'No authorized device' };
  }

  // Resolve entitlements from the authoritative subscription and plan record.
  const { data: subscription, error: subscriptionError } = await userClient
    .from('subscriptions')
    .select('status, current_period_end, plans(features)')
    .eq('user_id', userId)
    .single();

  const noSubscription = subscriptionError?.code === 'PGRST116' || (!subscription && !subscriptionError);
  if (subscriptionError && !noSubscription) {
    return { entitled: false, reason: 'Unable to verify subscription status' };
  }

  let features = FREE_ACCOUNT_FEATURES;
  let expiresAt: string | undefined;
  if (!noSubscription && subscription) {
    const statusAllowsAccess = ['active', 'trialing', 'grace_period'].includes(subscription.status);
    const periodValid = !subscription.current_period_end || new Date(subscription.current_period_end).getTime() > Date.now();
    const planRecord = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    if (statusAllowsAccess && periodValid && planRecord?.features && typeof planRecord.features === 'object') {
      features = { ...FREE_ACCOUNT_FEATURES, ...(planRecord.features as Partial<Record<Capability, boolean>>) };
      expiresAt = subscription.current_period_end ?? undefined;
    }
  }

  if (!features[capability]) {
    return { entitled: false, reason: `Capability ${capability} is not included in the current account entitlement` };
  }

  return { entitled: true, expiresAt };
}

/**
 * Evaluate all entitlements for a user.
 */
export async function listEntitlements(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
): Promise<{ capability: string; entitled: boolean; reason?: string; expiresAt?: string }[]> {
  const results = await Promise.all(
    CAPABILITIES.map(async (cap) => {
      const { entitled, reason, expiresAt } = await checkEntitlement(userClient, userId, cap);
      return { capability: cap, entitled, reason, expiresAt };
    }),
  );
  return results;
}

/**
 * Generate a signed, expiring entitlement snapshot for limited offline use.
 * Limitations: expires after TTL, revoked on device revocation, not a substitute
 * for live entitlement checks.
 */
export async function generateEntitlementSnapshot(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  ttlSeconds: number = 3600,
): Promise<{ snapshot: string; expiresAt: string }> {
  const entitlements = await listEntitlements(
    adminClient as unknown as ReturnType<typeof getSupabaseUser>,
    userId,
  );

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const payload = {
    userId,
    entitlements,
    issuedAt: new Date().toISOString(),
    expiresAt,
  };

  const signingKey = process.env.ENTITLEMENT_SIGNING_KEY ?? 'dev-signing-key-do-not-use-in-production';
  const snapshot = jwt.sign(payload, signingKey, { algorithm: 'HS256' });

  return { snapshot, expiresAt };
}

/**
 * Verify an entitlement snapshot.
 */
export function verifyEntitlementSnapshot(snapshot: string): {
  valid: boolean;
  payload?: {
    userId: string;
    entitlements: Array<{ capability: string; entitled: boolean }>;
    expiresAt: string;
  };
  reason?: string;
} {
  try {
    const signingKey = process.env.ENTITLEMENT_SIGNING_KEY ?? 'dev-signing-key-do-not-use-in-production';
    const decoded = jwt.verify(snapshot, signingKey) as JwtPayload & {
      userId: string;
      entitlements: Array<{ capability: string; entitled: boolean }>;
      expiresAt: string;
    };

    if (new Date(decoded.expiresAt) < new Date()) {
      return { valid: false, reason: 'Snapshot expired' };
    }

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false, reason: 'Invalid snapshot signature' };
  }
}
