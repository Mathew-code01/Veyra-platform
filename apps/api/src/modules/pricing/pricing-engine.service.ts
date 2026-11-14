/**
 * Pricing Engine Service.
 *
 * Provides configurable pricing rules by model, provider, modality, and region.
 * Prices are stored in the database and can be updated administratively without
 * code changes. No hardcoded prices.
 *
 * All monetary amounts are in the smallest currency unit (cents, kobo, etc.).
 */

import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

export interface PricingRule {
  id: string;
  modelId: string | null;
  providerId: string | null;
  modality: string | null;
  region: string | null;
  inputPricePerUnitCents: number;
  outputPricePerUnitCents: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

/**
 * Get pricing rules, optionally filtered by model, provider, modality, region.
 */
export async function getPricingRules(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  filters?: {
    modelId?: string;
    providerId?: string;
    modality?: string;
    region?: string;
    isActive?: boolean;
  },
): Promise<PricingRule[]> {
  let query = adminClient.from('pricing_rules').select('*');

  if (filters?.modelId) query = query.eq('model_id', filters.modelId);
  if (filters?.providerId) query = query.eq('provider_id', filters.providerId);
  if (filters?.modality) query = query.eq('modality', filters.modality);
  if (filters?.region) query = query.eq('region', filters.region);
  if (filters?.isActive !== undefined) query = query.eq('is_active', filters.isActive);

  query = query.order('effective_from', { ascending: false });

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    modelId: r.model_id,
    providerId: r.provider_id,
    modality: r.modality,
    region: r.region,
    inputPricePerUnitCents: r.input_price_per_unit_cents,
    outputPricePerUnitCents: r.output_price_per_unit_cents,
    currency: r.currency,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    isActive: r.is_active,
  }));
}

/**
 * Create a pricing rule.
 * Server-side only - requires admin role.
 */
export async function createPricingRule(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  rule: {
    modelId?: string;
    providerId?: string;
    modality?: string;
    region?: string;
    inputPricePerUnitCents: number;
    outputPricePerUnitCents: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string;
  },
): Promise<PricingRule> {
  const { data, error } = await adminClient
    .from('pricing_rules')
    .insert({
      model_id: rule.modelId ?? null,
      provider_id: rule.providerId ?? null,
      modality: rule.modality ?? null,
      region: rule.region ?? null,
      input_price_per_unit_cents: rule.inputPricePerUnitCents,
      output_price_per_unit_cents: rule.outputPricePerUnitCents,
      currency: rule.currency,
      effective_from: rule.effectiveFrom,
      effective_to: rule.effectiveTo ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    modelId: data.model_id,
    providerId: data.provider_id,
    modality: data.modality,
    region: data.region,
    inputPricePerUnitCents: data.input_price_per_unit_cents,
    outputPricePerUnitCents: data.output_price_per_unit_cents,
    currency: data.currency,
    effectiveFrom: data.effective_from,
    effectiveTo: data.effective_to,
    isActive: data.is_active,
  };
}

/**
 * Update a pricing rule.
 * Server-side only - requires admin role.
 */
export async function updatePricingRule(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  ruleId: string,
  updates: {
    inputPricePerUnitCents?: number;
    outputPricePerUnitCents?: number;
    isActive?: boolean;
  },
): Promise<PricingRule> {
  const updateData: Record<string, unknown> = {};

  if (updates.inputPricePerUnitCents !== undefined) {
    updateData.input_price_per_unit_cents = updates.inputPricePerUnitCents;
  }
  if (updates.outputPricePerUnitCents !== undefined) {
    updateData.output_price_per_unit_cents = updates.outputPricePerUnitCents;
  }
  if (updates.isActive !== undefined) {
    updateData.is_active = updates.isActive;
  }

  const { data, error } = await adminClient
    .from('pricing_rules')
    .update(updateData)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    modelId: data.model_id,
    providerId: data.provider_id,
    modality: data.modality,
    region: data.region,
    inputPricePerUnitCents: data.input_price_per_unit_cents,
    outputPricePerUnitCents: data.output_price_per_unit_cents,
    currency: data.currency,
    effectiveFrom: data.effective_from,
    effectiveTo: data.effective_to,
    isActive: data.is_active,
  };
}

/**
 * Get pricing for a specific model/capability combination.
 * Returns the most specific matching rule (model > provider > modality > region).
 */
export async function getPriceForModel(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  params: {
    modelId?: string;
    providerId?: string;
    modality?: string;
    region?: string;
  },
): Promise<{
  pricePerInputUnitCents: number;
  pricePerOutputUnitCents: number;
  currency: string;
  ruleId: string | null;
} | null> {
  // Try exact match: model + provider + modality + region
  const { data: exactMatch } = await adminClient
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)
    .eq('model_id', params.modelId ?? '')
    .eq('provider_id', params.providerId ?? '')
    .eq('modality', params.modality ?? '')
    .eq('region', params.region ?? '')
    .order('effective_from', { ascending: false })
    .limit(1);

  if (exactMatch && exactMatch.length > 0) {
    const r = exactMatch[0];
    return {
      pricePerInputUnitCents: r.input_price_per_unit_cents,
      pricePerOutputUnitCents: r.output_price_per_unit_cents,
      currency: r.currency,
      ruleId: r.id,
    };
  }

  // Try model + provider + modality
  const { data: match2 } = await adminClient
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)
    .eq('model_id', params.modelId ?? '')
    .eq('provider_id', params.providerId ?? '')
    .eq('modality', params.modality ?? '')
    .order('effective_from', { ascending: false })
    .limit(1);

  if (match2 && match2.length > 0) {
    const r = match2[0];
    return {
      pricePerInputUnitCents: r.input_price_per_unit_cents,
      pricePerOutputUnitCents: r.output_price_per_unit_cents,
      currency: r.currency,
      ruleId: r.id,
    };
  }

  // Try model only
  const { data: match3 } = await adminClient
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)
    .eq('model_id', params.modelId ?? '')
    .order('effective_from', { ascending: false })
    .limit(1);

  if (match3 && match3.length > 0) {
    const r = match3[0];
    return {
      pricePerInputUnitCents: r.input_price_per_unit_cents,
      pricePerOutputUnitCents: r.output_price_per_unit_cents,
      currency: r.currency,
      ruleId: r.id,
    };
  }

  return null;
}

/**
 * Calculate cost for AI usage based on pricing rules.
 */
export async function calculateCost(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  params: {
    modelId?: string;
    providerId?: string;
    modality?: string;
    region?: string;
    inputUnits: number;
    outputUnits: number;
  },
): Promise<{
  totalCostCents: number;
  inputCostCents: number;
  outputCostCents: number;
  currency: string;
  ruleId: string | null;
}> {
  const pricing = await getPriceForModel(adminClient, {
    modelId: params.modelId,
    providerId: params.providerId,
    modality: params.modality,
    region: params.region,
  });

  if (!pricing) {
    return {
      totalCostCents: 0,
      inputCostCents: 0,
      outputCostCents: 0,
      currency: 'USD',
      ruleId: null,
    };
  }

  const inputCostCents = Math.round(
    (params.inputUnits * pricing.pricePerInputUnitCents) / 1000,
  );
  const outputCostCents = Math.round(
    (params.outputUnits * pricing.pricePerOutputUnitCents) / 1000,
  );

  return {
    totalCostCents: inputCostCents + outputCostCents,
    inputCostCents,
    outputCostCents,
    currency: pricing.currency,
    ruleId: pricing.ruleId,
  };
}
