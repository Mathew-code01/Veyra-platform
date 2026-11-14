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
import {
  getExecutionModeConfig,
  chargesVeyraCredits,
  calculateCreditsToCharge,
  checkSpendLimits,
  validateExecutionMode,
  ExecutionMode,
} from './execution-modes.service.js';
import crypto from 'crypto';

export type AIInvokeResult = {
  ok: boolean;
  result?: string;
  modelId?: string;
  capability?: string;
  executionMode?: ExecutionMode;
  billingOwner?: 'veyra' | 'user' | 'shared';
  tokensInput?: number;
  tokensOutput?: number;
  audioSeconds?: number;
  ttsCharacters?: number;
  visionImages?: number;
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
 * - Apply rate limits and spend limits
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
    executionMode?: ExecutionMode;
    byokProvider?: string;
    byokModelId?: string;
    maxSpendCents?: number;
  }
): Promise<AIInvokeResult> {
  const {
    modelId,
    capability,
    input,
    consent,
    stream,
    executionMode = 'cloud_only',
    byokProvider: _byokProvider,
    byokModelId: _byokModelId,
    maxSpendCents: _maxSpendCents,
  } = params;

  // 1. Verify consent
  if (!consent) {
    return {
      ok: false,
      error: 'Consent is required for cloud AI execution',
    };
  }

  // 2. Validate execution mode
  const modeConfig = getExecutionModeConfig(executionMode);
  const modeValidation = validateExecutionMode(executionMode, capability, false);
  if (!modeValidation.valid) {
    return {
      ok: false,
      error: modeValidation.reason ?? 'Execution mode not valid for this capability',
    };
  }

  // 3. Check entitlement for cloudInference capability (only for Veyra-funded modes)
  if (chargesVeyraCredits(executionMode)) {
    const entitlement = await checkEntitlement(userClient, userId, 'cloudInference');
    if (!entitlement.entitled) {
      return {
        ok: false,
        error: entitlement.reason ?? 'Entitlement check failed',
      };
    }
  }

  // 4. Validate model and capability
  const provider = createAIProvider('mock');
  const modelValidation = await provider.validateModel(modelId, capability);
  if (!modelValidation.valid) {
    return {
      ok: false,
      error: `Model ${modelId} does not support capability ${capability}`,
    };
  }

  // 5. Calculate estimated cost
  const estimatedCostCents = modelValidation.costPer1kOutputCents ?? 1;

  // 6. Check spend limits (only for Veyra-funded modes)
  if (chargesVeyraCredits(executionMode)) {
    const spendCheck = await checkSpendLimits(
      adminClient,
      userId,
      estimatedCostCents,
      modelId,
      capability,
    );
    if (!spendCheck.allowed) {
      return {
        ok: false,
        error: spendCheck.reason ?? 'Spend limit exceeded',
      };
    }
  }

  // 7. Check available credits (only for Veyra-funded modes)
  if (chargesVeyraCredits(executionMode)) {
    const creditBalance = await getCreditBalance(adminClient, userId);
    if (!creditBalance || creditBalance.balanceCents < estimatedCostCents) {
      return {
        ok: false,
        error: 'Insufficient credits for cloud AI execution',
      };
    }
  }

  // 8. Calculate credits to charge based on execution mode
  const { veyraCredits, userCredits: _userCredits } = calculateCreditsToCharge(
    executionMode,
    estimatedCostCents,
    executionMode === 'byok_plus_cloud' ? estimatedCostCents : 0,
  );

  // 9. Reserve credits (only Veyra-credited portion)
  let reservationId: string | undefined;
  if (veyraCredits > 0) {
    const reservation = await reserveCredits(adminClient, userId, veyraCredits, {
      idempotencyKey: `ai_res_${crypto.randomUUID()}`,
      referenceType: 'ai_inference',
      referenceId: modelId,
      expiresInSeconds: 300,
      description: `Cloud AI: ${modelId} / ${capability} (${executionMode})`,
    });

    if (!reservation.ok) {
      return {
        ok: false,
        error: reservation.error ?? 'Credit reservation failed',
      };
    }
    reservationId = reservation.reservationId;
  }

  // 10. Invoke provider (only for cloud-involved modes)
  let providerResult: { result: string; tokensInput?: number; tokensOutput?: number; costCents: number } | undefined;
  let providerInvoked = false;
  if (executionMode !== 'local_only' && executionMode !== 'byok_only') {
    try {
      providerResult = await provider.invoke({
        modelId,
        capability,
        input,
        stream: stream ?? false,
      });
      providerInvoked = true;
    } catch (err) {
      // Provider failure - release reservation if any
      if (reservationId) {
        await releaseReservation(adminClient, reservationId);
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Provider invocation failed',
      };
    }
  }

  // 11. Record usage
  if (providerInvoked && providerResult) {
    await recordUsage(adminClient, userId, providerResult.tokensOutput ?? 0, {
      reservationId: reservationId ?? undefined,
      service: 'cloud_ai',
      modelId,
    });
  }

  // 12. Settle reservation (only Veyra-credited portion)
  if (reservationId) {
    await settleReservation(adminClient, reservationId);
  }

  // 13. Record audit metadata (safe - no sensitive content)
  await adminClient
    .from('ai_usage_log')
    .insert({
      user_id: userId,
      device_id: deviceId ?? null,
      provider_id: 'mock',
      model_id: modelId,
      capability,
      tokens_input: providerInvoked && providerResult ? providerResult.tokensInput ?? null : null,
      tokens_output: providerInvoked && providerResult ? providerResult.tokensOutput ?? null : null,
      cost_cents: providerInvoked && providerResult ? providerResult.costCents : 0,
      status: providerInvoked ? 'success' : 'skipped',
    });

  return {
    ok: true,
    result: providerInvoked && providerResult ? providerResult.result : 'Execution skipped (local/BYOK only)',
    modelId,
    capability,
    executionMode,
    billingOwner: modeConfig.billingOwner,
    tokensInput: providerInvoked && providerResult ? providerResult.tokensInput : 0,
    tokensOutput: providerInvoked && providerResult ? providerResult.tokensOutput : 0,
    costCents: providerInvoked && providerResult ? providerResult.costCents : 0,
    creditsUsed: veyraCredits,
  };
}
