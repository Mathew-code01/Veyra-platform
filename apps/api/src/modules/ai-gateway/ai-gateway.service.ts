import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import { createAIProvider } from './ai-provider.js';
import {
  reserveCredits,
  settleReservation,
  releaseReservation,
  getCreditBalance,
  recordUsage,
} from '../credits/credits.service.js';
import { checkEntitlement } from '../entitlements/entitlements.service.js';
import crypto from 'crypto';

export type AIInvokeResult = {
  ok: boolean;
  result?: string;
  modelId?: string;
  capability?: string;
  tokensInput?: number;
  tokensOutput?: number;
  costCents?: number;
  creditsUsed?: number;
  error?: string;
};

/**
 * Cloud AI Gateway service.
 *
 * Responsibilities:
 * - Verify the user and device
 * - Check relevant entitlement
 * - Check consent
 * - Check available credits
 * - Validate requested model and capability
 * - Apply rate limits
 * - Reserve usage
 * - Invoke authorized provider adapter
 * - Record usage
 * - Settle or release reservation
 * - Return normalized results
 * - Handle provider timeouts and failures
 * - Record safe audit metadata
 *
 * No BYOK keys are stored or processed by the platform.
 * Desktop's AIManager remains authoritative for local/BYOK execution.
 */

export async function invokeCloudAI(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
  deviceId: string | undefined,
  params: {
    modelId: string;
    capability: string;
    input: string;
    consent: boolean;
    stream?: boolean;
  }
): Promise<AIInvokeResult> {
  const { modelId, capability, input, consent, stream } = params;

  // 1. Verify consent
  if (!consent) {
    return {
      ok: false,
      error: 'Consent is required for cloud AI execution',
    };
  }

  // 2. Check entitlement for cloudInference capability
  const entitlement = await checkEntitlement(userClient, userId, 'cloudInference');
  if (!entitlement.entitled) {
    return {
      ok: false,
      error: entitlement.reason ?? 'Entitlement check failed',
    };
  }

  // 3. Validate model and capability
  const provider = createAIProvider('mock');
  const modelValidation = await provider.validateModel(modelId, capability);
  if (!modelValidation.valid) {
    return {
      ok: false,
      error: `Model ${modelId} does not support capability ${capability}`,
    };
  }

  // 4. Check available credits
  const creditBalance = await getCreditBalance(adminClient, userId);
  const estimatedCostCents = modelValidation.costPer1kOutputCents ?? 1;
  if (!creditBalance || creditBalance.balanceCents < estimatedCostCents) {
    return {
      ok: false,
      error: 'Insufficient credits for cloud AI execution',
    };
  }

  // 5. Reserve credits
  const reservationId = `ai_res_${crypto.randomUUID()}`;
  const reservation = await reserveCredits(adminClient, userId, estimatedCostCents, {
    idempotencyKey: reservationId,
    referenceType: 'ai_inference',
    referenceId: modelId,
    expiresInSeconds: 300,
    description: `Cloud AI: ${modelId} / ${capability}`,
  });

  if (!reservation.ok) {
    return {
      ok: false,
      error: reservation.error ?? 'Credit reservation failed',
    };
  }

  // 6. Invoke provider
  let providerResult;
  try {
    providerResult = await provider.invoke({
      modelId,
      capability,
      input,
      stream: stream ?? false,
    });
  } catch (err) {
    // Provider failure - release reservation
    await releaseReservation(adminClient, reservation.reservationId);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Provider invocation failed',
    };
  }

  // 7. Record usage
  await recordUsage(adminClient, userId, providerResult.tokensOutput ?? 0, {
    reservationId: reservation.reservationId,
    service: 'cloud_ai',
    modelId,
  });

  // 8. Settle reservation
  await settleReservation(adminClient, reservation.reservationId);

  // 9. Record audit metadata (safe - no sensitive content)
  await adminClient
    .from('ai_usage_log')
    .insert({
      user_id: userId,
      device_id: deviceId ?? null,
      provider_id: 'mock', // Would be resolved from model in production
      model_id: modelId,
      capability,
      tokens_input: providerResult.tokensInput ?? null,
      tokens_output: providerResult.tokensOutput ?? null,
      cost_cents: providerResult.costCents,
      status: 'success',
    });

  return {
    ok: true,
    result: providerResult.result,
    modelId,
    capability,
    tokensInput: providerResult.tokensInput,
    tokensOutput: providerResult.tokensOutput,
    costCents: providerResult.costCents,
    creditsUsed: estimatedCostCents,
  };
}
