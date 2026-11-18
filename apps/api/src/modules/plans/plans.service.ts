import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Get all active plans from the catalogue.
 * Plans are centrally managed and versionable (Phase 5+).
 * Sample records are marked as development fixtures.
 */
export async function listPlans(userClient: ReturnType<typeof getSupabaseUser>) {
  const { data, error } = await userClient
    .from('plans')
    .select('id, name, family, description, billing_interval, price_cents, currency, features, device_limit, is_active, is_published, is_dev_fixture, cloud_ai_monthly_cost_limit_cents, created_at')
    .eq('is_active', true)
    .eq('is_published', true)
    .eq('is_dev_fixture', false)
    .eq('family', 'cloud')
    .order('price_cents', { ascending: true });

  if (error) throw error;

  return {
    plans: (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      family: p.family,
      description: p.description ?? undefined,
      billingInterval: p.billing_interval,
      priceCents: p.price_cents,
      currency: p.currency,
      features: p.features as Record<string, boolean>,
      deviceLimit: p.device_limit,
      isActive: p.is_active,
      isPublished: p.is_published,
      isDevFixture: p.is_dev_fixture,
      cloudAiMonthlyCostLimitCents: p.cloud_ai_monthly_cost_limit_cents ?? null,
      createdAt: p.created_at,
    })),
  };
}

/**
 * Get a single plan by ID.
 */
export async function getPlan(userClient: ReturnType<typeof getSupabaseUser>, planId: string) {
  const { data, error } = await userClient
    .from('plans')
    .select('id, name, family, description, billing_interval, price_cents, currency, features, device_limit, is_active, is_published, is_dev_fixture, cloud_ai_monthly_cost_limit_cents, created_at')
    .eq('id', planId)
    .eq('is_active', true)
    .eq('is_published', true)
    .eq('is_dev_fixture', false)
    .eq('family', 'cloud')
    .single();

  if (error) throw error;

  return {
    plan: {
      id: data.id,
      name: data.name,
      family: data.family,
      description: data.description ?? undefined,
      billingInterval: data.billing_interval,
      priceCents: data.price_cents,
      currency: data.currency,
      features: data.features as Record<string, boolean>,
      deviceLimit: data.device_limit,
      isActive: data.is_active,
      isPublished: data.is_published,
      isDevFixture: data.is_dev_fixture,
      cloudAiMonthlyCostLimitCents: data.cloud_ai_monthly_cost_limit_cents ?? null,
      createdAt: data.created_at,
    },
  };
}

/**
 * Seed development plans into the catalogue.
 * Only callable via trusted server code with service_role.
 * These are DEVELOPMENT FIXTURES ONLY - not commercially finalized.
 */
export async function seedDevPlans(adminClient: ReturnType<typeof getSupabaseAdmin>) {
  const devPlans = [
    {
      name: 'Local',
      family: 'local',
      description: 'Local-only plan for desktop use without cloud features',
      billing_interval: 'monthly',
      price_cents: 0,
      currency: 'USD',
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
      device_limit: 1,
      is_dev_fixture: true,
    },
    {
      name: 'Hybrid',
      family: 'hybrid',
      description: 'Hybrid plan with local and cloud features',
      billing_interval: 'monthly',
      price_cents: 999,
      currency: 'USD',
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
      device_limit: 3,
      is_dev_fixture: true,
    },
    {
      name: 'Cloud',
      family: 'cloud',
      description: 'Full cloud plan with all features',
      billing_interval: 'monthly',
      price_cents: 1999,
      currency: 'USD',
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
      device_limit: 10,
      is_dev_fixture: true,
    },
  ] as const;

  for (const plan of devPlans) {
    const { error } = await adminClient
      .from('plans')
      .upsert(plan as any, { onConflict: 'name, family, billing_interval' });

    if (error) throw error;
  }

  return { seeded: devPlans.length };
}
