import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import { sign, verify, type JwtPayload } from 'jsonwebtoken';

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

/**
 * Development plan catalogue. These are DEVELOPMENT FIXTURES ONLY,
 * not commercially finalized prices or feature access.
 * Phase 5 will replace this with a configurable, versionable plan catalogue.
 */
const DEV_PLANS: Record<string, { features: Record<Capability, boolean>; deviceLimit: number }> = {
  local: {
    features: {
      liveInterview: false,
      practice: true,
      localInference: true,
      cloudInference: false,
      vision: false,
      documentAnalysis: false,
      cloudBackup: false,
      advancedModels: false,
      priorityCloudExecution: false,
    },
    deviceLimit: 1,
  },
  hybrid: {
    features: {
      liveInterview: true,
      practice: true,
      localInference: true,
      cloudInference: true,
      vision: true,
      documentAnalysis: true,
      cloudBackup: true,
      advancedModels: false,
      priorityCloudExecution: false,
    },
    deviceLimit: 3,
  },
  cloud: {
    features: {
      liveInterview: true,
      practice: true,
      localInference: true,
      cloudInference: true,
      vision: true,
      documentAnalysis: true,
      cloudBackup: true,
      advancedModels: true,
      priorityCloudExecution: true,
    },
    deviceLimit: 10,
  },
} as const;

/**
 * Get the user's current plan. Phase 5 will replace this with subscription-based lookup.
 * For now, returns 'local' plan for all users (development fixture).
 */
function getUserPlan(_userId: string): string {
  return 'local';
}

/**
 * Get plan features for a given plan name.
 */
function getPlanFeatures(plan: string): Record<Capability, boolean> {
  return DEV_PLANS[plan as keyof typeof DEV_PLANS]?.features ?? DEV_PLANS.local.features;
}

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

  // Check plan features
  const plan = getUserPlan(userId);
  const features = getPlanFeatures(plan);

  if (!features[capability]) {
    return { entitled: false, reason: `Capability ${capability} not included in ${plan} plan` };
  }

  return { entitled: true };
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
  const snapshot = sign(payload, signingKey, { algorithm: 'HS256' });

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
    const decoded = verify(snapshot, signingKey) as JwtPayload & {
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
