import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  AIInvokeRequestV2Schema,
} from '../../../../../packages/contracts/src/index.ts';
import { getSupabaseAdmin, getSupabaseUser } from '../../integrations/supabase/client.js';
import { invokeCloudAI } from './ai-gateway.service.js';
import { authenticateUser } from '../auth/auth.service.js';

const aiGatewayPlugin: FastifyPluginAsync = async (fastify) => {
  // --- Invoke cloud AI ---
  fastify.post(
    '/invoke',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: z.infer<typeof AIInvokeRequestV2Schema>;
      try {
        body = AIInvokeRequestV2Schema.parse(request.body);
      } catch {
        return reply.status(400).send({
          ok: false,
          requestId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
            status: 400,
          },
        });
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);
      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      // Extract device ID from headers (optional)
      const deviceId = request.headers['x-device-id'] as string | undefined;

      try {
        const adminClient = getSupabaseAdmin();
        const userClient = getSupabaseUser(accessToken);
        const result = await invokeCloudAI(adminClient, userClient, user.id, deviceId, {
          modelId: body.modelId,
          capability: body.capability,
          input: body.input,
          consent: body.consent,
          stream: body.stream,
          executionMode: body.executionMode,
          byokProvider: body.byokProvider,
          byokModelId: body.byokModelId,
          maxSpendCents: body.maxSpendCents,
        });

        if (!result.ok) {
          return reply.status(400).send({
            ok: false,
            requestId,
            error: {
              code: 'AI_GATEWAY_ERROR',
              message: result.error ?? 'Cloud AI execution failed',
              status: 400,
            },
          });
        }

        return reply.send({
          ok: true,
          requestId,
          result: result.result,
          modelId: result.modelId,
          capability: result.capability,
          executionMode: result.executionMode,
          billingOwner: result.billingOwner,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          audioSeconds: result.audioSeconds,
          ttsCharacters: result.ttsCharacters,
          visionImages: result.visionImages,
          costCents: result.costCents,
          creditsUsed: result.creditsUsed,
          stream: body.stream,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'AI gateway error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'AI_GATEWAY_ERROR',
            message: 'An unexpected error occurred during cloud AI execution.',
            status: 500,
          },
        });
      }
    }
  );

  // --- List available models ---
  fastify.get(
    '/models',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header.',
            status: 401,
          },
        });
      }

      const accessToken = authHeader.substring(7);
      const user = await authenticateUser(accessToken);
      if (!user) {
        return reply.status(401).send({
          ok: false,
          requestId,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session.',
            status: 401,
          },
        });
      }

      try {
        // Expose deterministic mock models only to automated test environments.
        // Application users must not mistake fixtures for working providers.
        const models = process.env.NODE_ENV === 'test' ? [
          {
            id: 'mock-text-small',
            modelId: 'mock-text-small',
            name: 'Mock Text Small',
            providerId: 'mock',
            providerName: 'Mock AI Provider',
            contextLimit: 4096,
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportsVision: false,
            supportsAudio: false,
            supportsStreaming: false,
            supportsStructuredOutput: false,
            capabilities: ['text_generation', 'summarization'],
            isAvailable: true,
          },
          {
            id: 'mock-text-large',
            modelId: 'mock-text-large',
            name: 'Mock Text Large',
            providerId: 'mock',
            providerName: 'Mock AI Provider',
            contextLimit: 32768,
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportsVision: false,
            supportsAudio: false,
            supportsStreaming: false,
            supportsStructuredOutput: false,
            capabilities: ['text_generation', 'summarization', 'analysis', 'reasoning'],
            isAvailable: true,
          },
          {
            id: 'mock-vision',
            modelId: 'mock-vision',
            name: 'Mock Vision',
            providerId: 'mock',
            providerName: 'Mock AI Provider',
            contextLimit: 16384,
            inputModalities: ['text', 'image'],
            outputModalities: ['text'],
            supportsVision: true,
            supportsAudio: false,
            supportsStreaming: false,
            supportsStructuredOutput: false,
            capabilities: ['vision', 'image_analysis'],
            isAvailable: true,
          },
        ] : [];

        return reply.send({
          ok: true,
          requestId,
          models,
          cloudAIAvailable: false,
          message: 'Managed Cloud AI is not configured on this Platform environment yet.',
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'AI model list error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'AI_MODELS_ERROR',
            message: 'An unexpected error occurred while listing models.',
            status: 500,
          },
        });
      }
    }
  );
};

export default aiGatewayPlugin;
