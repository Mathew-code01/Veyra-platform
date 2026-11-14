import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';
import {
  getPricingRules,
  createPricingRule,
  updatePricingRule,
  calculateCost,
} from './pricing-engine.service.js';
import { authenticateUser } from '../auth/auth.service.js';
import { hasAdminRole } from '../account/account.service.js';

const pricingEnginePlugin: FastifyPluginAsync = async (fastify) => {
  // --- Get pricing rules (admin) ---
  fastify.get(
    '/admin/pricing-rules',
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

      // Require admin role
      const adminClient = getSupabaseAdmin();
      const hasRole = await hasAdminRole(adminClient, user.id, 'admin');
      if (!hasRole) {
        return reply.status(403).send({
          ok: false,
          requestId,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required.',
            status: 403,
          },
        });
      }

      try {
        const rules = await getPricingRules(adminClient);
        return reply.send({
          ok: true,
          requestId,
          rules,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'pricing rules error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'PRICING_RULES_ERROR',
            message: 'An unexpected error occurred while fetching pricing rules.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Create pricing rule (admin) ---
  fastify.post(
    '/admin/pricing-rules',
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

      // Require admin role
      const adminClient = getSupabaseAdmin();
      const hasRole = await hasAdminRole(adminClient, user.id, 'admin');
      if (!hasRole) {
        return reply.status(403).send({
          ok: false,
          requestId,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required.',
            status: 403,
          },
        });
      }

      let body: {
        modelId?: string;
        providerId?: string;
        modality?: string;
        region?: string;
        inputPricePerUnitCents: number;
        outputPricePerUnitCents: number;
        currency: string;
        effectiveFrom: string;
        effectiveTo?: string;
      };
      try {
        body = z.object({
          modelId: z.string().optional(),
          providerId: z.string().optional(),
          modality: z.string().optional(),
          region: z.string().length(2).optional(),
          inputPricePerUnitCents: z.number().int().nonnegative(),
          outputPricePerUnitCents: z.number().int().nonnegative(),
          currency: z.string().length(3),
          effectiveFrom: z.string().datetime(),
          effectiveTo: z.string().datetime().optional(),
        }).parse(request.body);
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

      try {
        const rule = await createPricingRule(adminClient, body);
        return reply.send({
          ok: true,
          requestId,
          rule,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'create pricing rule error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CREATE_PRICING_RULE_ERROR',
            message: 'An unexpected error occurred while creating pricing rule.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Update pricing rule (admin) ---
  fastify.patch(
    '/admin/pricing-rules/:ruleId',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';
      const { ruleId } = request.params as { ruleId: string };

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

      // Require admin role
      const adminClient = getSupabaseAdmin();
      const hasRole = await hasAdminRole(adminClient, user.id, 'admin');
      if (!hasRole) {
        return reply.status(403).send({
          ok: false,
          requestId,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required.',
            status: 403,
          },
        });
      }

      let body: {
        inputPricePerUnitCents?: number;
        outputPricePerUnitCents?: number;
        isActive?: boolean;
      };
      try {
        body = z.object({
          inputPricePerUnitCents: z.number().int().nonnegative().optional(),
          outputPricePerUnitCents: z.number().int().nonnegative().optional(),
          isActive: z.boolean().optional(),
        }).parse(request.body);
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

      try {
        const rule = await updatePricingRule(adminClient, ruleId, body);
        return reply.send({
          ok: true,
          requestId,
          rule,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'update pricing rule error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'UPDATE_PRICING_RULE_ERROR',
            message: 'An unexpected error occurred while updating pricing rule.',
            status: 500,
          },
        });
      }
    }
  );

  // --- Calculate cost (public for cost estimation) ---
  fastify.post(
    '/calculate-cost',
    async (request, reply) => {
      const requestId = request.id ?? 'unknown';

      let body: {
        modelId?: string;
        providerId?: string;
        modality?: string;
        region?: string;
        inputUnits: number;
        outputUnits: number;
      };
      try {
        body = z.object({
          modelId: z.string().optional(),
          providerId: z.string().optional(),
          modality: z.string().optional(),
          region: z.string().length(2).optional(),
          inputUnits: z.number().int().nonnegative(),
          outputUnits: z.number().int().nonnegative(),
        }).parse(request.body);
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

      try {
        const adminClient = getSupabaseAdmin();
        const cost = await calculateCost(adminClient, {
          modelId: body.modelId,
          providerId: body.providerId,
          modality: body.modality,
          region: body.region,
          inputUnits: body.inputUnits,
          outputUnits: body.outputUnits,
        });
        return reply.send({
          ok: true,
          requestId,
          ...cost,
        });
      } catch (err) {
        request.log.error({ requestId, err }, 'calculate cost error');
        return reply.status(500).send({
          ok: false,
          requestId,
          error: {
            code: 'CALCULATE_COST_ERROR',
            message: 'An unexpected error occurred while calculating cost.',
            status: 500,
          },
        });
      }
    }
  );
};

export default pricingEnginePlugin;
